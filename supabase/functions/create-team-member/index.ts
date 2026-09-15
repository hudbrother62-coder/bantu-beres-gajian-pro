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

    const { fullName, username, password, role, jobTitle } = await req.json();
    const normalizedUsername = String(username || "").trim().toLowerCase();
    const allowedRoles = ["hr_admin", "finance", "supervisor", "employee"];
    if (!fullName || !normalizedUsername || !password || !allowedRoles.includes(role)) {
      return json({ error: "Data anggota tim belum lengkap." }, 400);
    }
    if (!/^[a-z0-9._-]{4,30}$/.test(normalizedUsername) || String(password).length < 8) {
      return json({ error: "Username atau password belum memenuhi ketentuan." }, 400);
    }
    const { data: existing } = await admin.from("profiles").select("id").eq("username", normalizedUsername).maybeSingle();
    if (existing) return json({ error: "Username sudah digunakan." }, 409);

    const teamEmail = `${normalizedUsername}@team.bantuberes.local`;
    const { data: member, error: userError } = await admin.auth.admin.createUser({
      email: teamEmail,
      password: String(password),
      email_confirm: true,
      user_metadata: { full_name: String(fullName).trim() },
    });
    if (userError || !member.user) return json({ error: userError?.message || "Akun tim tidak dapat dibuat." }, 400);

    const { error: profileError } = await admin.from("profiles").insert({
      id: member.user.id,
      company_id: caller.company_id,
      full_name: String(fullName).trim(),
      username: normalizedUsername,
      role,
      job_title: jobTitle ? String(jobTitle).trim() : null,
    });
    if (profileError) {
      await admin.auth.admin.deleteUser(member.user.id);
      return json({ error: "Profil anggota tim tidak dapat dibuat." }, 500);
    }
    return json({ ok: true });
  } catch {
    return json({ error: "Terjadi masalah saat membuat akun tim." }, 500);
  }
});
