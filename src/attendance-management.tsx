import { useCallback, useEffect, useState } from 'react'
import { Clock3, MapPin } from 'lucide-react'
import { supabase } from './lib/supabase'

type Profile={id:string;company_id:string;full_name?:string;role:string}
type Employee={id:string;employee_code:string;full_name:string;department?:string|null;position?:string|null;is_active:boolean;profile_id?:string|null}
type AttendanceRow={id:string;employee_id:string;attendance_date:string;status:string;check_in_at?:string|null;check_out_at?:string|null;location_note?:string|null;employees?:{full_name?:string|null;employee_code?:string|null}|null}

const statusLabel=(status:string)=>({present:'Hadir',late:'Terlambat',absent:'Alfa',leave:'Izin/Cuti',sick:'Sakit',holiday:'Libur'} as Record<string,string>)[status]||status
const fmtTime=(value?:string|null)=>value?new Date(value).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'}):'—'
const localDate=(timezone:string)=>new Intl.DateTimeFormat('en-CA',{timeZone:timezone||'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())

function Empty({text}:{text:string}){return <div className="empty"><p>{text}</p></div>}

export function AttendanceManagement({profile}:{profile:Profile}){
  const canManage=['owner','hr_admin'].includes(profile.role)
  const [employees,setEmployees]=useState<Employee[]>([])
  const [rows,setRows]=useState<AttendanceRow[]>([])
  const [self,setSelf]=useState<Employee|null>(null)
  const [timezone,setTimezone]=useState('Asia/Jakarta')
  const [message,setMessage]=useState('')
  const [locating,setLocating]=useState(false)
  const [busy,setBusy]=useState('')

  const load=useCallback(async()=>{
    const companyResult=await supabase.from('companies').select('timezone').eq('id',profile.company_id).single()
    const tz=companyResult.data?.timezone||'Asia/Jakarta'
    setTimezone(tz)
    const day=localDate(tz)
    const [employeeResult,attendanceResult,selfResult]=await Promise.all([
      supabase.from('employees').select('id,employee_code,full_name,department,position,is_active,profile_id').eq('is_active',true).order('full_name'),
      supabase.from('attendance_records').select('id,employee_id,attendance_date,status,check_in_at,check_out_at,location_note,employees(full_name,employee_code)').eq('attendance_date',day).order('check_in_at'),
      supabase.from('employees').select('id,employee_code,full_name,department,position,is_active,profile_id').eq('profile_id',profile.id).eq('is_active',true).maybeSingle(),
    ])
    setEmployees((employeeResult.data||[]) as Employee[])
    setRows((attendanceResult.data||[]) as AttendanceRow[])
    setSelf((selfResult.data||null) as Employee|null)
  },[profile.company_id,profile.id])

  useEffect(()=>{void load()},[load])

  const position=()=>new Promise<GeolocationPosition>((resolve,reject)=>{
    if(!navigator.geolocation){reject(new Error('Perangkat ini tidak menyediakan GPS.'));return}
    navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,timeout:12000,maximumAge:15000})
  })

  const runSelfAttendance=async(kind:'in'|'out')=>{
    if(!self){setMessage('Akun ini belum terhubung ke data karyawan aktif. Owner/HR perlu menghubungkannya di menu Tim atau Karyawan.');return}
    setLocating(true);setMessage('')
    try{
      const pos=await position()
      const rpc=kind==='in'?'attendance_check_in_self':'attendance_check_out_self'
      const {data,error}=await supabase.rpc(rpc,{p_latitude:pos.coords.latitude,p_longitude:pos.coords.longitude,p_accuracy_m:pos.coords.accuracy})
      if(error)throw error
      if(kind==='in'){
        const late=data?.status==='late'
        setMessage(`${late?'Check-in tercatat sebagai TERLAMBAT':'Check-in berhasil'} · ${data?.location||'lokasi kerja'} · jarak ${data?.distance_m??0} m dari batas ${data?.radius_m??0} m.`)
      }else setMessage(`Check-out berhasil · ${data?.location||'lokasi kerja'} · jarak ${data?.distance_m??0} m.`)
      await load()
    }catch(error:any){
      const text=error?.message||''
      if(error?.code===1||/denied|permission/i.test(text)) setMessage('Izin lokasi ditolak. Aktifkan izin lokasi browser lalu coba lagi.')
      else if(error?.code===2) setMessage('Posisi GPS belum ditemukan. Pastikan GPS aktif lalu coba lagi.')
      else if(error?.code===3) setMessage('GPS terlalu lama merespons. Coba di area dengan sinyal lokasi lebih baik.')
      else setMessage(text||'Presensi belum dapat diproses.')
    }finally{setLocating(false)}
  }

  const markManual=async(employee:Employee)=>{
    const day=localDate(timezone)
    setBusy(employee.id);setMessage('')
    const {error}=await supabase.from('attendance_records').insert({company_id:profile.company_id,employee_id:employee.id,attendance_date:day,status:'present',check_in_at:new Date().toISOString(),location_note:'Presensi manual oleh Owner/HR',admin_note:'Override presensi manual'})
    setBusy('')
    setMessage(error?(error.code==='23505'?'Presensi karyawan ini sudah tercatat hari ini.':error.message):`Presensi manual ${employee.full_name} berhasil dicatat.`)
    if(!error)await load()
  }

  const marked=new Set(rows.map(row=>row.employee_id))
  const myRecord=rows.find(row=>row.employee_id===self?.id)

  return <section className="page">
    <div className="intro"><div><p className="eyebrow">Kehadiran</p><h1>Presensi hari ini</h1><p>GPS hanya dibaca saat check-in/check-out. Sistem memvalidasi titik kerja, radius, tanggal lokal perusahaan, dan keterlambatan di server.</p></div>{self&&<div className="attendance-actions">{!myRecord?<button className="button primary" onClick={()=>void runSelfAttendance('in')} disabled={locating}><MapPin/>{locating?'Memeriksa GPS…':'Check-in saya'}</button>:!myRecord.check_out_at?<button className="button secondary" onClick={()=>void runSelfAttendance('out')} disabled={locating}><Clock3/>{locating?'Memeriksa GPS…':'Check-out saya'}</button>:<span className="badge active">Presensi lengkap</span>}</div>}</div>
    {message&&<p className="note" role="status">{message}</p>}
    {!self&&!canManage&&<article className="card"><Empty text="Akun belum terhubung ke data karyawan aktif. Minta Owner/HR menghubungkan akun pada menu Tim."/></article>}
    <div className="cols">
      {canManage&&<article className="card"><div className="card-title"><div><h3>Belum presensi</h3><small>Gunakan Hadir hanya sebagai override manual bila karyawan tidak dapat check-in sendiri.</small></div><span className="badge">{employees.filter(x=>!marked.has(x.id)).length} orang</span></div>{employees.filter(x=>!marked.has(x.id)).map(employee=><div className="row" key={employee.id}><div className="avatar mini">{employee.full_name[0]}</div><div><b>{employee.full_name}</b><small>{employee.position||employee.department||'Karyawan'}</small></div><button className="button secondary" disabled={busy===employee.id} onClick={()=>void markManual(employee)}>{busy===employee.id?'Menyimpan…':'Hadir manual'}</button></div>)}{!employees.filter(x=>!marked.has(x.id)).length&&<Empty text="Semua karyawan aktif sudah memiliki catatan presensi hari ini."/>}</article>}
      <article className="card"><div className="card-title"><h3>Masuk hari ini</h3><span className="badge active">{rows.length} tercatat</span></div>{rows.map(row=><div className="row" key={row.id}><span className="dot"/><div><b>{row.employees?.full_name||'Karyawan'}</b><small>{fmtTime(row.check_in_at)}{row.check_out_at?` · selesai ${fmtTime(row.check_out_at)}`:''}{row.location_note?` · ${row.location_note}`:''}</small></div><span className={`badge ${row.status==='late'?'draft':'active'}`}>{statusLabel(row.status)}</span></div>)}{!rows.length&&<Empty text="Belum ada presensi hari ini."/>}</article>
    </div>
  </section>
}
