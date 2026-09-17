import { useEffect, useState } from 'react'
import './action-feedback.css'

type PendingAction={button:HTMLButtonElement;label:string}|null

const confirmationPattern=/\b(hapus|delete|tolak|reject|batalkan|cancel|setujui|approve|kunci|lock|bayar|paid|keluar|logout|nonaktif|disable)\b/i
const actionSelector='.button,.logout,button[type="submit"],[data-action-feedback="on"]'
const skipSelector='[data-action-feedback="off"],.theme-toggle,.icon,.backdrop,.scrim,.notification-button,.notification-item,.notification-read-all,.side nav button,.bottom button,.tabs button,.filters button'

function actionLabel(button:HTMLButtonElement){
 return (button.getAttribute('aria-label')||button.getAttribute('title')||button.textContent||'Tindakan').replace(/\s+/g,' ').trim()
}
function confirmationText(label:string){
 const value=label.toLowerCase()
 if(value.includes('hapus')||value.includes('delete'))return `Hapus data ini? Pastikan data yang dipilih sudah benar karena tindakan ini dapat memengaruhi catatan perusahaan.`
 if(value.includes('tolak')||value.includes('reject'))return `Tolak pengajuan ini? Status pengajuan akan diperbarui setelah Anda melanjutkan.`
 if(value.includes('batalkan')||value.includes('cancel'))return `Batalkan tindakan ini? Pastikan Anda memang ingin membatalkannya.`
 if(value.includes('setujui')||value.includes('approve'))return `Setujui tindakan ini? Pastikan data sudah diperiksa sebelum dilanjutkan.`
 if(value.includes('kunci')||value.includes('lock'))return `Kunci data ini? Pastikan seluruh rincian sudah diperiksa sebelum dikunci.`
 if(value.includes('bayar')||value.includes('paid'))return `Tandai sebagai dibayar? Pastikan nominal dan penerima sudah diperiksa.`
 if(value.includes('keluar')||value.includes('logout'))return `Keluar dari akun sekarang?`
 if(value.includes('nonaktif')||value.includes('disable'))return `Nonaktifkan data ini? Akses atau proses terkait dapat ikut berhenti.`
 return `Lanjutkan tindakan “${label}”?`
}

export function GlobalActionFeedback(){
 const [pending,setPending]=useState<PendingAction>(null)
 const [message,setMessage]=useState('')

 useEffect(()=>{
  let messageTimer=0
  const showMessage=(text:string)=>{
   window.clearTimeout(messageTimer)
   setMessage(text)
   messageTimer=window.setTimeout(()=>setMessage(''),1800)
  }
  const markProcessing=(button:HTMLButtonElement,label:string)=>{
   if(button.dataset.bbLock==='1')return false
   button.dataset.bbLock='1'
   button.classList.add('bb-processing')
   button.setAttribute('aria-busy','true')
   showMessage(`${label||'Tindakan'} sedang diproses…`)
   window.setTimeout(()=>{
    button.classList.remove('bb-processing')
    button.removeAttribute('aria-busy')
    delete button.dataset.bbLock
   },1400)
   return true
  }
  const onClick=(event:MouseEvent)=>{
   const target=event.target instanceof Element?event.target:null
   const button=target?.closest('button') as HTMLButtonElement|null
   if(!button||button.disabled||!button.matches(actionSelector)||button.matches(skipSelector))return
   const label=actionLabel(button)
   if(button.dataset.bbLock==='1'){
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation()
    showMessage('Tindakan sebelumnya masih diproses. Mohon tunggu sebentar.')
    return
   }
   if(button.dataset.bbConfirmed==='1'){
    delete button.dataset.bbConfirmed
    markProcessing(button,label)
    return
   }
   if(button.dataset.confirm==='true'||confirmationPattern.test(label)){
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation()
    setPending({button,label})
    return
   }
   markProcessing(button,label)
  }
  document.addEventListener('click',onClick,true)
  return()=>{document.removeEventListener('click',onClick,true);window.clearTimeout(messageTimer)}
 },[])

 const continueAction=()=>{
  if(!pending)return
  const {button}=pending
  setPending(null)
  if(!document.body.contains(button))return
  button.dataset.bbConfirmed='1'
  window.setTimeout(()=>button.click(),0)
 }

 return <>
  {message&&<div className="bb-action-toast" role="status" aria-live="polite"><span className="bb-action-spinner"/>{message}</div>}
  {pending&&<div className="bb-confirm-layer" role="presentation">
   <button type="button" className="bb-confirm-backdrop" data-action-feedback="off" onClick={()=>setPending(null)} aria-label="Tutup konfirmasi"/>
   <section className="bb-confirm-card" role="dialog" aria-modal="true" aria-labelledby="bb-confirm-title">
    <span className="bb-confirm-icon">!</span>
    <div><p>Konfirmasi tindakan</p><h3 id="bb-confirm-title">{pending.label}</h3><span>{confirmationText(pending.label)}</span></div>
    <div className="bb-confirm-actions">
     <button type="button" className="button secondary" data-action-feedback="off" onClick={()=>setPending(null)}>Batal</button>
     <button type="button" className="button primary" data-action-feedback="off" onClick={continueAction}>Ya, lanjutkan</button>
    </div>
   </section>
  </div>}
 </>
}
