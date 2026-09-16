import { useEffect, useRef, useState } from 'react'
import { Bell, CheckCheck, CircleDollarSign, ClipboardCheck, Clock3, MapPin, ShieldAlert, Users, X } from 'lucide-react'
import { supabase } from './lib/supabase'

type Profile = { id:string; company_id:string }
type Notification = {
  id:string
  title:string
  message:string
  category:string
  target_page:string
  read_at:string|null
  created_at:string
}

const iconFor=(category:string)=>{
  if(category==='approval')return <ClipboardCheck/>
  if(category==='payroll'||category==='finance')return <CircleDollarSign/>
  if(category==='attendance'||category==='schedule')return <Clock3/>
  if(category==='visit'||category==='tracking')return <MapPin/>
  if(category==='security')return <ShieldAlert/>
  return <Users/>
}

const relativeTime=(value:string)=>{
  const seconds=Math.max(0,Math.floor((Date.now()-new Date(value).getTime())/1000))
  if(seconds<60)return 'Baru saja'
  const minutes=Math.floor(seconds/60)
  if(minutes<60)return `${minutes} menit lalu`
  const hours=Math.floor(minutes/60)
  if(hours<24)return `${hours} jam lalu`
  const days=Math.floor(hours/24)
  if(days<7)return `${days} hari lalu`
  return new Date(value).toLocaleDateString('id-ID',{day:'numeric',month:'short'})
}

export function NotificationCenter({profile,setPage}:{profile:Profile;setPage:(page:string)=>void}){
  const [items,setItems]=useState<Notification[]>([]),[open,setOpen]=useState(false),[loading,setLoading]=useState(true)
  const wrap=useRef<HTMLDivElement>(null)
  const load=async()=>{
    const {data}=await supabase.from('notifications').select('id,title,message,category,target_page,read_at,created_at').order('created_at',{ascending:false}).limit(40)
    setItems((data||[]) as Notification[]);setLoading(false)
  }
  useEffect(()=>{
    void load()
    const channel=supabase.channel(`notifications:${profile.id}`).on('postgres_changes',{event:'*',schema:'public',table:'notifications',filter:`recipient_id=eq.${profile.id}`},()=>void load()).subscribe()
    return()=>{void supabase.removeChannel(channel)}
  },[profile.id])
  useEffect(()=>{
    const outside=(event:MouseEvent)=>{if(open&&!wrap.current?.contains(event.target as Node))setOpen(false)}
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')setOpen(false)}
    document.addEventListener('mousedown',outside);document.addEventListener('keydown',escape)
    return()=>{document.removeEventListener('mousedown',outside);document.removeEventListener('keydown',escape)}
  },[open])
  const unread=items.filter(item=>!item.read_at).length
  const markRead=async(item:Notification)=>{
    if(!item.read_at){await supabase.from('notifications').update({read_at:new Date().toISOString()}).eq('id',item.id);setItems(current=>current.map(row=>row.id===item.id?{...row,read_at:new Date().toISOString()}:row))}
    setPage(item.target_page||'Beranda');setOpen(false)
  }
  const markAll=async()=>{
    await supabase.from('notifications').update({read_at:new Date().toISOString()}).eq('recipient_id',profile.id).is('read_at',null)
    setItems(current=>current.map(row=>({...row,read_at:row.read_at||new Date().toISOString()})))
  }
  return <div className="notification-wrap" ref={wrap}><button type="button" className="icon notification-button" aria-label={`Notifikasi${unread?`, ${unread} belum dibaca`:''}`} aria-expanded={open} onClick={()=>setOpen(value=>!value)}><Bell/>{unread>0&&<span className="notification-count">{unread>99?'99+':unread}</span>}</button>{open&&<section className="notification-panel" aria-label="Daftar notifikasi"><header><div><b>Notifikasi</b><small>{unread?`${unread} belum dibaca`:'Semua sudah dibaca'}</small></div><button className="icon" aria-label="Tutup notifikasi" onClick={()=>setOpen(false)}><X/></button></header>{unread>0&&<button type="button" className="notification-read-all" onClick={()=>void markAll()}><CheckCheck/>Tandai semua dibaca</button>}<div className="notification-list">{loading?<p className="notification-empty">Memuat pemberitahuan…</p>:items.length?items.map(item=><button type="button" key={item.id} className={`notification-item ${item.read_at?'':'unread'}`} onClick={()=>void markRead(item)}><span className={`notification-symbol ${item.category}`}>{iconFor(item.category)}</span><span><b>{item.title}</b><p>{item.message}</p><small>{relativeTime(item.created_at)} · Buka {item.target_page}</small></span>{!item.read_at&&<i/>}</button>):<p className="notification-empty">Belum ada pemberitahuan. Aktivitas penting dari seluruh fitur akan muncul di sini.</p>}</div></section>}</div>
}
