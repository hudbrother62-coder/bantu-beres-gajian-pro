import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, CheckCircle2, Clock3, Download, Filter, MapPin, Search, Users, UserX } from 'lucide-react'
import { supabase } from './lib/supabase'
import './attendance-admin.css'

type Profile = { id: string; company_id: string; role: string }
type Employee = { id:string; employee_code:string; full_name:string; department?:string|null; position?:string|null; is_active:boolean }
type Attendance = { id:string; employee_id:string; attendance_date:string; status:string; check_in_at?:string|null; check_out_at?:string|null; location_note?:string|null; admin_note?:string|null }

type DailyRow = Employee & { attendance?: Attendance }

type MonthlyRow = Employee & {
  present:number
  late:number
  leave:number
  sick:number
  absent:number
  holiday:number
  total:number
  rate:number
}

const statusLabels:Record<string,string>={present:'Hadir',late:'Terlambat',absent:'Alfa',leave:'Izin',sick:'Sakit',holiday:'Libur',missing:'Belum presensi'}
const pad=(n:number)=>String(n).padStart(2,'0')
const localToday=()=>{const d=new Date();return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`}
const currentMonth=()=>localToday().slice(0,7)
const formatTime=(value?:string|null)=>value?new Date(value).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'}):'—'
const csvCell=(v:unknown)=>`"${String(v??'').replace(/^[=+@\-\t\r]/,"'$&").replaceAll('"','""')}"`
const downloadCsv=(name:string,rows:unknown[][])=>{const blob=new Blob(['\uFEFF'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();URL.revokeObjectURL(url)}

export function AdminAttendance({profile}:{profile:Profile}){
  const [tab,setTab]=useState<'daily'|'monthly'>('daily')
  const [date,setDate]=useState(localToday())
  const [month,setMonth]=useState(currentMonth())
  const [employees,setEmployees]=useState<Employee[]>([])
  const [dailyRecords,setDailyRecords]=useState<Attendance[]>([])
  const [monthlyRecords,setMonthlyRecords]=useState<Attendance[]>([])
  const [employeeFilter,setEmployeeFilter]=useState('all')
  const [departmentFilter,setDepartmentFilter]=useState('all')
  const [statusFilter,setStatusFilter]=useState('all')
  const [query,setQuery]=useState('')
  const [loading,setLoading]=useState(true)
  const [message,setMessage]=useState('')

  const loadEmployees=async()=>{
    const {data,error}=await supabase.from('employees').select('id,employee_code,full_name,department,position,is_active').eq('is_active',true).order('full_name')
    if(error){setMessage('Data karyawan belum dapat dimuat.');return}
    setEmployees((data||[]) as Employee[])
  }
  const loadDaily=async()=>{
    const {data,error}=await supabase.from('attendance_records').select('id,employee_id,attendance_date,status,check_in_at,check_out_at,location_note,admin_note').eq('attendance_date',date).order('check_in_at')
    if(error){setMessage('Presensi harian belum dapat dimuat.');return}
    setDailyRecords((data||[]) as Attendance[])
  }
  const loadMonthly=async()=>{
    const [y,m]=month.split('-').map(Number)
    const start=`${month}-01`
    const end=`${month}-${pad(new Date(y,m,0).getDate())}`
    const {data,error}=await supabase.from('attendance_records').select('id,employee_id,attendance_date,status,check_in_at,check_out_at,location_note,admin_note').gte('attendance_date',start).lte('attendance_date',end).order('attendance_date')
    if(error){setMessage('Rekap bulanan belum dapat dimuat.');return}
    setMonthlyRecords((data||[]) as Attendance[])
  }

  useEffect(()=>{void(async()=>{setLoading(true);await loadEmployees();setLoading(false)})()},[])
  useEffect(()=>{void loadDaily()},[date])
  useEffect(()=>{void loadMonthly()},[month])

  const departments=useMemo(()=>Array.from(new Set(employees.map(e=>e.department).filter(Boolean) as string[])).sort(),[employees])
  const dailyRows=useMemo<DailyRow[]>(()=>employees.map(e=>({...e,attendance:dailyRecords.find(r=>r.employee_id===e.id)})),[employees,dailyRecords])
  const visibleDaily=useMemo(()=>dailyRows.filter(row=>{
    const status=row.attendance?.status||'missing'
    const q=query.trim().toLowerCase()
    return (employeeFilter==='all'||row.id===employeeFilter)
      &&(departmentFilter==='all'||(row.department||'')===departmentFilter)
      &&(statusFilter==='all'||status===statusFilter)
      &&(!q||row.full_name.toLowerCase().includes(q)||row.employee_code.toLowerCase().includes(q)||(row.department||'').toLowerCase().includes(q))
  }),[dailyRows,employeeFilter,departmentFilter,statusFilter,query])

  const monthlyRows=useMemo<MonthlyRow[]>(()=>employees.map(e=>{
    const list=monthlyRecords.filter(r=>r.employee_id===e.id)
    const count=(s:string)=>list.filter(r=>r.status===s).length
    const present=count('present'),late=count('late'),leave=count('leave'),sick=count('sick'),absent=count('absent'),holiday=count('holiday')
    const accountable=present+late+leave+sick+absent
    return {...e,present,late,leave,sick,absent,holiday,total:list.length,rate:accountable?Math.round(((present+late)/accountable)*100):0}
  }),[employees,monthlyRecords])
  const visibleMonthly=useMemo(()=>monthlyRows.filter(row=>{
    const q=query.trim().toLowerCase()
    return (employeeFilter==='all'||row.id===employeeFilter)
      &&(departmentFilter==='all'||(row.department||'')===departmentFilter)
      &&(!q||row.full_name.toLowerCase().includes(q)||row.employee_code.toLowerCase().includes(q)||(row.department||'').toLowerCase().includes(q))
  }),[monthlyRows,employeeFilter,departmentFilter,query])

  const monthSummary=useMemo(()=>{
    const count=(s:string)=>monthlyRecords.filter(r=>r.status===s).length
    const present=count('present'),late=count('late'),leave=count('leave'),sick=count('sick'),absent=count('absent')
    const accountable=present+late+leave+sick+absent
    return {present,late,leave,sick,absent,rate:accountable?Math.round(((present+late)/accountable)*100):0}
  },[monthlyRecords])

  const dailySummary=useMemo(()=>({
    present:dailyRows.filter(r=>r.attendance?.status==='present').length,
    late:dailyRows.filter(r=>r.attendance?.status==='late').length,
    leave:dailyRows.filter(r=>['leave','sick'].includes(r.attendance?.status||'')).length,
    missing:dailyRows.filter(r=>!r.attendance).length,
  }),[dailyRows])

  const trend=useMemo(()=>{
    const [y,m]=month.split('-').map(Number)
    const days=new Date(y,m,0).getDate()
    return Array.from({length:days},(_,i)=>{
      const day=`${month}-${pad(i+1)}`
      const rows=monthlyRecords.filter(r=>r.attendance_date===day)
      return {day:i+1,total:rows.length,present:rows.filter(r=>['present','late'].includes(r.status)).length}
    })
  },[monthlyRecords,month])
  const trendMax=Math.max(1,...trend.map(x=>x.total))

  const markPresent=async(employeeId:string)=>{
    setMessage('')
    const {error}=await supabase.from('attendance_records').insert({company_id:profile.company_id,employee_id:employeeId,attendance_date:date,status:'present',check_in_at:new Date().toISOString(),location_note:'Dicatat Owner/HR',admin_note:'Presensi manual dari dashboard'})
    setMessage(error?'Presensi belum dapat disimpan. Mungkin tanggal ini sudah memiliki catatan.':'Presensi manual berhasil ditambahkan.')
    if(!error){await loadDaily();if(date.startsWith(month))await loadMonthly()}
  }

  const exportRows=()=>{
    if(tab==='daily'){
      downloadCsv(`presensi-harian-${date}.csv`,[['Tanggal','Kode','Nama','Divisi','Status','Check-in','Check-out','Lokasi'],...visibleDaily.map(r=>[date,r.employee_code,r.full_name,r.department||'',statusLabels[r.attendance?.status||'missing'],formatTime(r.attendance?.check_in_at),formatTime(r.attendance?.check_out_at),r.attendance?.location_note||''])])
      return
    }
    downloadCsv(`rekap-presensi-${month}.csv`,[['Bulan','Kode','Nama','Divisi','Hadir','Terlambat','Izin','Sakit','Alfa','Persentase Kehadiran'],...visibleMonthly.map(r=>[month,r.employee_code,r.full_name,r.department||'',r.present,r.late,r.leave,r.sick,r.absent,`${r.rate}%`])])
  }

  if(!['owner','hr_admin'].includes(profile.role))return null

  return <section className="page attendance-admin">
    <div className="attendance-hero">
      <div><p className="eyebrow">Kontrol kehadiran</p><h1>Presensi Karyawan</h1><p>Pantau harian, cek keterlambatan, dan baca rekap bulanan dari satu tampilan.</p></div>
      <div className="attendance-hero-actions"><span className="attendance-role">Akses Owner & HR/Admin</span><button className="button primary" onClick={exportRows}><Download/>Unduh rekap</button></div>
    </div>

    {message&&<p className="note" role="status">{message}</p>}

    <div className="attendance-tabs"><button className={tab==='daily'?'active':''} onClick={()=>setTab('daily')}><CalendarDays/>Harian</button><button className={tab==='monthly'?'active':''} onClick={()=>setTab('monthly')}><Clock3/>Rekap bulanan</button></div>

    <article className="card attendance-filters">
      <label><span>{tab==='daily'?'Tanggal':'Bulan'}</span>{tab==='daily'?<input type="date" value={date} onChange={e=>setDate(e.target.value)}/>:<input type="month" value={month} onChange={e=>setMonth(e.target.value)}/>}</label>
      <label><span>Karyawan</span><select value={employeeFilter} onChange={e=>setEmployeeFilter(e.target.value)}><option value="all">Semua karyawan</option>{employees.map(e=><option key={e.id} value={e.id}>{e.full_name}</option>)}</select></label>
      <label><span>Divisi</span><select value={departmentFilter} onChange={e=>setDepartmentFilter(e.target.value)}><option value="all">Semua divisi</option>{departments.map(d=><option key={d}>{d}</option>)}</select></label>
      {tab==='daily'&&<label><span>Status</span><select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="all">Semua status</option><option value="present">Hadir</option><option value="late">Terlambat</option><option value="leave">Izin</option><option value="sick">Sakit</option><option value="absent">Alfa</option><option value="missing">Belum presensi</option></select></label>}
      <label className="attendance-search"><span>Pencarian</span><div><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Nama, kode, divisi..."/></div></label>
      <button className="button secondary attendance-filter-reset" onClick={()=>{setEmployeeFilter('all');setDepartmentFilter('all');setStatusFilter('all');setQuery('')}}><Filter/>Reset</button>
    </article>

    {loading?<div className="card attendance-loading">Memuat data presensi…</div>:tab==='daily'?<>
      <div className="attendance-stats">
        <MiniStat icon={<Users/>} label="Karyawan aktif" value={employees.length} tone="purple"/>
        <MiniStat icon={<CheckCircle2/>} label="Hadir" value={dailySummary.present} tone="green"/>
        <MiniStat icon={<Clock3/>} label="Terlambat" value={dailySummary.late} tone="amber"/>
        <MiniStat icon={<UserX/>} label="Belum presensi" value={dailySummary.missing} tone="red"/>
      </div>
      <article className="card attendance-table-card">
        <div className="attendance-section-head"><div><p className="eyebrow">Presensi harian</p><h3>{new Date(`${date}T00:00:00`).toLocaleDateString('id-ID',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</h3></div><span className="badge">{visibleDaily.length} karyawan</span></div>
        <div className="attendance-table-wrap"><table><thead><tr><th>Karyawan</th><th>Divisi</th><th>Status</th><th>Check-in</th><th>Check-out</th><th>Lokasi</th><th>Aksi</th></tr></thead><tbody>{visibleDaily.map(row=>{const status=row.attendance?.status||'missing';return <tr key={row.id}><td><div className="attendance-person"><span>{row.full_name.slice(0,1)}</span><div><b>{row.full_name}</b><small>{row.employee_code} · {row.position||'Karyawan'}</small></div></div></td><td>{row.department||'—'}</td><td><span className={`attendance-status ${status}`}>{statusLabels[status]}</span></td><td>{formatTime(row.attendance?.check_in_at)}</td><td>{formatTime(row.attendance?.check_out_at)}</td><td><span className="attendance-location"><MapPin/>{row.attendance?.location_note||'—'}</span></td><td>{!row.attendance?<button className="button secondary attendance-mark" onClick={()=>void markPresent(row.id)}>Tandai hadir</button>:<span className="attendance-done">Tercatat</span>}</td></tr>})}</tbody></table>{!visibleDaily.length&&<div className="attendance-empty">Tidak ada data yang sesuai filter.</div>}</div>
      </article>
    </>:<>
      <div className="attendance-stats monthly">
        <MiniStat icon={<Users/>} label="Karyawan aktif" value={employees.length} tone="purple"/>
        <MiniStat icon={<CheckCircle2/>} label="Hadir" value={monthSummary.present} tone="green"/>
        <MiniStat icon={<Clock3/>} label="Terlambat" value={monthSummary.late} tone="amber"/>
        <MiniStat icon={<CalendarDays/>} label="Izin / sakit" value={monthSummary.leave+monthSummary.sick} tone="blue"/>
        <MiniStat icon={<UserX/>} label="Alfa" value={monthSummary.absent} tone="red"/>
        <MiniStat icon={<CheckCircle2/>} label="Kehadiran" value={`${monthSummary.rate}%`} tone="violet"/>
      </div>
      <div className="attendance-month-grid">
        <article className="card attendance-trend"><div className="attendance-section-head"><div><p className="eyebrow">Trend kehadiran</p><h3>{new Date(`${month}-01T00:00:00`).toLocaleDateString('id-ID',{month:'long',year:'numeric'})}</h3></div></div><div className="trend-bars">{trend.map(d=><div className="trend-item" key={d.day} title={`${d.day}: ${d.present} hadir dari ${d.total} catatan`}><div className="trend-track"><i style={{height:`${Math.max(5,(d.present/trendMax)*100)}%`}}/><span style={{height:`${Math.max(5,((d.total-d.present)/trendMax)*100)}%`}}/></div><small>{d.day}</small></div>)}</div></article>
        <article className="card attendance-month-table"><div className="attendance-section-head"><div><p className="eyebrow">Rekap per karyawan</p><h3>Ringkasan satu bulan</h3></div><span className="badge">{visibleMonthly.length} karyawan</span></div><div className="attendance-table-wrap"><table><thead><tr><th>Karyawan</th><th>Hadir</th><th>Terlambat</th><th>Izin</th><th>Sakit</th><th>Alfa</th><th>Kehadiran</th></tr></thead><tbody>{visibleMonthly.map(row=><tr key={row.id}><td><div className="attendance-person"><span>{row.full_name.slice(0,1)}</span><div><b>{row.full_name}</b><small>{row.department||'Tanpa divisi'}</small></div></div></td><td>{row.present}</td><td>{row.late}</td><td>{row.leave}</td><td>{row.sick}</td><td>{row.absent}</td><td><b>{row.rate}%</b></td></tr>)}</tbody></table>{!visibleMonthly.length&&<div className="attendance-empty">Belum ada data rekap pada filter ini.</div>}</div></article>
      </div>
      <p className="attendance-footnote">Persentase kehadiran dihitung dari catatan Hadir + Terlambat dibanding total catatan kerja yang berstatus Hadir, Terlambat, Izin, Sakit, atau Alfa. Hari tanpa catatan tidak diasumsikan Alfa.</p>
    </>}
  </section>
}

function MiniStat({icon,label,value,tone}:{icon:React.ReactNode;label:string;value:string|number;tone:string}){return <article className="attendance-stat card"><span className={tone}>{icon}</span><div><small>{label}</small><b>{value}</b></div></article>}
