import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,"Content-Type":"application/json"}});

Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
 if(req.method!=="POST")return json({error:"Method tidak diizinkan."},405);
 try{
  const token=req.headers.get("Authorization")?.replace("Bearer ","");
  if(!token)return json({error:"Sesi tidak ditemukan."},401);
  const admin=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const {data:authData,error:authError}=await admin.auth.getUser(token);
  if(authError||!authData.user)return json({error:"Sesi tidak valid."},401);
  const {data:caller}=await admin.from("profiles").select("company_id,role,is_active").eq("id",authData.user.id).maybeSingle();
  if(!caller?.is_active||!["owner","hr_admin"].includes(caller.role))return json({error:"Hanya Owner atau HR/Admin yang dapat mengelola akun tim."},403);
  const isOwner=caller.role==="owner";
  const payload=await req.json();
  const action=String(payload.action||"create");
  const allowedRoles=["hr_admin","finance","supervisor","employee"];

  const getTarget=async(id:string)=>{const {data,error}=await admin.from("profiles").select("id,company_id,full_name,username,role,is_active,job_title").eq("id",id).eq("company_id",caller.company_id).maybeSingle();return error?null:data};
  const canManageTarget=(target:any)=>isOwner||(target?.role==="employee");

  if(["set-active","delete-team","update-team","link-existing","create-draft-employee"].includes(action)){
   const profileId=String(payload.profileId||"");
   if(!profileId||profileId===authData.user.id)return json({error:"Akun tim tidak dapat diproses."},400);
   const target=await getTarget(profileId);
   if(!target||target.role==="owner")return json({error:"Akun tim tidak ditemukan."},404);
   if(!canManageTarget(target))return json({error:"HR/Admin hanya dapat mengelola akun role Karyawan."},403);

   if(action==="set-active"){
    const active=Boolean(payload.active);
    const {error}=await admin.from("profiles").update({is_active:active}).eq("id",profileId).eq("company_id",caller.company_id);
    if(error)return json({error:"Status akun belum dapat diperbarui."},400);
    if(!active)await admin.from("employees").update({is_active:false}).eq("company_id",caller.company_id).eq("profile_id",profileId);
    return json({ok:true,mode:active?"activated":"deactivated"});
   }

   if(action==="delete-team"){
    await admin.from("employees").update({profile_id:null,is_active:false}).eq("company_id",caller.company_id).eq("profile_id",profileId);
    const {error:profileError}=await admin.from("profiles").delete().eq("id",profileId).eq("company_id",caller.company_id);
    if(profileError)return json({error:"Akun tim belum dapat dihapus."},400);
    const {error:userError}=await admin.auth.admin.deleteUser(profileId);
    if(userError)return json({error:"Profil tim sudah dihapus, tetapi akun login belum dapat dibersihkan."},500);
    return json({ok:true,mode:"deleted"});
   }

   if(action==="update-team"){
    const fullName=String(payload.fullName||target.full_name).trim();
    const username=String(payload.username||target.username).trim().toLowerCase();
    const requestedRole=String(payload.role||target.role);
    const role=isOwner?requestedRole:"employee";
    if(!fullName||!/^[a-z0-9._-]{4,30}$/.test(username)||!allowedRoles.includes(role))return json({error:"Nama, username, atau role belum valid."},400);
    const {data:duplicate}=await admin.from("profiles").select("id").eq("username",username).neq("id",profileId).maybeSingle();
    if(duplicate)return json({error:"Username sudah digunakan."},409);
    const userUpdate:any={user_metadata:{full_name:fullName}};
    if(username!==target.username)userUpdate.email=`${username}@team.bantuberes.local`;
    if(payload.password&&String(payload.password).length>=8)userUpdate.password=String(payload.password);
    const {error:userError}=await admin.auth.admin.updateUserById(profileId,userUpdate);
    if(userError)return json({error:"Login akun belum dapat diperbarui."},400);
    const {error}=await admin.from("profiles").update({full_name:fullName,username,role,job_title:String(payload.jobTitle||"").trim()||null}).eq("id",profileId).eq("company_id",caller.company_id);
    if(error)return json({error:"Profil tim belum dapat diperbarui."},400);
    return json({ok:true,mode:"updated"});
   }

   const {data:alreadyLinked}=await admin.from("employees").select("id").eq("company_id",caller.company_id).eq("profile_id",profileId).maybeSingle();
   if(alreadyLinked)return json({error:"Akun tim ini sudah terhubung ke data karyawan."},409);
   if(action==="link-existing"){
    const employeeId=String(payload.employeeId||"");
    const {data:employee}=await admin.from("employees").select("id,profile_id,is_active").eq("id",employeeId).eq("company_id",caller.company_id).eq("is_active",true).maybeSingle();
    if(!employee)return json({error:"Karyawan aktif tidak ditemukan."},404);
    if(employee.profile_id)return json({error:"Karyawan ini sudah terhubung ke akun tim lain."},409);
    const {data:linked,error}=await admin.from("employees").update({profile_id:profileId}).eq("id",employeeId).eq("company_id",caller.company_id).is("profile_id",null).select("id").maybeSingle();
    if(error||!linked)return json({error:"Data karyawan belum dapat dihubungkan."},409);
    return json({ok:true,mode:"linked"});
   }
   const employeeCode=String(payload.employeeCode||target.username).trim().toUpperCase();
   const {data:duplicateCode}=await admin.from("employees").select("id").eq("company_id",caller.company_id).eq("employee_code",employeeCode).maybeSingle();
   if(duplicateCode)return json({error:"Kode karyawan sudah digunakan."},409);
   const {error}=await admin.from("employees").insert({company_id:caller.company_id,profile_id:profileId,employee_code:employeeCode,full_name:target.full_name,department:String(payload.department||"").trim()||null,position:String(payload.position||"Karyawan").trim()||"Karyawan",employment_type:"Tetap",hire_date:new Date().toISOString().slice(0,10),is_active:false,onboarding_status:"draft"});
   if(error)return json({error:"Data karyawan draft belum dapat dibuat."},400);
   return json({ok:true,mode:"draft-created"});
  }

  if(action!=="create")return json({error:"Aksi tidak dikenal."},400);
  const {fullName,username,password,jobTitle,employeeId,employeeCode,department,position}=payload;
  const role=isOwner?String(payload.role||"employee"):"employee";
  const normalizedUsername=String(username||"").trim().toLowerCase();
  if((!fullName&&!employeeId)||!normalizedUsername||!password||!allowedRoles.includes(role))return json({error:"Data anggota tim belum lengkap."},400);
  if(!/^[a-z0-9._-]{4,30}$/.test(normalizedUsername)||String(password).length<8)return json({error:"Username atau password belum memenuhi ketentuan."},400);
  const {data:existing}=await admin.from("profiles").select("id").eq("username",normalizedUsername).maybeSingle();
  if(existing)return json({error:"Username sudah digunakan."},409);
  let linked:any=null;
  if(employeeId){const {data:e}=await admin.from("employees").select("id,full_name,phone,position,profile_id").eq("id",String(employeeId)).eq("company_id",caller.company_id).eq("is_active",true).maybeSingle();if(!e)return json({error:"Karyawan aktif tidak ditemukan."},404);if(e.profile_id)return json({error:"Karyawan ini sudah punya akun tim."},409);linked=e;}
  const resolvedName=String(linked?.full_name||fullName).trim();
  const {data:member,error:userError}=await admin.auth.admin.createUser({email:`${normalizedUsername}@team.bantuberes.local`,password:String(password),email_confirm:true,user_metadata:{full_name:resolvedName}});
  if(userError||!member.user)return json({error:userError?.message||"Akun tim tidak dapat dibuat."},400);
  const {error:profileError}=await admin.from("profiles").insert({id:member.user.id,company_id:caller.company_id,full_name:resolvedName,username:normalizedUsername,role,job_title:String(jobTitle||linked?.position||position||"").trim()||null,phone:linked?.phone||null});
  if(profileError){await admin.auth.admin.deleteUser(member.user.id);return json({error:"Profil anggota tim tidak dapat dibuat."},500);}
  if(linked){const {data:ok}=await admin.from("employees").update({profile_id:member.user.id}).eq("id",linked.id).eq("company_id",caller.company_id).is("profile_id",null).select("id").maybeSingle();if(!ok){await admin.from("profiles").delete().eq("id",member.user.id);await admin.auth.admin.deleteUser(member.user.id);return json({error:"Akun dibuat, tetapi belum bisa dihubungkan ke karyawan."},500);}}
  else if(role==="employee"){
   const code=String(employeeCode||normalizedUsername).trim().toUpperCase();
   const {data:duplicate}=await admin.from("employees").select("id").eq("company_id",caller.company_id).eq("employee_code",code).maybeSingle();
   if(duplicate){await admin.from("profiles").delete().eq("id",member.user.id);await admin.auth.admin.deleteUser(member.user.id);return json({error:"Kode karyawan sudah digunakan."},409);}
   const {error}=await admin.from("employees").insert({company_id:caller.company_id,profile_id:member.user.id,employee_code:code,full_name:resolvedName,department:String(department||"").trim()||null,position:String(position||jobTitle||"Karyawan").trim()||"Karyawan",employment_type:"Tetap",hire_date:new Date().toISOString().slice(0,10),is_active:false,onboarding_status:"draft"});
   if(error){await admin.from("profiles").delete().eq("id",member.user.id);await admin.auth.admin.deleteUser(member.user.id);return json({error:"Akun tim belum bisa dibuat karena data karyawan gagal disiapkan."},500);}
  }
  return json({ok:true,mode:"created"});
 }catch(e){console.error(e);return json({error:"Terjadi masalah saat mengelola akun tim."},500);}
});