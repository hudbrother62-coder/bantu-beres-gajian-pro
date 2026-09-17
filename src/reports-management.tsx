import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, FileSpreadsheet, FileText, Printer, RefreshCw } from 'lucide-react'
import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from 'docx'
import { supabase } from './lib/supabase'
import './report.css'

type Profile={id:string;company_id:string;full_name:string;username:string;role:string}
type ReportKind='operational'|'hr'|'payroll'|'finance'
type Row=Record<string,any>
type ReportSection={title:string;description?:string;columns:string[];rows:(string|number)[][]}
type ReportMetric={label:string;value:string;note?:string}
type ReportModel={title:string;subtitle:string;metrics:ReportMetric[];notes:string[];sections:ReportSection[]}

const money=(n:number)=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(n||0)
const dateID=(v:string)=>v?new Date(`${v}T00:00:00`).toLocaleDateString('id-ID',{day:'2-digit',month:'long',year:'numeric'}):'—'
const statusID=(v:string)=>({present:'Hadir',late:'Terlambat',absent:'Alfa',leave:'Izin/Cuti',sick:'Sakit',holiday:'Libur',submitted:'Menunggu',approved:'Disetujui',rejected:'Ditolak',cancelled:'Dibatalkan',draft:'Draft',review:'Review',locked:'Dikunci',paid:'Dibayar'} as Record<string,string>)[v]||v||'—'
const monthRange=()=>{const d=new Date(),y=d.getFullYear(),m=d.getMonth();return{start:`${y}-${String(m+1).padStart(2,'0')}-01`,end:`${y}-${String(m+1).padStart(2,'0')}-${String(new Date(y,m+1,0).getDate()).padStart(2,'0')}`}}
const escapeHtml=(value:unknown)=>String(value??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]||ch))
const csvCell=(value:unknown)=>`"${String(value??'').replace(/^[=+@\-\t\r]/,"'$&").replaceAll('"','""')}"`

