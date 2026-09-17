from pathlib import Path

p = Path('src/reports-management.tsx')
s = p.read_text()

old_import = "import { Download, FileSpreadsheet, FileText, Printer, RefreshCw } from 'lucide-react'\nimport { supabase } from './lib/supabase'"
new_import = "import { Download, FileSpreadsheet, FileText, Printer, RefreshCw } from 'lucide-react'\nimport { AlignmentType, Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from 'docx'\nimport { supabase } from './lib/supabase'"
if old_import not in s:
    raise SystemExit('import anchor not found')
s = s.replace(old_import, new_import, 1)

old_word = " const downloadWord=()=>{const blob=new Blob(['\\ufeff',buildHtml()],{type:'application/msword'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${kind}-${start}-${end}.doc`;a.click();URL.revokeObjectURL(url)}"
new_word = """ const downloadWord=async()=>{
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
 }"""
if old_word not in s:
    raise SystemExit('word export anchor not found')
s = s.replace(old_word, new_word, 1)
s = s.replace('<FileText/>Word</button>', '<FileText/>Word Editable</button>', 1)
s = s.replace(
    'PDF/Cetak membuka dokumen A4 tersendiri. Sidebar, tombol, filter, dan tampilan aplikasi tidak ikut tercetak.',
    'PDF/Cetak membuka dokumen A4 tersendiri. Word Editable mengunduh file .docx yang bisa dibenahi kembali di Microsoft Word/WPS/Google Docs. Sidebar, tombol, filter, dan tampilan aplikasi tidak ikut tercetak.',
    1,
)
p.write_text(s)
