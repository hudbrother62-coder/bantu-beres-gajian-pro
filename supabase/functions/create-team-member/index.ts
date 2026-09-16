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
    if (!caller?.is_active || caller.role !== "owner") return json({ error: "Hanya Owner yang dapat mengelola akun tim." }, 403);

    const payload = await req.json();
    const action = String(payload.action || "create");
    const allowedRoles = ["hr_admin", "finance", "supervisor", "employee"];

    if (action === "link-existing" || action === "create-draft-employee") {
      const targetProfileId = String(payload.profileId || "");
      if (!targetProfileId) return json({ error: "Akun tim belum dipilih." }, 400);

      const { data: targetProfile, error: targetError } = await admin
        .from("profiles")
        .select("id, full_name, username, role, is_active")
        .eq("id", targetProfileId)
        .eq("company_id", caller.company_id)
        .maybeSingle();
      if (targetError || !targetProfile || !targetProfile.is_active || !allowedRoles.includes(targetProfile.role)) {
        return json({ error: "Akun tim tidak ditemukan atau tidak dapat dihubungkan." }, 404);
      }

      const { data: alreadyLinked } = await admin
        .from("employees")
        .select("id, employee_code")
        .eq("company_id", caller.company_id)
        .eq("profile_id", targetProfile.id)
        .maybeSingle();
      if (alreadyLinked) return json({ error: "Akun tim ini sudah terhubung ke data karyawan." }, 409);

      if (action === "link-existing") {
        const employeeId = String(payload.employeeId || "");
        if (!employeeId) return json({ error: "Pilih data karyawan yang akan dihubungkan." }, 400);

        const { data: employee, error: employeeError } = await admin
          .from("employees")
          .select("id, profile_id, is_active")
          .eq("id", employeeId)
          .eq("company_id", caller.company_id)
          .eq("is_active", true)
          .maybeSingle();
        if (employeeError || !employee) return json({ error: "Karyawan aktif tidak ditemukan." }, 404);
        if (employee.profile_id) return json({ error: "Karyawan ini sudah terhubung ke akun tim lain." }, 409);

        const { data: linked, error: linkError } = await admin
          .from("employees")
          .update({ profile_id: targetProfile.id })
          .eq("id", employee.id)
          .eq("company_id", caller.company_id)
          .is("profile_id", null)
          .select("id")
          .maybeSingle();
        if (linkError || !linked) return json({ error: "Data karyawan belum dapat dihubungkan. Muat ulang lalu coba lagi." }, 409);
        return json({ ok: true, mode: "linked" });
      }

      const employeeCode = String(payload.employeeCode || targetProfile.username).trim().toUpperCase();
      if (!employeeCode) return json({ error: "Kode karyawan wajib diisi." }, 400);
      const { data: duplicateCode } = await admin
        .from("employees")
        .select("id")
        .eq("company_id", caller.company_id)
        .eq("employee_code", employeeCode)
        .maybeSingle();
      if (duplicateCode) return json({ error: "Kode karyawan sudah digunakan. Gunakan kode lain." }, 409);

      const { error: employeeError } = await admin.from("employees").insert({
        company_id: caller.company_id,
        profile_id: targetProfile.id,
        employee_code: employeeCode,
        full_name: targetProfile.full_name,
        department: String(payload.department || "").trim() || null,
        position: String(payload.position || "Karyawan").trim() || "Karyawan",
        employment_type: "Tetap",
        hire_date: new Date().toISOString().slice(0, 10),
        is_active: false,
        onboarding_status: "draft",
      });
      if (employeeError) return json({ error: "Data karyawan draft belum dapat dibuat." }, 400);
      return json({ ok: true, mode: "draft-created" });
    }

    if (action !== "create") return json({ error: "Aksi tidak dikenal." }, 400);

    const { fullName, username, password, role, jobTitle, employeeId, employeeCode, department, position } = payload;
    const normalizedUsername = String(username || "").trim().toLowerCase();
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
      const { data: linked, error: linkError } = await admin
        .from("employees")
        .update({ profile_id: member.user.id })
        .eq("id", linkedEmployee.id)
        .eq("company_id", caller.company_id)
        .is("profile_id", null)
        .select("id")
        .maybeSingle();
      if (linkError || !linked) {
        await admin.from("profiles").delete().eq("id", member.user.id);
        await admin.auth.admin.deleteUser(member.user.id);
        return json({ error: "Akun dibuat, tetapi belum bisa dihubungkan ke data karyawan." }, 500);
      }
    } else if (role === "employee") {
      const code = String(employeeCode || normalizedUsername).trim().toUpperCase();
      const { data: duplicateCode } = await admin
        .from("employees")
        .select("id")
        .eq("company_id", caller.company_id)
        .eq("employee_code", code)
        .maybeSingle();
      if (duplicateCode) {
        await admin.from("profiles").delete().eq("id", member.user.id);
        await admin.auth.admin.deleteUser(member.user.id);
        return json({ error: "Kode karyawan sudah digunakan. Gunakan kode lain." }, 409);
      }
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
    return json({ ok: true, mode: "created" });
  } catch {
    return json({ error: "Terjadi masalah saat mengelola akun tim." }, 500);
  }
});