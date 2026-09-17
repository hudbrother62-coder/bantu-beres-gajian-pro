import { useCallback, useEffect, useState } from 'react'
import { Clock3, MapPin } from 'lucide-react'
import { supabase } from './lib/supabase'
import { AdminAttendance } from './attendance-admin'

type Profile={id:string;company_id:string;full_name?:string;role:string}
type Employee={id:string;employee_code:string;full_name:string;department?:string|null;position?:string|null;is_active:boolean;profile_id?:string|null}
type AttendanceRow={id:string;employee_id:string;attendance_date:string;status:string;check_in_at?:string|null;check_out_at?:string|null;location_note?:string|null;employees?:{full_name?:string|null;employee_code?:string|null}|null}

const statusLabel=(status:string)=>({present:'Hadir',late:'Terlambat',absent:'Alfa',leave:'Izin/Cuti',sick:'Sakit',holiday:'Libur'} as Record<string,string>)[status]||status
const fmtTime=(value?:string|null)=>value?new Date(value).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'}):'—'
const localDate=(timezone:string)=>new Intl.DateTimeFormat('en-CA',{timeZone:timezone||'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())

function Empty({text}:{text:string}){return <div className="empty"><p>{text}</p></div>}

export function AttendanceManagement({profile}:{profile:Profile}){
  if(['owner','hr_admin'].includes(profile.role)) return <AdminAttendance profile={profile}/>
  return <SelfAttendance profile={profile}/>
}

function SelfAttendance({profile}:{profile:Profile}){
  const [rows,setRows]=useState<AttendanceRow[]>([])
  const [self,setSelf]=useState<Employee|null>(null)
  const [timezone,setTimezone]=useState('Asia/Jakarta')
  const [message,setMessage]=useState('')
  const [locating,setLocating]=useState(false)

  const load=useCallback(async()=>{
    const companyResult=await supabase.from('companies').select('timezone').eq('id',profile.company_id).single()
    const tz=companyResult.data?.timezone||'Asia/Jakarta'
    setTimezone(tz)
    const day=localDate(tz)
    const [attendanceResult,selfResult]=await Promise.all([
      supabase.from('attendance_records').select('id,employee_id,attendance_date,status,check_in_at,check_out_at,location_note,employees(full_name,employee_code)').eq('attendance_date',day).order('check_in_at'),
      supabase.from('employees').select('id,employee_code,full_name,department,position,is_active,profile_id').eq('profile_id',profile.id).eq('is_active',true).maybeSingle(),
    ])
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

  const myRecord=rows.find(row=>row.employee_id===self?.id)

  return <section className="page">
    <div className="intro"><div><p className="eyebrow">Kehadiran saya</p><h1>Presensi hari ini</h1><p>Check-in dan check-out menggunakan lokasi perangkat. Sistem memvalidasi titik kerja, radius, tanggal lokal perusahaan, dan keterlambatan di server.</p></div>{self&&<div className="attendance-actions">{!myRecord?<button className="button primary" onClick={()=>void runSelfAttendance('in')} disabled={locating}><MapPin/>{locating?'Memeriksa GPS…':'Check-in saya'}</button>:!myRecord.check_out_at?<button className="button secondary" onClick={()=>void runSelfAttendance('out')} disabled={locating}><Clock3/>{locating?'Memeriksa GPS…':'Check-out saya'}</button>:<span className="badge active">Presensi lengkap</span>}</div>}</div>
    {message&&<p className="note" role="status">{message}</p>}
    {!self?<article className="card"><Empty text="Akun belum terhubung ke data karyawan aktif. Minta Owner/HR menghubungkan akun pada menu Tim."/></article>:<article className="card"><div className="card-title"><div><h3>Status hari ini</h3><small>{self.full_name} · {self.position||self.department||'Karyawan'} · {timezone}</small></div>{myRecord?<span className={`badge ${myRecord.status==='late'?'draft':'active'}`}>{statusLabel(myRecord.status)}</span>:<span className="badge">Belum presensi</span>}</div>{myRecord?<div className="row"><MapPin/><div><b>{fmtTime(myRecord.check_in_at)} — {fmtTime(myRecord.check_out_at)}</b><small>{myRecord.location_note||'Lokasi tervalidasi sistem'}</small></div></div>:<Empty text="Belum ada catatan presensi hari ini."/>}</article>}
  </section>
}
