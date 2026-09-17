import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, FileSpreadsheet, Upload, X } from 'lucide-react'
import * as XLSX from 'xlsx'
import { supabase } from './lib/supabase'
import './employee-import.css'

type Profile={id:string;company_id:string;role:string}
type RefRow=Record<string,any>
type Prepared={row:number;name:string;code:string;payload:Record<string,any>;supervisorProfileId?:string}
type Issue={row:number;message:string}

const HEADERS=[
 'ID Karyawan*','Nama Lengkap*','Email','Nomor Ponsel','Status Import*','Status Karyawan*','Tanggal Bergabung*','Tanggal Akhir Kontrak','Organisasi/Divisi*','Jabatan*','Pangkat','Penempatan','Nama Jadwal Kerja*','Nama Lokasi Kantor','Username Atasan','Username Akun ESS','Gaji Pokok','Nama Bank','Nama Pemilik Rekening','Nomor Rekening','Tempat Lahir','Tanggal Lahir','Jenis Kelamin','Status Perkawinan','Golongan Darah','Agama','Kewarganegaraan','Negara Kewarganegaraan','Jenis Identitas','Nomor Identitas','Nomor KK','Telepon Rumah','Alamat Identitas','Negara','Provinsi','Kota/Kabupaten','Alamat Domisili','Negara Domisili','Provinsi Domisili','Kota Domisili','Nama Kontak Darurat','Telepon Kontak Darurat','Pendidikan Terakhir','Lembaga Pendidikan','Program Studi'
]
const str=(v:any)=>String(v??'').trim()
const key=(v:any)=>str(v).toLowerCase()
const num=(v:any)=>{if(typeof v==='number')return Number.isFinite(v)?v:0;const s=str(v).replace(/[^0-9,.-]/g,'').replace(/\./g,'').replace(',','.');const n=Number(s);return Number.isFinite(n)?n:0}
const isoDate=(value:any)=>{
 if(value==null||value==='')return ''
 if(value instanceof Date&&!Number.isNaN(value.getTime()))return `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`
 if(typeof value==='number'){const d=XLSX.SSF.parse_date_code(value);if(d)return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`}
 const s=str(value);if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s
 const parts=s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);if(parts)return `${parts[3]}-${parts[2].padStart(2,'0')}-${parts[1].padStart(2,'0')}`
 const d=new Date(s);return Number.isNaN(d.getTime())?'':`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

export function EmployeeImport({profile,onImported}:{profile:Profile;onImported:()=>void}){
 const canImport=['owner','hr_admin'].includes(profile.role)
 const fileRef=useRef<HTMLInputElement>(null)
 const [refs,setRefs]=useState<{employees:RefRow[];schedules:RefRow[];locations:RefRow[];profiles:RefRow[]}>({employees:[],schedules:[],locations:[],profiles:[]})
 const [open,setOpen]=useState(false),[fileName,setFileName]=useState(''),[prepared,setPrepared]=useState<Prepared[]>([]),[issues,setIssues]=useState<Issue[]>([])
 const [busy,setBusy]=useState(false),[progress,setProgress]=useState(0),[message,setMessage]=useState('')

 useEffect(()=>{if(!canImport)return;void (async()=>{const [employees,schedules,locations,profiles]=await Promise.all([
  supabase.from('employees').select('id,employee_code,full_name,profile_id'),
  supabase.from('work_schedules').select('id,name').order('name'),
  supabase.from('company_locations').select('id,name,is_active').eq('is_active',true).order('name'),
  supabase.from('profiles').select('id,username,full_name,role,is_active').eq('is_active',true).order('full_name'),
 ]);setRefs({employees:employees.data||[],schedules:schedules.data||[],locations:locations.data||[],profiles:profiles.data||[]})})()},[canImport])

 const linkedProfiles=useMemo(()=>new Set(refs.employees.map(r=>r.profile_id).filter(Boolean)),[refs.employees])
 const downloadTemplate=()=>{
  const wb=XLSX.utils.book_new()
  const data=XLSX.utils.aoa_to_sheet([HEADERS])
  data['!cols']=HEADERS.map(h=>({wch:Math.min(28,Math.max(14,h.length+2))}))
  const guide=XLSX.utils.aoa_to_sheet([
   ['TEMPLATE IMPORT DATA KARYAWAN — BANTU BERES GAJIAN PRO'],[],
   ['LANGKAH','KETERANGAN'],
   ['1','Isi hanya sheet DATA_KARYAWAN. Jangan mengubah nama header.'],
   ['2','Kolom bertanda * wajib. Status Import = Aktif membutuhkan jadwal kerja yang cocok dengan data web.'],
   ['3','Tanggal gunakan YYYY-MM-DD. Gaji Pokok isi angka saja tanpa Rp.'],
   ['4','Nama Jadwal Kerja, Nama Lokasi Kantor, Username Atasan, dan Username Akun ESS harus sama dengan data yang tersedia di web.'],
   ['5','Username Akun ESS opsional; gunakan hanya untuk akun Tim yang belum terhubung ke karyawan lain.'],
   ['6','Upload kembali melalui menu Karyawan → Import Excel. Sistem memvalidasi seluruh baris sebelum import.'],
  ])
  const reference=XLSX.utils.aoa_to_sheet([
   ['JADWAL KERJA TERSEDIA',...refs.schedules.map(x=>x.name)],
   ['LOKASI KANTOR TERSEDIA',...refs.locations.map(x=>x.name)],
   ['USERNAME ATASAN',...refs.profiles.filter(x=>x.role==='supervisor').map(x=>x.username)],
   ['AKUN ESS BELUM TERHUBUNG',...refs.profiles.filter(x=>x.role!=='owner'&&!linkedProfiles.has(x.id)).map(x=>x.username)],
   ['Status Import','Aktif','Draft'],
   ['Status Karyawan','Tetap Permanen','Tetap Percobaan','PKWT','Pekerja Lepas','Tenaga Ahli','Magang','Mitra','Tetap','Kontrak','Harian'],
  ])
  XLSX.utils.book_append_sheet(wb,data,'DATA_KARYAWAN');XLSX.utils.book_append_sheet(wb,guide,'PETUNJUK');XLSX.utils.book_append_sheet(wb,reference,'REFERENSI')
  XLSX.writeFile(wb,'template-import-karyawan-gajian-pro.xlsx')
 }

 const parseFile=async(file:File)=>{
  setMessage('');setProgress(0);setFileName(file.name)
  try{
   const wb=XLSX.read(await file.arrayBuffer(),{cellDates:true})
   const sheet=wb.Sheets['DATA_KARYAWAN']||wb.Sheets[wb.SheetNames[0]]
   if(!sheet)throw new Error('Sheet DATA_KARYAWAN tidak ditemukan.')
   const headerRows=XLSX.utils.sheet_to_json<any[]>(sheet,{header:1,defval:'',raw:true})
   const actual=(headerRows[0]||[]).map(str)
   const missing=HEADERS.filter(h=>!actual.includes(h))
   if(missing.length)throw new Error(`Template tidak sesuai. Kolom hilang: ${missing.slice(0,4).join(', ')}${missing.length>4?'…':''}`)
   const rows=XLSX.utils.sheet_to_json<Record<string,any>>(sheet,{defval:'',raw:true})
   const foundIssues:Issue[]=[];const ready:Prepared[]=[];const fileCodes=new Set<string>();const fileProfiles=new Set<string>()
   const existingCodes=new Set(refs.employees.map(x=>key(x.employee_code)))
   const scheduleMap=new Map(refs.schedules.map(x=>[key(x.name),x]))
   const locationMap=new Map(refs.locations.map(x=>[key(x.name),x]))
   const profileMap=new Map(refs.profiles.map(x=>[key(x.username),x]))
   rows.forEach((r,index)=>{
    const row=index+2,code=str(r['ID Karyawan*']),name=str(r['Nama Lengkap*']);if(!code&&!name)return
    const errors:string[]=[];const normalizedCode=key(code)
    if(!code)errors.push('ID Karyawan wajib diisi');if(!name)errors.push('Nama Lengkap wajib diisi')
    if(normalizedCode&&existingCodes.has(normalizedCode))errors.push('ID Karyawan sudah ada di web')
    if(normalizedCode&&fileCodes.has(normalizedCode))errors.push('ID Karyawan duplikat di file');fileCodes.add(normalizedCode)
    const importStatus=key(r['Status Import*']);if(!['aktif','draft'].includes(importStatus))errors.push('Status Import harus Aktif atau Draft')
    const employment=str(r['Status Karyawan*']);if(!employment)errors.push('Status Karyawan wajib diisi')
    const hireDate=isoDate(r['Tanggal Bergabung*']);if(!hireDate)errors.push('Tanggal Bergabung tidak valid')
    const department=str(r['Organisasi/Divisi*']),position=str(r['Jabatan*']),scheduleName=str(r['Nama Jadwal Kerja*'])
    const schedule=scheduleName?scheduleMap.get(key(scheduleName)):null
    if(importStatus==='aktif'&&!department)errors.push('Organisasi/Divisi wajib untuk data Aktif')
    if(importStatus==='aktif'&&!position)errors.push('Jabatan wajib untuk data Aktif')
    if(importStatus==='aktif'&&!scheduleName)errors.push('Nama Jadwal Kerja wajib untuk data Aktif')
    if(scheduleName&&!schedule)errors.push(`Jadwal “${scheduleName}” tidak ditemukan di web`)
    const locationName=str(r['Nama Lokasi Kantor']);const location=locationName?locationMap.get(key(locationName)):null;if(locationName&&!location)errors.push(`Lokasi “${locationName}” tidak ditemukan di web`)
    const supervisorUsername=str(r['Username Atasan']);const supervisor=supervisorUsername?profileMap.get(key(supervisorUsername)):null;if(supervisorUsername&&(!supervisor||supervisor.role!=='supervisor'))errors.push(`Username atasan “${supervisorUsername}” tidak valid`)
    const essUsername=str(r['Username Akun ESS']);const ess=essUsername?profileMap.get(key(essUsername)):null
    if(essUsername&&!ess)errors.push(`Akun ESS “${essUsername}” tidak ditemukan`)
    if(ess&&linkedProfiles.has(ess.id))errors.push(`Akun ESS “${essUsername}” sudah terhubung ke karyawan lain`)
    if(essUsername&&fileProfiles.has(key(essUsername)))errors.push(`Akun ESS “${essUsername}” dipakai lebih dari sekali di file`);if(essUsername)fileProfiles.add(key(essUsername))
    const birthDate=isoDate(r['Tanggal Lahir']);if(str(r['Tanggal Lahir'])&&!birthDate)errors.push('Tanggal Lahir tidak valid')
    const contractEnd=isoDate(r['Tanggal Akhir Kontrak']);if(str(r['Tanggal Akhir Kontrak'])&&!contractEnd)errors.push('Tanggal Akhir Kontrak tidak valid')
    if(errors.length){errors.forEach(message=>foundIssues.push({row,message}));return}
    const personal_data={birth_place:str(r['Tempat Lahir']),birth_date:birthDate,gender:str(r['Jenis Kelamin']),marital_status:str(r['Status Perkawinan']),blood_type:str(r['Golongan Darah']),religion:str(r['Agama']),citizenship:str(r['Kewarganegaraan']),nationality:str(r['Negara Kewarganegaraan']),identity_type:str(r['Jenis Identitas']),identity_number:str(r['Nomor Identitas']),family_card_number:str(r['Nomor KK']),telephone:str(r['Telepon Rumah']),identity_address:str(r['Alamat Identitas']),country:str(r['Negara']),province:str(r['Provinsi']),city:str(r['Kota/Kabupaten']),domicile_address:str(r['Alamat Domisili']),domicile_country:str(r['Negara Domisili']),domicile_province:str(r['Provinsi Domisili']),domicile_city:str(r['Kota Domisili']),emergency_name:str(r['Nama Kontak Darurat']),emergency_phone:str(r['Telepon Kontak Darurat']),education_level:str(r['Pendidikan Terakhir']),institution:str(r['Lembaga Pendidikan']),study_program:str(r['Program Studi'])}
    ready.push({row,name,code,payload:{employee_code:code,full_name:name,email:str(r['Email'])||null,phone:str(r['Nomor Ponsel'])||null,profile_id:ess?.id||null,department:department||null,position:position||null,rank_name:str(r['Pangkat'])||null,employment_type:employment,placement:str(r['Penempatan'])||'Baru Direkrut',hire_date:hireDate,contract_end:contractEnd||null,base_salary:num(r['Gaji Pokok']),bank_name:str(r['Nama Bank'])||null,bank_account_name:str(r['Nama Pemilik Rekening'])||null,bank_account_number:str(r['Nomor Rekening'])||null,location_id:location?.id||null,schedule_id:schedule?.id||null,is_active:importStatus==='aktif',onboarding_status:importStatus==='aktif'?'complete':'draft',personal_data,payroll_data:{}},supervisorProfileId:supervisor?.id})
   })
   if(!ready.length&&!foundIssues.length)foundIssues.push({row:0,message:'Tidak ada data karyawan pada file.'})
   setPrepared(ready);setIssues(foundIssues);setOpen(true)
  }catch(error:any){setPrepared([]);setIssues([{row:0,message:error.message||'File Excel tidak dapat dibaca.'}]);setOpen(true)}
 }

 const importRows=async()=>{
  if(!prepared.length||issues.length||busy)return
  setBusy(true);setMessage('');setProgress(0)
  for(let i=0;i<prepared.length;i++){
   const item=prepared[i]
   const {data,error}=await supabase.rpc('save_employee',{p_data:item.payload,p_id:null,p_expected_updated_at:null})
   if(error){setIssues([{row:item.row,message:`Import berhenti pada ${item.name}: ${error.message}`}]);setBusy(false);return}
   if(item.supervisorProfileId){const supervisorUpdate=await supabase.from('employees').update({supervisor_profile_id:item.supervisorProfileId}).eq('id',data);if(supervisorUpdate.error){setIssues([{row:item.row,message:`Data ${item.name} masuk, tetapi atasan belum tersimpan: ${supervisorUpdate.error.message}`}]);setBusy(false);return}}
   setProgress(i+1)
  }
  setBusy(false);setOpen(false);setMessage(`${prepared.length} data karyawan berhasil diimport.`);setPrepared([]);onImported()
 }

 if(!canImport)return null
 return <section className="employee-import-strip">
  <div><p className="eyebrow">Import massal</p><h3>Masukkan data karyawan dari Excel</h3><p>Gunakan template resmi agar semua kolom terbaca dan divalidasi sebelum masuk ke database.</p></div>
  <div className="employee-import-actions"><button className="button secondary" onClick={downloadTemplate}><Download/>Unduh template Excel</button><button className="button primary" onClick={()=>fileRef.current?.click()}><Upload/>Import Excel</button><input ref={fileRef} hidden type="file" accept=".xlsx,.xls" onChange={e=>{const f=e.target.files?.[0];if(f)void parseFile(f);e.currentTarget.value=''}}/></div>
  {message&&<p className="note employee-import-message" role="status">{message}</p>}
  {open&&<div className="modal-layer"><button className="backdrop" onClick={()=>!busy&&setOpen(false)}/><section className="modal import-modal"><header><div><p className="eyebrow">Validasi import</p><h3>{fileName||'File Excel'}</h3></div><button className="icon" disabled={busy} onClick={()=>setOpen(false)}><X/></button></header><div className="import-summary"><div><span>Siap diimport</span><b>{prepared.length}</b></div><div className={issues.length?'has-error':''}><span>Masalah ditemukan</span><b>{issues.length}</b></div></div>{issues.length>0?<div className="import-errors"><b>Perbaiki file sebelum import</b>{issues.slice(0,20).map((x,i)=><p key={`${x.row}-${i}`}>{x.row?`Baris ${x.row}: `:''}{x.message}</p>)}{issues.length>20&&<small>+ {issues.length-20} masalah lainnya.</small>}</div>:<div className="import-ready"><FileSpreadsheet/><div><b>Semua baris lolos validasi.</b><p>Data baru akan dibuat setelah tombol Import ditekan.</p></div></div>}{busy&&<div className="import-progress"><span>Memasukkan {progress} dari {prepared.length} karyawan…</span><progress value={progress} max={prepared.length}/></div>}<div className="import-footer"><button className="button secondary" disabled={busy} onClick={()=>setOpen(false)}>Batal</button><button className="button primary" disabled={busy||!!issues.length||!prepared.length} onClick={()=>void importRows()}>{busy?'Mengimport…':`Import ${prepared.length} karyawan`}</button></div></section></div>}
 </section>
}
