import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link2, Plus, RefreshCw } from 'lucide-react'
import { supabase } from './lib/supabase'

type Profile={id:string;company_id:string;full_name:string;username:string;role:string;is_active?:boolean;job_title?:string|null;employees?:Employee[]}
type Employee={id:string;employee_code:string;full_name:string;department?:string|null;position?:string|null;is_active:boolean;profile_id?:string|null;onboarding_status?:string|null}
const roles:Record<string,string>={owner:'Owner',hr_admin:'HR / Admin',finance:'Keuangan',supervisor:'Atasan',employee:'Karyawan'}
function Field({label,children}:{label:string;children:React.ReactNode}){return <label className="field"><span>{label}</span>{children}</label>}
function Modal({title,close,children}:{title:string;close:()=>void;children:React.ReactNode}){return <div className="modal-layer"><button className="backdrop" data-action-feedback="off" onClick={close}/><section className="modal team-modal"><header><h3>{title}</h3><button className="button secondary" data-action-feedback="off" onClick={close}>Tutup</button></header>{children}</section></div>}

export function TeamManagement({profile}:{profile:Profile}){
  const canManage=['owner','hr_admin'].includes(profile.role),isOwner=profile.role==='owner'
  const [rows,setRows]=useState<Profile[]>([]),[employees,setEmployees]=useState<Employee[]>([])
  const [open,setOpen]=useState(false),[editing,setEditing]=useState<Profile|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true)
  const [selectedEmployee,setSelectedEmployee]=useState(''),[linkChoices,setLinkChoices]=useState<Record<string,string>>({})

  const load=async()=>{
    setLoading(true)
    const [profiles,employeeRows]=await Promise.all([
      supabase.from('profiles').select('id,company_id,full_name,username,role,is_active,job_title,created_at').eq('company_id',profile.company_id).order('created_at'),
      supabase.from('employees').select('id,employee_code,full_name,department,position,is_active,profile_id,onboarding_status').eq('company_id',profile.company_id).order('full_name'),
    ])
    if(employeeRows.error){
      setEmployees([])
      setMessage('Data karyawan belum berhasil dimuat. Coba muat ulang.')
    }else{
      setEmployees((employeeRows.data||[]) as Employee[])
    }
    if(profiles.error){
      setRows([])
      setMessage('Data akun Tim belum berhasil dimuat. Data karyawan tetap dipertahankan; coba muat ulang.')
    }else{
      setRows((profiles.data||[]) as Profile[])
      if(!employeeRows.error)setMessage('')
    }
    setLoading(false)
  }
  useEffect(()=>{void load()},[profile.company_id])

  const linkedProfileIds=useMemo(()=>new Set(employees.map(e=>e.profile_id).filter(Boolean) as string[]),[employees])
  const availableEmployees=useMemo(()=>employees.filter(e=>e.is_active&&!e.profile_id),[employees])
  const linkedEmployees=useMemo(()=>employees.filter(e=>Boolean(e.profile_id)),[employees])
  const unlinkedEmployeeAccounts=useMemo(()=>rows.filter(r=>r.role==='employee'&&!linkedProfileIds.has(r.id)),[rows,linkedProfileIds])

  const invoke=async(body:any,success:string)=>{
    setBusy(true)
    const {data,error}=await supabase.functions.invoke('create-team-member',{body})
    setBusy(false)
    if(error||data?.error){setMessage(data?.error||'Perubahan akun tim belum dapat diproses.');return false}
    await load();setMessage(success);return true
  }

  const add=async(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault()
    const body:any=Object.fromEntries(new FormData(e.currentTarget).entries())
    body.employeeId=selectedEmployee
    if(!isOwner)body.role='employee'
    if(await invoke(body,selectedEmployee?'Akun berhasil dibuat dan langsung dihubungkan ke data karyawan.':'Akun tim berhasil dibuat.')){setOpen(false);setSelectedEmployee('')}
  }
  const saveEdit=async(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault();if(!editing)return
    const body:any={action:'update-team',profileId:editing.id,...Object.fromEntries(new FormData(e.currentTarget).entries())}
    if(!isOwner)body.role='employee'
    if(await invoke(body,'Data akun tim berhasil diperbarui.'))setEditing(null)
  }
  const setActive=async(row:Profile,active:boolean)=>{if(await invoke({action:'set-active',profileId:row.id,active},active?'Akun tim diaktifkan kembali.':'Akun tim dinonaktifkan.'))setEditing(null)}
  const remove=async(row:Profile)=>{if(await invoke({action:'delete-team',profileId:row.id},'Akun tim berhasil dihapus. Data karyawan tetap dipertahankan.'))setEditing(null)}
  const linkExisting=async(account:Profile)=>{
    const employeeId=linkChoices[account.id]
    if(!employeeId){setMessage(`Pilih data karyawan untuk @${account.username} terlebih dahulu.`);return}
    if(await invoke({action:'link-existing',profileId:account.id,employeeId},`Akun @${account.username} berhasil dihubungkan ke data karyawan.`))setLinkChoices(v=>({...v,[account.id]:''}))
  }
  const picked=employees.find(row=>row.id===selectedEmployee)
  const manageable=(row:Profile)=>row.role!=='owner'&&(isOwner||row.role==='employee')
  const statusFor=(employee:Employee)=>{
    const account=employee.profile_id?rows.find(r=>r.id===employee.profile_id):null
    if(account)return {label:`Terhubung @${account.username}`,className:account.is_active===false?'badge rejected':'badge active'}
    if(employee.onboarding_status==='draft')return {label:'Data belum lengkap',className:'badge draft'}
    if(!employee.is_active)return {label:'Karyawan nonaktif',className:'badge rejected'}
    return {label:'Belum punya akun',className:'badge draft'}
  }

  return <section className="page team-page">
    <div className="intro"><div><p className="eyebrow">Akses perusahaan</p><h1>Tim</h1><p>Satu data karyawan terhubung ke satu akun ESS. Data Tim sekarang dibaca langsung dari relasi profile_id agar selalu konsisten dengan menu Karyawan.</p></div><div className="intro-actions"><button className="button secondary" onClick={()=>void load()} disabled={loading||busy}><RefreshCw/>{loading?'Memuat…':'Muat ulang'}</button>{canManage&&<button className="button primary" onClick={()=>setOpen(true)}><Plus/>{isOwner?'Tambah tim':'Tambah akun Karyawan'}</button>}</div></div>
    {message&&<p className="note" role="status">{message}</p>}

    <article className="card"><div className="card-title"><div><h3>Status Karyawan ↔ Akun Tim</h3><small>{linkedEmployees.length} terhubung · {availableEmployees.length} karyawan aktif belum punya akun · {employees.filter(e=>e.onboarding_status==='draft').length} draft.</small></div><span className="badge">{employees.length} karyawan</span></div>{employees.map(employee=>{const status=statusFor(employee);return <div className="row team-status-row" key={employee.id}><div className="avatar mini">{employee.full_name[0]}</div><div><b>{employee.full_name}</b><small>{employee.employee_code} · {employee.position||employee.department||'Jabatan belum lengkap'}</small></div><span className={status.className}>{status.label}</span></div>})}{!employees.length&&<p className="empty">{loading?'Memuat data karyawan…':'Belum ada data karyawan.'}</p>}</article>

    {unlinkedEmployeeAccounts.length>0&&<article className="card"><div className="card-title"><div><h3>Akun Karyawan belum terhubung</h3><small>Pilih karyawan aktif yang belum mempunyai akun, lalu hubungkan. Data tidak diduplikasi.</small></div><span className="badge draft">{unlinkedEmployeeAccounts.length} akun</span></div>{unlinkedEmployeeAccounts.map(account=><div className="row team-link-row" key={account.id}><div><b>{account.full_name}</b><small>@{account.username}</small></div><select value={linkChoices[account.id]||''} onChange={e=>setLinkChoices(v=>({...v,[account.id]:e.target.value}))}><option value="">Pilih karyawan aktif</option>{availableEmployees.map(employee=><option key={employee.id} value={employee.id}>{employee.full_name} · {employee.employee_code}</option>)}</select><button className="button secondary" disabled={busy||!availableEmployees.length} onClick={()=>void linkExisting(account)}><Link2/>Hubungkan</button></div>)}{!availableEmployees.length&&<p className="note">Belum ada karyawan aktif yang bebas untuk ditautkan. Lengkapi/aktifkan karyawan di menu Karyawan terlebih dahulu.</p>}</article>}

    <div className="team">{rows.map(r=>{const linked=employees.find(e=>e.profile_id===r.id)||null;return <article className="card member" key={r.id}><div className="avatar">{(linked?.full_name||r.full_name)[0]}</div><div><h3>{linked?.full_name||r.full_name}</h3><p>@{r.username}</p><div className="inline-actions"><span className="badge">{roles[r.role]||r.role}</span><span className={r.is_active===false?'badge rejected':'badge active'}>{r.is_active===false?'Akun nonaktif':'Akun aktif'}</span></div><small>{linked?`${linked.employee_code} · ${linked.position||linked.department||'Data jabatan belum lengkap'}`:r.role==='employee'?'Belum terhubung ke data karyawan':'Akun manajemen'}</small>{manageable(r)&&<div className="workflow-actions"><button className="button secondary" data-action-feedback="off" onClick={()=>setEditing(r)}>Edit</button><button className="button secondary" disabled={busy} onClick={()=>void setActive(r,r.is_active===false)}>{r.is_active===false?'Aktifkan':'Nonaktifkan'}</button><button className="button secondary" disabled={busy} onClick={()=>void remove(r)}>Hapus akun</button></div>}</div></article>})}</div>

    {open&&<Modal title={isOwner?'Tambah anggota tim':'Tambah akun Karyawan'} close={()=>setOpen(false)}><form onSubmit={add} className="form"><Field label="Hubungkan ke data karyawan"><div className="employee-picker" role="group" aria-label="Pilih data karyawan"><button type="button" data-action-feedback="off" className={!selectedEmployee?'selected':''} onClick={()=>setSelectedEmployee('')}><b>Buat data karyawan draft baru</b><small>Pilih ini bila orang tersebut belum ada di menu Karyawan.</small></button>{availableEmployees.map(row=><button type="button" data-action-feedback="off" key={row.id} className={selectedEmployee===row.id?'selected':''} onClick={()=>setSelectedEmployee(row.id)}><b>{row.full_name}</b><small>{row.employee_code} · {row.position||row.department||'Jabatan belum lengkap'}</small></button>)}</div></Field>{picked&&<p className="note">Akun akan memakai data <b>{picked.full_name}</b>. Sistem tidak membuat data karyawan baru.</p>}{!availableEmployees.length&&<p className="note">Semua karyawan aktif sudah terhubung. Pilih “Buat data karyawan draft baru” bila ingin membuat akun untuk orang baru.</p>}<div className="two" key={selectedEmployee||'new'}><Field label="Nama lengkap"><input name="fullName" required={!selectedEmployee} defaultValue={picked?.full_name||''}/></Field><Field label="Jabatan"><input name="jobTitle" defaultValue={picked?.position||''}/></Field></div><div className="two"><Field label="Username"><input name="username" minLength={4} required/></Field><Field label="Password awal"><input name="password" type="password" minLength={8} required/></Field></div>{isOwner?<Field label="Role"><select name="role" defaultValue="employee"><option value="employee">Karyawan</option><option value="hr_admin">HR / Admin</option><option value="finance">Keuangan</option><option value="supervisor">Atasan</option></select></Field>:<p className="note">Role dikunci sebagai Karyawan untuk akun yang dibuat HR/Admin.</p>}<div className="two"><Field label="Kode karyawan baru"><input name="employeeCode" placeholder="Hanya bila membuat draft baru" disabled={Boolean(selectedEmployee)}/></Field><Field label="Divisi"><input name="department" placeholder="Operasional" disabled={Boolean(selectedEmployee)}/></Field></div><Field label="Jabatan karyawan"><input name="position" placeholder="Staff" disabled={Boolean(selectedEmployee)}/></Field><button className="button primary" disabled={busy}>{busy?'Menyimpan…':selectedEmployee?'Buat & hubungkan akun':'Buat akun'}</button></form></Modal>}

    {editing&&<Modal title={`Edit @${editing.username}`} close={()=>setEditing(null)}><form className="form" onSubmit={saveEdit}><Field label="Nama lengkap"><input name="fullName" defaultValue={editing.full_name} required/></Field><Field label="Username"><input name="username" defaultValue={editing.username} minLength={4} required/></Field><Field label="Jabatan"><input name="jobTitle" defaultValue={editing.job_title||''}/></Field>{isOwner?<Field label="Role"><select name="role" defaultValue={editing.role}><option value="employee">Karyawan</option><option value="hr_admin">HR / Admin</option><option value="finance">Keuangan</option><option value="supervisor">Atasan</option></select></Field>:<p className="note">HR/Admin hanya dapat mempertahankan role Karyawan.</p>}<Field label="Password baru (opsional)"><input name="password" type="password" minLength={8}/></Field><button className="button primary" disabled={busy}>Simpan perubahan</button></form></Modal>}
  </section>
}
