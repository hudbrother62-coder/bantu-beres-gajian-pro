import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method tidak diizinkan." }, 405);

  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) return json({ error: "Sesi tidak ditemukan." }, 401);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return json({ error: "Sesi tidak valid." }, 401);

    const { data: caller } = await admin
      .from("profiles")
      .select("company_id, role, is_active")
      .eq("id", authData.user.id)
      .maybeSingle();
    if (!caller?.is_active || caller.role !== "owner") return json({ error: "Hanya Owner yang dapat membuat akun tim." }, 403);

    const { fullName, username, password, role, jobTitle, employeeId, employeeCode, department, position } = await req.json();
    const normalizedUsername = String(username || "").trim().toLowerCase();
    const allowedRoles = ["hr_admin", "finance", "supervisor", "employee"];
    if (!fullName || !normalizedUsername || !password || !allowedRoles.includes(role)) {
      if (!employeeId) return json({ error: "Data anggota tim belum lengkap." }, 400);
    }
    if (!/^[a-z0-9._-]{4,30}$/.test(normalizedUsername) || String(password).length < 8) {
      return json({ error: "Username atau password belum memenuhi ketentuan." }, 400);
    }
    const { data: existing } = await admin.from("profiles").select("id").eq("username", normalizedUsername).maybeSingle();
    if (existing) return json({ error: "Username sudah digunakan." }, 409);

    let linkedEmployee: {
      id: string;
      full_name: string;
      email: string | null;
      phone: string | null;
      department: string | null;
      position: string | null;
      profile_id: string | null;
    } | null = null;
    if (employeeId) {
      const { data: employee, error: employeeError } = await admin
        .from("employees")
        .select("id, full_name, email, phone, department, position, profile_id")
        .eq("id", String(employeeId))
        .eq("company_id", caller.company_id)
        .eq("is_active", true)
        .maybeSingle();
      if (employeeError || !employee) return json({ error: "Karyawan aktif tidak ditemukan." }, 404);
      if (employee.profile_id) return json({ error: "Karyawan ini sudah terhubung ke akun tim lain." }, 409);
      linkedEmployee = employee;
    }

    const resolvedFullName = String(linkedEmployee?.full_name || fullName).trim();
    if (!resolvedFullName) return json({ error: "Nama anggota tim belum lengkap." }, 400);

    const teamEmail = `${normalizedUsername}@team.bantuberes.local`;
    const { data: member, error: userError } = await admin.auth.admin.createUser({
      email: teamEmail,
      password: String(password),
      email_confirm: true,
      user_metadata: { full_name: resolvedFullName },
    });
    if (userError || !member.user) return json({ error: userError?.message || "Akun tim tidak dapat dibuat." }, 400);

    const { error: profileError } = await admin.from("profiles").insert({
      id: member.user.id,
      company_id: caller.company_id,
      full_name: resolvedFullName,
      username: normalizedUsername,
      role,
      job_title: String(jobTitle || linkedEmployee?.position || position || "").trim() || null,
      phone: linkedEmployee?.phone || null,
    });
    if (profileError) {
      await admin.auth.admin.deleteUser(member.user.id);
      return json({ error: "Profil anggota tim tidak dapat dibuat." }, 500);
    }

    if (linkedEmployee) {
      const { error: linkError } = await admin
        .from("employees")
        .update({ profile_id: member.user.id })
        .eq("id", linkedEmployee.id)
        .eq("company_id", caller.company_id)
        .is("profile_id", null);
      if (linkError) {
        await admin.from("profiles").delete().eq("id", member.user.id);
        await admin.auth.admin.deleteUser(member.user.id);
        return json({ error: "Akun dibuat, tetapi belum bisa dihubungkan ke data karyawan." }, 500);
      }
    } else if (role === "employee") {
      const code = String(employeeCode || normalizedUsername).trim().toUpperCase();
      const { error: employeeError } = await admin.from("employees").insert({
        company_id: caller.company_id,
        profile_id: member.user.id,
        employee_code: code,
        full_name: resolvedFullName,
        department: String(department || "").trim() || null,
        position: String(position || jobTitle || "Karyawan").trim() || null,
        employment_type: "Tetap",
        hire_date: new Date().toISOString().slice(0, 10),
        is_active: false,
        onboarding_status: "draft",
      });
      if (employeeError) {
        await admin.from("profiles").delete().eq("id", member.user.id);
        await admin.auth.admin.deleteUser(member.user.id);
        return json({ error: "Akun tim belum bisa dibuat karena data karyawan gagal disiapkan." }, 500);
      }
    }
    return json({ ok: true });
  } catch {
    return json({ error: "Terjadi masalah saat membuat akun tim." }, 500);
  }
});
