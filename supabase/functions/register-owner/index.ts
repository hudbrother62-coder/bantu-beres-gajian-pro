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
    const { companyName, fullName, username, email, password } = await req.json();
    const normalizedUsername = String(username || "").trim().toLowerCase();
    const normalizedEmail = String(email || "").trim().toLowerCase();

    if (!companyName || !fullName || !normalizedUsername || !normalizedEmail || !password) {
      return json({ error: "Lengkapi data pendaftaran terlebih dahulu." }, 400);
    }
    if (!/^[a-z0-9._-]{4,30}$/.test(normalizedUsername)) {
      return json({ error: "Username terdiri dari 4–30 karakter huruf kecil, angka, titik, garis bawah, atau strip." }, 400);
    }
    if (String(password).length < 8) return json({ error: "Password minimal 8 karakter." }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: existingUsername } = await admin.from("profiles").select("id").eq("username", normalizedUsername).maybeSingle();
    if (existingUsername) return json({ error: "Username sudah digunakan." }, 409);

    const { data: createdUser, error: createUserError } = await admin.auth.admin.createUser({
      email: normalizedEmail,
      password: String(password),
      email_confirm: true,
      user_metadata: { full_name: String(fullName).trim() },
    });
    if (createUserError || !createdUser.user) return json({ error: createUserError?.message || "Akun tidak dapat dibuat." }, 400);

    const { data: company, error: companyError } = await admin
      .from("companies")
      .insert({ name: String(companyName).trim() })
      .select("id")
      .single();
    if (companyError || !company) {
      await admin.auth.admin.deleteUser(createdUser.user.id);
      return json({ error: "Workspace perusahaan tidak dapat dibuat." }, 500);
    }

    const { error: profileError } = await admin.from("profiles").insert({
      id: createdUser.user.id,
      company_id: company.id,
      full_name: String(fullName).trim(),
      username: normalizedUsername,
      role: "owner",
    });
    if (profileError) {
      await admin.from("companies").delete().eq("id", company.id);
      await admin.auth.admin.deleteUser(createdUser.user.id);
      return json({ error: "Profil pemilik tidak dapat dibuat." }, 500);
    }

    return json({ ok: true, companyId: company.id });
  } catch {
    return json({ error: "Terjadi masalah saat mendaftarkan akun." }, 500);
  }
});