export function ReportsManagement({profile}:{profile:Profile}){
 const initial=monthRange()
 const [kind,setKind]=useState<ReportKind>('operational'),[start,setStart]=useState(initial.start),[end,setEnd]=useState(initial.end)
 const [company,setCompany]=useState<Row>({}),[employees,setEmployees]=useState<Row[]>([]),[attendance,setAttendance]=useState<Row[]>([]),[leave,setLeave]=useState<Row[]>([]),[overtime,setOvertime]=useState<Row[]>([]),[cash,setCash]=useState<Row[]>([]),[reimburse,setReimburse]=useState<Row[]>([]),[payroll,setPayroll]=useState<Row[]>([]),[payrollEntries,setPayrollEntries]=useState<Row[]>([]),[petty,setPetty]=useState<Row[]>([])
 const [loading,setLoading]=useState(false),[message,setMessage]=useState('')

 const load=useCallback(async()=>{
  if(!start||!end||end<start){setMessage('Periode laporan belum valid.');return}
  setLoading(true);setMessage('')
  const [co,em,at,lv,ot,ca,re,pp,pc]=await Promise.all([
   supabase.from('companies').select('name,legal_name,address,phone,timezone,payroll_day').eq('id',profile.company_id).single(),
   supabase.from('employees').select('id,employee_code,full_name,department,position,employment_type,hire_date,base_salary,is_active').order('full_name'),
   supabase.from('attendance_records').select('attendance_date,status,check_in_at,check_out_at,location_note,employee_id,employees(employee_code,full_name,department)').gte('attendance_date',start).lte('attendance_date',end).order('attendance_date'),
   supabase.from('leave_requests').select('start_date,end_date,request_type,reason,status,employee_id,employees(employee_code,full_name)').lte('start_date',end).gte('end_date',start).order('start_date'),
   supabase.from('overtime_requests').select('overtime_date,start_time,end_time,reason,status,employee_id,employees(employee_code,full_name)').gte('overtime_date',start).lte('overtime_date',end).order('overtime_date'),
   supabase.from('cash_advances').select('request_date,amount,remaining_amount,reason,status,employee_id,employees(employee_code,full_name)').gte('request_date',start).lte('request_date',end).order('request_date'),
   supabase.from('reimbursements').select('expense_date,amount,description,status,employee_id,employees(employee_code,full_name)').gte('expense_date',start).lte('expense_date',end).order('expense_date'),
   supabase.from('payroll_periods').select('*').lte('period_start',end).gte('period_end',start).order('period_start'),
   supabase.from('petty_cash_entries').select('*').gte('entry_date',start).lte('entry_date',end).order('entry_date')
  ])
  const firstError=[co,em,at,lv,ot,ca,re,pp,pc].find(x=>x.error)?.error
  if(firstError){setMessage('Sebagian data laporan belum dapat dimuat. Periksa hak akses atau periode laporan.');setLoading(false);return}
  setCompany(co.data||{});setEmployees(em.data||[]);setAttendance(at.data||[]);setLeave(lv.data||[]);setOvertime(ot.data||[]);setCash(ca.data||[]);setReimburse(re.data||[]);setPayroll(pp.data||[]);setPetty(pc.data||[])
  const periodIds=(pp.data||[]).map((p:any)=>p.id)
  if(periodIds.length){const pe=await supabase.from('payroll_entries').select('payroll_period_id,employee_id,base_salary,earnings,deductions,net_pay,employee_snapshot').in('payroll_period_id',periodIds).order('created_at');setPayrollEntries(pe.data||[])}else setPayrollEntries([])
  setLoading(false)
 },[profile.company_id,start,end])
 useEffect(()=>{void load()},[load])

 const model=useMemo<ReportModel>(()=>{
  const active=employees.filter(x=>x.is_active),present=attendance.filter(x=>['present','late'].includes(x.status)).length,late=attendance.filter(x=>x.status==='late').length,absent=attendance.filter(x=>x.status==='absent').length
  const pending=[...leave,...overtime,...cash,...reimburse].filter(x=>x.status==='submitted').length
  const payrollNet=payroll.reduce((s,x)=>s+Number(x.total_net||0),0),pettyIn=petty.filter(x=>x.kind==='income').reduce((s,x)=>s+Number(x.amount||0),0),pettyOut=petty.filter(x=>x.kind==='expense').reduce((s,x)=>s+Number(x.amount||0),0)
  const deptMap=new Map<string,number>();active.forEach(x=>deptMap.set(x.department||'Belum ditentukan',(deptMap.get(x.department||'Belum ditentukan')||0)+1))
  const employeeAttendance=active.map(e=>{const rows=attendance.filter(a=>a.employee_id===e.id);return[e.employee_code,e.full_name,e.department||'—',rows.filter(r=>['present','late'].includes(r.status)).length,rows.filter(r=>r.status==='late').length,rows.filter(r=>['leave','sick'].includes(r.status)).length,rows.filter(r=>r.status==='absent').length] as (string|number)[]})
  const requestRows=[...leave.map(x=>['Cuti/Izin',x.start_date,x.employees?.full_name||'—',x.reason||x.request_type,statusID(x.status)]),...overtime.map(x=>['Lembur',x.overtime_date,x.employees?.full_name||'—',x.reason||'—',statusID(x.status)]),...cash.map(x=>['Kasbon',x.request_date,x.employees?.full_name||'—',money(Number(x.amount)),statusID(x.status)]),...reimburse.map(x=>['Reimburse',x.expense_date,x.employees?.full_name||'—',money(Number(x.amount)),statusID(x.status)])]
  const attendanceRows=attendance.map(x=>[x.attendance_date,x.employees?.employee_code||'—',x.employees?.full_name||'—',x.employees?.department||'—',statusID(x.status),x.check_in_at?new Date(x.check_in_at).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'}):'—',x.check_out_at?new Date(x.check_out_at).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'}):'—',x.location_note||'—'])
  const payrollRows=payroll.map(x=>[`${dateID(x.period_start)} – ${dateID(x.period_end)}`,dateID(x.payment_date),statusID(x.status),money(Number(x.total_gross)),money(Number(x.total_deduction)),money(Number(x.total_net))])
  const payrollDetailRows=payrollEntries.map(x=>[x.employee_snapshot?.employee_code||'—',x.employee_snapshot?.full_name||'—',money(Number(x.base_salary)),money(Number(x.earnings)),money(Number(x.deductions)),money(Number(x.net_pay))])
  const pettyRows=petty.map(x=>[dateID(x.entry_date),x.kind==='income'?'Kas Masuk':'Kas Keluar',x.category,x.description,money(Number(x.amount)),x.reference_no||'—'])
  const financeRequestRows=[...cash.map(x=>[dateID(x.request_date),'Kasbon',x.employees?.full_name||'—',money(Number(x.amount)),money(Number(x.remaining_amount)),statusID(x.status)]),...reimburse.map(x=>[dateID(x.expense_date),'Reimburse',x.employees?.full_name||'—',money(Number(x.amount)),'—',statusID(x.status)])]
  const notes:string[]=[]
  if(pending)notes.push(`${pending} pengajuan masih menunggu keputusan dan perlu ditindaklanjuti sebelum penutupan periode.`)
  if(late)notes.push(`${late} catatan keterlambatan ditemukan pada periode ini; HR dapat meninjau pola per karyawan atau divisi.`)
  if(absent)notes.push(`${absent} catatan alfa tercatat dan perlu dipastikan memiliki tindak lanjut administratif.`)
  if(payroll.some(x=>!['locked','paid'].includes(x.status)))notes.push('Masih ada periode payroll yang belum dikunci/dibayar; lakukan review sebelum laporan dianggap final.')
  if(!notes.length)notes.push('Tidak ada pengecualian utama yang terdeteksi dari data periode ini. Tetap lakukan verifikasi dokumen sumber sebelum pengesahan.')
  const common:ReportMetric[]=[{label:'Karyawan aktif',value:String(active.length)},{label:'Catatan hadir',value:String(present)},{label:'Terlambat',value:String(late)},{label:'Pengajuan pending',value:String(pending)}]
  if(kind==='hr')return{title:'Laporan SDM & Kehadiran',subtitle:'Ringkasan tenaga kerja, presensi, dan pengajuan karyawan',metrics:common,notes,sections:[{title:'Komposisi SDM',columns:['Divisi','Karyawan Aktif'],rows:[...deptMap.entries()]},{title:'Rekap Kehadiran per Karyawan',columns:['Kode','Nama','Divisi','Hadir','Terlambat','Izin/Sakit','Alfa'],rows:employeeAttendance},{title:'Rincian Presensi',columns:['Tanggal','Kode','Nama','Divisi','Status','Masuk','Pulang','Lokasi/Keterangan'],rows:attendanceRows},{title:'Pengajuan SDM & Karyawan',columns:['Jenis','Tanggal','Karyawan','Keterangan/Nominal','Status'],rows:requestRows}]}
  if(kind==='payroll')return{title:'Laporan Payroll',subtitle:'Rekap periode penggajian dan rincian nilai bersih karyawan',metrics:[{label:'Periode payroll',value:String(payroll.length)},{label:'Total bruto',value:money(payroll.reduce((s,x)=>s+Number(x.total_gross||0),0))},{label:'Total potongan',value:money(payroll.reduce((s,x)=>s+Number(x.total_deduction||0),0))},{label:'Total bersih',value:money(payrollNet)}],notes,sections:[{title:'Rekap Periode Payroll',columns:['Periode','Tanggal Bayar','Status','Bruto','Potongan','Bersih'],rows:payrollRows},{title:'Rincian Payroll Karyawan',columns:['Kode','Nama','Gaji Pokok','Pendapatan','Potongan','Gaji Bersih'],rows:payrollDetailRows}]}
  if(kind==='finance')return{title:'Laporan Keuangan Operasional',subtitle:'Petty cash, kasbon, reimburse, dan dampak pembayaran payroll',metrics:[{label:'Kas masuk',value:money(pettyIn)},{label:'Kas keluar',value:money(pettyOut)},{label:'Saldo periode',value:money(pettyIn-pettyOut)},{label:'Payroll bersih',value:money(payrollNet)}],notes,sections:[{title:'Mutasi Petty Cash',columns:['Tanggal','Jenis','Kategori','Keterangan','Nominal','Referensi'],rows:pettyRows},{title:'Kasbon & Reimburse',columns:['Tanggal','Jenis','Karyawan','Nominal','Sisa Kasbon','Status'],rows:financeRequestRows},{title:'Ringkasan Payroll',columns:['Periode','Tanggal Bayar','Status','Bruto','Potongan','Bersih'],rows:payrollRows}]}
  return{title:'Laporan Operasional Perusahaan',subtitle:'Ringkasan manajemen SDM, kehadiran, pengajuan, payroll, dan kas operasional',metrics:[{label:'Karyawan aktif',value:String(active.length)},{label:'Catatan hadir',value:String(present)},{label:'Pengajuan pending',value:String(pending)},{label:'Payroll bersih',value:money(payrollNet)},{label:'Kas masuk',value:money(pettyIn)},{label:'Kas keluar',value:money(pettyOut)}],notes,sections:[{title:'Komposisi SDM',columns:['Divisi','Karyawan Aktif'],rows:[...deptMap.entries()]},{title:'Rekap Kehadiran per Karyawan',columns:['Kode','Nama','Divisi','Hadir','Terlambat','Izin/Sakit','Alfa'],rows:employeeAttendance},{title:'Pengajuan & Persetujuan',columns:['Jenis','Tanggal','Karyawan','Keterangan/Nominal','Status'],rows:requestRows},{title:'Payroll',columns:['Periode','Tanggal Bayar','Status','Bruto','Potongan','Bersih'],rows:payrollRows},{title:'Petty Cash',columns:['Tanggal','Jenis','Kategori','Keterangan','Nominal','Referensi'],rows:pettyRows}]}
 },[kind,employees,attendance,leave,overtime,cash,reimburse,payroll,payrollEntries,petty])

 const companyName=company.legal_name||company.name||'Perusahaan'
 const buildHtml=()=>{
  const metricHtml=model.metrics.map(m=>`<div class="metric"><span>${escapeHtml(m.label)}</span><b>${escapeHtml(m.value)}</b>${m.note?`<small>${escapeHtml(m.note)}</small>`:''}</div>`).join('')
  const notes=model.notes.map(n=>`<li>${escapeHtml(n)}</li>`).join('')
  const sections=model.sections.map(s=>`<section><h2>${escapeHtml(s.title)}</h2>${s.description?`<p class="muted">${escapeHtml(s.description)}</p>`:''}<table><thead><tr>${s.columns.map(c=>`<th>${escapeHtml(c)}</th>`).join('')}</tr></thead><tbody>${s.rows.length?s.rows.map(r=>`<tr>${r.map(v=>`<td>${escapeHtml(v)}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${s.columns.length}">Tidak ada data pada periode ini.</td></tr>`}</tbody></table></section>`).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(model.title)} - ${escapeHtml(companyName)}</title><style>@page{size:A4;margin:16mm 14mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#1f2937;font-size:10.5px;line-height:1.45;margin:0}.head{border-bottom:3px solid #5f2aa7;padding-bottom:12px;margin-bottom:18px;display:flex;justify-content:space-between;gap:20px}.head h1{font-size:20px;margin:0 0 4px}.head h3{font-size:13px;margin:0 0 3px}.muted,.head p{color:#6b7280;margin:2px 0}.meta{text-align:right;min-width:190px}.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:0 0 18px}.metric{border:1px solid #dfe3ea;border-radius:7px;padding:9px}.metric span{display:block;color:#6b7280;font-size:9px;text-transform:uppercase}.metric b{display:block;font-size:15px;margin-top:3px;color:#111827}.note-box{background:#f7f4fb;border-left:3px solid #6b35ad;padding:10px 12px;margin:0 0 18px}.note-box h2{border:0;padding:0;margin:0 0 5px;font-size:12px}.note-box ul{margin:0;padding-left:18px}section{margin:0 0 18px;break-inside:auto}section h2{font-size:12px;margin:0 0 7px;padding-bottom:5px;border-bottom:1px solid #dfe3ea}table{width:100%;border-collapse:collapse;font-size:9px}th{background:#f4f5f7;text-align:left;font-size:8px;text-transform:uppercase;letter-spacing:.03em}th,td{padding:6px;border:1px solid #dfe3ea;vertical-align:top}tr{break-inside:avoid}.signatures{display:grid;grid-template-columns:repeat(3,1fr);gap:35px;margin-top:32px;text-align:center}.signatures div{padding-top:50px;border-bottom:1px solid #9ca3af}.footer{margin-top:22px;padding-top:8px;border-top:1px solid #e5e7eb;color:#7b8492;font-size:8px;display:flex;justify-content:space-between}@media print{.screen-only{display:none}}</style></head><body><header class="head"><div><h3>${escapeHtml(companyName)}</h3><h1>${escapeHtml(model.title)}</h1><p>${escapeHtml(model.subtitle)}</p>${company.address?`<p>${escapeHtml(company.address)}</p>`:''}</div><div class="meta"><b>Periode Laporan</b><p>${escapeHtml(dateID(start))} – ${escapeHtml(dateID(end))}</p><p>Dibuat: ${escapeHtml(new Date().toLocaleString('id-ID'))}</p><p>Penyusun: ${escapeHtml(profile.full_name)}</p></div></header><div class="metrics">${metricHtml}</div><div class="note-box"><h2>Catatan Manajemen</h2><ul>${notes}</ul></div>${sections}<div class="signatures"><div>Disusun oleh</div><div>Diperiksa oleh</div><div>Disetujui oleh</div></div><footer class="footer"><span>Bantu Beres Gajian Pro · Dokumen operasional internal</span><span>${escapeHtml(companyName)}</span></footer></body></html>`
 }
 const printPdf=()=>{const win=window.open('','_blank','width=1100,height=800');if(!win){setMessage('Popup diblokir browser. Izinkan popup untuk membuat PDF.');return}win.document.open();win.document.write(buildHtml());win.document.close();setTimeout(()=>{win.focus();win.print()},300)}
 const downloadWord=async()=>{
  try{
   const children:(Paragraph|Table)[]=[]
   children.push(
    new Paragraph({text:companyName,heading:HeadingLevel.HEADING_1}),
    new Paragraph({text:model.title,heading:HeadingLevel.TITLE}),
    new Paragraph({text:model.subtitle}),
    new Paragraph({children:[new TextRun({text:`Periode: ${dateID(start)} s.d. ${dateID(end)}`,bold:true})]}),
    new Paragraph({text:`Disusun oleh: ${profile.full_name}`}),
    new Paragraph({text:''}),
    new Paragraph({text:'Ringkasan Manajemen',heading:HeadingLevel.HEADING_2})
   )
   children.push(new Table({width:{size:100,type:WidthType.PERCENTAGE},rows:model.metrics.map(metric=>new TableRow({children:[new TableCell({width:{size:45,type:WidthType.PERCENTAGE},children:[new Paragraph({children:[new TextRun({text:metric.label,bold:true})]})]}),new TableCell({width:{size:55,type:WidthType.PERCENTAGE},children:[new Paragraph({text:metric.value}),...(metric.note?[new Paragraph({text:metric.note})]:[])]})]}))}))
   children.push(new Paragraph({text:''}),new Paragraph({text:'Catatan Manajemen',heading:HeadingLevel.HEADING_2}))
   model.notes.forEach(note=>children.push(new Paragraph({text:note,bullet:{level:0}})))
   model.sections.forEach(section=>{
    children.push(new Paragraph({text:''}),new Paragraph({text:section.title,heading:HeadingLevel.HEADING_2}))
    if(section.description)children.push(new Paragraph({text:section.description}))
    const header=new TableRow({children:section.columns.map(column=>new TableCell({children:[new Paragraph({children:[new TextRun({text:column,bold:true})]})]}))})
    const dataRows=(section.rows.length?section.rows:[['Tidak ada data pada periode ini.']]).map(row=>new TableRow({children:section.columns.map((_,index)=>new TableCell({children:[new Paragraph({text:String(row[index]??'')})]}))}))
    children.push(new Table({width:{size:100,type:WidthType.PERCENTAGE},rows:[header,...dataRows]}))
   })
   children.push(
    new Paragraph({text:''}),
    new Paragraph({text:'Pengesahan',heading:HeadingLevel.HEADING_2}),
    new Table({width:{size:100,type:WidthType.PERCENTAGE},rows:[new TableRow({children:['Disusun oleh','Diperiksa oleh','Disetujui oleh'].map(label=>new TableCell({children:[new Paragraph({text:label,alignment:AlignmentType.CENTER}),new Paragraph({text:''}),new Paragraph({text:''}),new Paragraph({text:'(____________________)',alignment:AlignmentType.CENTER})]}))})]})
   )
   const doc=new Document({sections:[{properties:{},children}]})
   const blob=await Packer.toBlob(doc),url=URL.createObjectURL(blob),a=document.createElement('a')
   a.href=url;a.download=`${kind}-${start}-${end}.docx`;a.click();URL.revokeObjectURL(url)
   setMessage('Dokumen Word .docx berhasil dibuat dan dapat diedit kembali.')
  }catch{setMessage('Dokumen Word belum dapat dibuat. Coba muat ulang lalu unduh kembali.')}
 }
 const downloadCsv=()=>{const lines:string[]=[[model.title],[`Periode ${start} s.d. ${end}`],[]].map(r=>r.map(csvCell).join(','));for(const section of model.sections){lines.push(csvCell(section.title));lines.push(section.columns.map(csvCell).join(','));section.rows.forEach(r=>lines.push(r.map(csvCell).join(',')));lines.push('')}const blob=new Blob(['\ufeff'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${kind}-${start}-${end}.csv`;a.click();URL.revokeObjectURL(url)}

 return <section className="page report-page">
  <div className="report-heading"><div><p className="eyebrow">Dokumen perusahaan</p><h1>Laporan</h1><p>Laporan dibuat dari data transaksi aplikasi dan disusun sebagai dokumen operasional, bukan hasil cetak tampilan dashboard.</p></div><div className="report-actions"><button className="button secondary" onClick={()=>void load()} disabled={loading}><RefreshCw/>{loading?'Memuat…':'Muat ulang'}</button><button className="button secondary" onClick={downloadCsv} disabled={loading}><FileSpreadsheet/>CSV</button><button className="button secondary" onClick={downloadWord} disabled={loading}><FileText/>Word Editable</button><button className="button primary" onClick={printPdf} disabled={loading}><Printer/>PDF / Cetak</button></div></div>
  {message&&<p className="note" role="status">{message}</p>}
  <div className="card report-controls"><label><span>Jenis laporan</span><select value={kind} onChange={e=>setKind(e.target.value as ReportKind)}><option value="operational">Operasional Perusahaan</option><option value="hr">SDM & Kehadiran</option><option value="payroll">Payroll</option><option value="finance">Keuangan Operasional</option></select></label><label><span>Dari tanggal</span><input type="date" value={start} onChange={e=>setStart(e.target.value)}/></label><label><span>Sampai tanggal</span><input type="date" value={end} onChange={e=>setEnd(e.target.value)}/></label></div>
  <article className="report-paper">
   <header className="report-doc-head"><div><p className="report-company">{companyName}</p><h2>{model.title}</h2><p>{model.subtitle}</p>{company.address&&<small>{company.address}{company.phone?` · ${company.phone}`:''}</small>}</div><div className="report-meta"><b>Periode</b><span>{dateID(start)}</span><span>s.d. {dateID(end)}</span><small>Disusun oleh {profile.full_name}</small></div></header>
   <div className="report-metrics">{model.metrics.map(m=><div key={m.label}><span>{m.label}</span><b>{m.value}</b>{m.note&&<small>{m.note}</small>}</div>)}</div>
   <section className="report-notes"><h3>Catatan Manajemen</h3><ul>{model.notes.map((n,i)=><li key={i}>{n}</li>)}</ul></section>
   {model.sections.map(section=><section className="report-section" key={section.title}><h3>{section.title}</h3>{section.description&&<p>{section.description}</p>}<div className="report-table-wrap"><table><thead><tr>{section.columns.map(c=><th key={c}>{c}</th>)}</tr></thead><tbody>{section.rows.length?section.rows.map((row,i)=><tr key={i}>{row.map((v,j)=><td key={j}>{v}</td>)}</tr>):<tr><td colSpan={section.columns.length}>Tidak ada data pada periode ini.</td></tr>}</tbody></table></div></section>)}
   <div className="report-signatures"><div><span>Disusun oleh</span><i/></div><div><span>Diperiksa oleh</span><i/></div><div><span>Disetujui oleh</span><i/></div></div>
   <footer className="report-doc-footer"><span>Bantu Beres Gajian Pro · Dokumen operasional internal</span><span>{companyName}</span></footer>
  </article>
  <p className="report-disclaimer"><Download/> PDF/Cetak membuka dokumen A4 tersendiri. Word Editable mengunduh file .docx yang bisa dibenahi kembali di Microsoft Word/WPS/Google Docs. Sidebar, tombol, filter, dan tampilan aplikasi tidak ikut tercetak.</p>
 </section>
}
