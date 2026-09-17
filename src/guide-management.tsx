import { useMemo, useState } from 'react'
import { AlertTriangle, BookOpen, CalendarCheck, CheckCircle2, ChevronDown, CircleHelp, ClipboardCheck, FileSpreadsheet, FileText, Lightbulb, Search, Settings, ShieldCheck, Target, UserCheck, Users, WalletCards } from 'lucide-react'
import './guide.css'

type Profile={role:string}
const roleName:Record<string,string>={owner:'Owner',hr_admin:'HR / Admin',finance:'Keuangan',supervisor:'Atasan',employee:'Karyawan'}

type Step={title:string;detail:string;result?:string}
type Problem={problem:string;fix:string}
type Guide={
 id:string;category:string;title:string;audience:string;summary:string;goal:string;before:string[];steps:Step[];
 example?:string;success:string[];tips?:string[];problems?:Problem[]
}

const guides:Guide[]=[
 {
  id:'mulai',category:'Dasar',title:'Mulai menggunakan Gajian Pro dari nol',audience:'Owner · HR/Admin',
  summary:'Urutan awal yang paling aman agar data karyawan, akun, presensi, dan payroll tidak saling terputus.',
  goal:'Menyiapkan workspace perusahaan sampai siap dipakai karyawan tanpa membuat data ganda.',
  before:['Pastikan Owner sudah berhasil masuk ke workspace perusahaan.','Siapkan data dasar perusahaan: nama perusahaan, lokasi kantor, pola jam kerja, dan daftar karyawan.','Tentukan siapa yang akan menjadi HR/Admin, Keuangan, Atasan, dan Karyawan.'],
  steps:[
   {title:'1. Lengkapi Pengaturan perusahaan',detail:'Buka menu Pengaturan. Isi identitas perusahaan dan data operasional yang tersedia. Data ini menjadi identitas utama workspace.',result:'Nama dan informasi perusahaan sudah tampil benar.'},
   {title:'2. Buat Jadwal & Lokasi',detail:'Buka Jadwal & Lokasi. Tambahkan jam kerja yang benar, misalnya Senin–Jumat 08.00–16.00, lalu tambahkan lokasi kantor bila presensi memakai lokasi.',result:'Jadwal dan lokasi sudah bisa dipilih saat mengisi karyawan.'},
   {title:'3. Masukkan data Karyawan',detail:'Buka Karyawan. Gunakan Tambah Karyawan untuk sedikit data atau Import Excel untuk banyak data. Simpan sebagai Draft bila datanya belum lengkap.',result:'Nama karyawan muncul di daftar Karyawan.'},
   {title:'4. Hubungkan akun Tim/ESS',detail:'Buka Tim. Untuk karyawan yang perlu login sendiri, buat akun dan pilih data karyawan yang sudah ada. Jangan membuat data karyawan baru jika orangnya sudah tercatat.',result:'Status karyawan berubah menjadi Terhubung ke akun.'},
   {title:'5. Uji satu akun karyawan',detail:'Login menggunakan satu akun karyawan. Cek apakah menu Kehadiran, Pengajuan, dan Payroll pribadi muncul sesuai role.',result:'Akun karyawan dapat melihat data dirinya sendiri.'},
   {title:'6. Mulai operasional',detail:'Setelah alur uji berhasil, perusahaan dapat memakai presensi, pengajuan, approval, payroll, dan laporan secara rutin.',result:'Semua modul memakai identitas karyawan yang sama.'},
  ],
  example:'Contoh: perusahaan memiliki 25 orang. HR membuat 2 jadwal kerja, import 25 data karyawan, lalu membuat akun ESS hanya untuk karyawan yang perlu login. Data presensi dan payroll tetap mengikuti 25 data karyawan tersebut.',
  success:['Tidak ada nama orang yang tercatat dua kali karena salah membuat akun.','Karyawan yang login terhubung ke data Karyawan yang benar.','Jadwal kerja tersedia sebelum presensi dimulai.'],
  tips:['Kerjakan setup dalam urutan di atas sebelum mengundang semua pengguna.','Uji dulu dengan satu akun Karyawan dan satu akun Atasan.'],
  problems:[{problem:'Akun sudah dibuat tetapi data karyawan belum terhubung.',fix:'Buka Tim, cari akun yang belum terhubung, lalu hubungkan ke data karyawan yang benar.'},{problem:'Karyawan tidak bisa presensi.',fix:'Periksa apakah karyawan aktif, sudah memiliki jadwal kerja, dan akun login terhubung ke data karyawan.'}]
 },
 {
  id:'karyawan-import',category:'Karyawan',title:'Memasukkan data Karyawan & Import Excel',audience:'Owner · HR/Admin',
  summary:'Cara memasukkan banyak karyawan sekaligus dengan template resmi agar seluruh kolom dapat dibaca sistem.',
  goal:'Memasukkan data karyawan dalam jumlah banyak dengan format yang seragam dan mudah divalidasi.',
  before:['Buka Jadwal & Lokasi dan buat jadwal kerja terlebih dahulu.','Jika ingin menautkan akun ESS saat import, buat akun Tim lebih dulu dan pastikan akun belum dipakai karyawan lain.','Gunakan template yang diunduh dari menu Karyawan, bukan file buatan sendiri.'],
  steps:[
   {title:'1. Unduh template',detail:'Buka Karyawan → Import Massal → Unduh Template Excel. Jangan mengganti nama sheet DATA_KARYAWAN dan jangan mengubah judul kolom.',result:'File template tersimpan di perangkat.'},
   {title:'2. Isi satu karyawan per baris',detail:'Kolom bertanda * wajib diisi. ID Karyawan harus unik. Gaji Pokok ditulis angka saja. Tanggal gunakan format YYYY-MM-DD.',result:'Setiap baris berisi satu orang tanpa baris ganda.'},
   {title:'3. Tentukan Aktif atau Draft',detail:'Pilih Status Import = Aktif jika data inti sudah lengkap. Pilih Draft jika organisasi, jabatan, atau jadwal masih akan dilengkapi kemudian.',result:'Status import sesuai kesiapan data.'},
   {title:'4. Cocokkan nama referensi',detail:'Nama Jadwal Kerja dan Nama Lokasi Kantor harus sama dengan yang ada di web. Username Atasan dan Username Akun ESS juga harus sama persis bila diisi.',result:'Sistem dapat menemukan referensi tanpa menebak.'},
   {title:'5. Upload file',detail:'Kembali ke Karyawan → Import Excel dan pilih file. Sistem belum langsung menyimpan; semua baris diperiksa terlebih dahulu.',result:'Muncul ringkasan jumlah baris valid dan daftar kesalahan bila ada.'},
   {title:'6. Perbaiki semua kesalahan',detail:'Jika tertulis Baris 7: jadwal tidak ditemukan, buka Excel baris 7 dan samakan nama jadwal. Upload ulang sampai tidak ada masalah.',result:'Status validasi bersih dan tombol Import aktif.'},
   {title:'7. Jalankan Import',detail:'Tekan Import dan tunggu progress selesai. Jangan menekan tombol berulang atau menutup halaman ketika proses masih berjalan.',result:'Jumlah karyawan bertambah dan data muncul di tabel Karyawan.'},
  ],
  example:'Contoh: jadwal di web bernama “Kantor Reguler”. Di Excel tulis tepat “Kantor Reguler”, bukan “Reguler”, “jadwal kantor”, atau singkatan lain.',
  success:['Jumlah data hasil import sama dengan jumlah baris valid di file.','ID Karyawan tidak ada yang ganda.','Karyawan Aktif memiliki jadwal, organisasi, jabatan, dan tanggal bergabung.','Karyawan Draft masuk ke tab Belum lengkap dan dapat dilanjutkan nanti.'],
  tips:['Jangan menghapus kolom template walaupun tidak dipakai; cukup biarkan kosong untuk kolom opsional.','Import 5–10 baris pertama sebagai uji sebelum memasukkan ratusan data sekaligus.','Simpan salinan file Excel yang sudah berhasil diimport sebagai arsip HR.'],
  problems:[{problem:'File ditolak karena header tidak sesuai.',fix:'Unduh template terbaru dari web dan pindahkan isi data ke template tersebut tanpa mengganti nama kolom.'},{problem:'Jadwal/lokasi/atasan tidak ditemukan.',fix:'Periksa penulisan dan samakan persis dengan data pada web.'},{problem:'ID Karyawan sudah digunakan.',fix:'Gunakan ID lain untuk orang baru. Jangan import orang yang sama untuk kedua kalinya.'}]
 },
 {
  id:'tim',category:'Akun',title:'Tim, akun login, dan hubungan dengan Karyawan',audience:'Owner · HR/Admin',
  summary:'Memahami perbedaan data Karyawan dan akun Tim supaya tidak membuat orang yang sama dua kali.',
  goal:'Membuat akun login yang menunjuk ke data karyawan yang benar.',
  before:['Data Karyawan adalah data utama orangnya.','Akun Tim/ESS adalah username dan password untuk masuk ke aplikasi.','Satu karyawan hanya boleh terhubung ke satu akun login.'],
  steps:[
   {title:'1. Cek dulu menu Karyawan',detail:'Pastikan orang yang akan dibuatkan akun sudah ada di daftar Karyawan.',result:'Anda menemukan nama dan ID Karyawan yang benar.'},
   {title:'2. Buka menu Tim',detail:'Lihat bagian Status Karyawan ↔ Akun Tim. Di sini terlihat siapa yang sudah terhubung dan siapa yang belum.',result:'Status hubungan akun dapat diketahui sebelum membuat akun.'},
   {title:'3. Tambah akun Tim',detail:'Tekan Tambah Tim. Pilih data karyawan yang sudah ada, isi username, password awal, dan role yang sesuai.',result:'Akun dibuat tanpa membuat data karyawan kedua.'},
   {title:'4. Berikan login kepada pengguna',detail:'Berikan username dan password awal hanya kepada pemilik akun. Minta pengguna segera menyimpan aksesnya dengan aman.',result:'Pengguna dapat masuk menggunakan akunnya sendiri.'},
   {title:'5. Jika akun lama belum terhubung',detail:'Gunakan bagian Akun belum terhubung. Pilih data karyawan yang benar lalu tekan Hubungkan.',result:'Akun lama dan data karyawan menjadi satu identitas.'},
  ],
  example:'VIKTOR sudah ada di menu Karyawan. Saat membuat akun, pilih VIKTOR dari daftar. Jangan mengetik VIKTOR sebagai karyawan baru lagi.',
  success:['Pada menu Tim statusnya Terhubung.','Pada Karyawan → Login ESS muncul username akun.','Saat akun login, data pribadi/presensi mengarah ke orang yang sama.'],
  tips:['Gunakan Nonaktifkan jika pegawai keluar tetapi histori perlu dipertahankan.','Hapus hanya akun/data yang memang salah dan belum memiliki histori penting.'],
  problems:[{problem:'Nama ada di Karyawan tetapi tidak muncul saat membuat akun.',fix:'Periksa apakah karyawan sudah terhubung ke akun lain atau masih nonaktif/draft.'},{problem:'Akun login masuk tetapi menu pribadi kosong.',fix:'Periksa hubungan akun dengan data Karyawan pada menu Tim.'}]
 },
 {
  id:'kehadiran',category:'Operasional',title:'Kehadiran / Presensi harian',audience:'Owner · HR/Admin · Atasan · Karyawan',
  summary:'Cara karyawan melakukan presensi dan cara manajemen memeriksa hasilnya.',
  goal:'Mencatat jam masuk/pulang dan menghasilkan rekap kehadiran yang bisa dipakai saat payroll dan laporan.',
  before:['Karyawan harus aktif dan memiliki jadwal kerja.','Jika lokasi wajib, izin lokasi/GPS pada HP harus aktif.','Akun Karyawan harus sudah terhubung ke data Karyawan.'],
  steps:[
   {title:'Untuk Karyawan: buka Kehadiran',detail:'Pastikan nama dan jadwal yang tampil memang milik Anda.',result:'Halaman presensi pribadi tampil.'},
   {title:'Check-in saat mulai bekerja',detail:'Aktifkan lokasi jika diminta, lalu tekan Check-in satu kali dan tunggu status proses selesai.',result:'Jam masuk tercatat.'},
   {title:'Check-out saat selesai bekerja',detail:'Tekan Check-out setelah jam kerja selesai. Jangan menutup halaman sebelum konfirmasi berhasil muncul.',result:'Jam pulang tercatat.'},
   {title:'Untuk Owner/HR: buka rekap',detail:'Gunakan filter tanggal/bulan, karyawan, divisi, dan status untuk memeriksa Hadir, Terlambat, Izin/Sakit, Alfa, atau Belum Presensi.',result:'Rekap periode dapat diperiksa sebelum payroll.'},
  ],
  example:'Jika jadwal mulai 08.00 dan karyawan check-in 08.12, sistem dapat menampilkan status terlambat sesuai aturan jadwal.',
  success:['Tanggal dan jam masuk/pulang tampil pada histori.','Owner/HR melihat karyawan yang sama di rekap.','Status kehadiran sesuai kondisi hari tersebut.'],
  tips:['Jangan meminjam akun orang lain untuk presensi.','Periksa rekap sebelum generate payroll agar koreksi dilakukan di sumber datanya.'],
  problems:[{problem:'Tombol presensi tidak dapat dipakai.',fix:'Periksa koneksi, izin lokasi, status karyawan, jadwal kerja, dan hubungan akun ESS.'},{problem:'Nama tidak muncul di rekap.',fix:'Pastikan data Karyawan aktif dan presensi tersimpan pada periode/filter yang sedang dilihat.'}]
 },
 {
  id:'pengajuan',category:'Operasional',title:'Pengajuan & Approval',audience:'Karyawan · Atasan · HR/Admin · Keuangan · Owner',
  summary:'Alur mengirim cuti/izin, lembur, kasbon, dan reimburse sampai disetujui atau ditolak.',
  goal:'Membuat proses persetujuan terdokumentasi dan tidak bergantung pada chat pribadi.',
  before:['Karyawan harus login dengan akun sendiri.','Isi tanggal, alasan, dan nominal dengan benar sebelum mengirim.','Pihak yang menyetujui harus menggunakan role yang memiliki akses approval.'],
  steps:[
   {title:'1. Karyawan membuat pengajuan',detail:'Buka Pengajuan, pilih jenis pengajuan, isi seluruh data yang diminta, lalu kirim.',result:'Status awal pengajuan muncul sebagai pending/menunggu.'},
   {title:'2. Pihak berwenang membuka Approval',detail:'Periksa nama pemohon, tanggal, alasan, durasi, dan nominal jika ada.',result:'Reviewer memahami apa yang akan disetujui.'},
   {title:'3. Setujui atau Tolak',detail:'Tekan tombol keputusan. Sistem meminta konfirmasi agar keputusan tidak terjadi karena salah tekan.',result:'Status berubah menjadi disetujui atau ditolak.'},
   {title:'4. Karyawan melihat hasil',detail:'Karyawan membuka kembali Pengajuan untuk melihat status terbaru.',result:'Tidak perlu menanyakan status secara manual kepada HR.'},
  ],
  example:'Kasbon Rp500.000 diajukan karyawan. Keuangan memeriksa nominal dan alasan, lalu memilih Setujui. Status tersebut ikut muncul dalam data keuangan/laporan.',
  success:['Tidak ada pengajuan yang berubah status tanpa tindakan reviewer.','Status yang dilihat karyawan sama dengan status di Approval.'],
  tips:['Jangan menyetujui hanya dari notifikasi; buka rincian lebih dulu.','Gunakan catatan/alasan yang jelas agar histori mudah diaudit.'],
  problems:[{problem:'Pengajuan tidak muncul di Approval.',fix:'Periksa role reviewer, jenis pengajuan, status, dan apakah pengajuan benar-benar berhasil dikirim.'},{problem:'Karyawan tidak bisa membuat pengajuan.',fix:'Periksa hubungan akun dengan Karyawan dan status aktif karyawan.'}]
 },
 {
  id:'payroll',category:'Payroll',title:'Memproses Payroll sampai slip gaji',audience:'Owner · HR/Admin · Keuangan',
  summary:'Urutan payroll yang aman: persiapan → generate → review → approve → lock → paid.',
  goal:'Menghasilkan gaji periode yang sudah diperiksa dan tidak berubah setelah dinyatakan final.',
  before:['Data gaji pokok karyawan sudah benar.','Presensi periode sudah ditutup/diperiksa.','Cuti, lembur, kasbon, reimburse, dan komponen gaji sudah direview.'],
  steps:[
   {title:'1. Pilih periode payroll',detail:'Buka Payroll dan buat/pilih periode yang akan dihitung. Periksa tanggal mulai, akhir, dan tanggal bayar.',result:'Periode yang benar siap diproses.'},
   {title:'2. Generate payroll',detail:'Jalankan Generate untuk mengambil data karyawan dan komponen periode. Tunggu sampai proses selesai.',result:'Muncul rincian gaji tiap karyawan.'},
   {title:'3. Review angka',detail:'Periksa bruto, tambahan, potongan, kasbon, dan net pay. Bandingkan beberapa karyawan sebagai sampling.',result:'Angka yang salah dapat dikoreksi sebelum final.'},
   {title:'4. Ajukan/Setujui sesuai alur',detail:'Ubah status ke tahap review/approved sesuai kewenangan perusahaan.',result:'Payroll memiliki jejak status yang jelas.'},
   {title:'5. Kunci payroll',detail:'Lock hanya setelah semua koreksi selesai. Setelah dikunci, anggap angka sebagai dokumen final periode.',result:'Payroll final tidak berubah sembarangan.'},
   {title:'6. Tandai Dibayar',detail:'Lakukan hanya setelah pembayaran kepada karyawan benar-benar dilakukan.',result:'Status periode menunjukkan pembayaran selesai dan slip dapat digunakan.'},
  ],
  example:'Sebelum lock, HR melihat ada lembur yang belum disetujui. HR kembali ke Approval, selesaikan lembur, lalu generate/review ulang sebelum mengunci payroll.',
  success:['Jumlah karyawan payroll sesuai karyawan aktif yang seharusnya digaji.','Net pay sudah direview.','Status final hanya diberikan setelah pembayaran benar-benar siap/dilakukan.'],
  tips:['Jangan menggunakan Lock sebagai tombol simpan biasa. Lock berarti data sudah final.','Jika ada perubahan sebelum lock, koreksi sumber datanya lalu review ulang.'],
  problems:[{problem:'Ada karyawan tidak masuk payroll.',fix:'Periksa status aktif, data kompensasi/gaji, dan periode kerjanya.'},{problem:'Nilai payroll terlihat salah.',fix:'Periksa presensi, komponen gaji, pengajuan yang disetujui, dan data gaji pokok sebelum mengubah angka final.'}]
 },
 {
  id:'laporan',category:'Laporan',title:'Membuat laporan perusahaan',audience:'Owner · HR/Admin · Keuangan',
  summary:'Cara membuat dokumen operasional yang siap dibaca manajemen, bukan hasil screenshot halaman web.',
  goal:'Menghasilkan laporan periode yang dapat dicetak, diedit, atau dianalisis kembali.',
  before:['Pastikan periode yang akan dilaporkan sudah benar.','Periksa presensi, pengajuan, payroll, dan keuangan sebelum membuat laporan final.'],
  steps:[
   {title:'1. Buka Laporan',detail:'Pilih jenis laporan: Operasional Perusahaan, SDM & Kehadiran, Payroll, atau Keuangan Operasional.',result:'Isi preview berubah sesuai jenis laporan.'},
   {title:'2. Tentukan periode',detail:'Isi Dari Tanggal dan Sampai Tanggal. Gunakan Muat Ulang jika data sumber baru saja berubah.',result:'Ringkasan dan tabel hanya memakai periode terpilih.'},
   {title:'3. Baca Catatan Manajemen',detail:'Periksa peringatan otomatis seperti alfa, keterlambatan, pengajuan pending, atau payroll yang belum final.',result:'Masalah penting diketahui sebelum dokumen dibagikan.'},
   {title:'4. Pilih format output',detail:'PDF/Cetak untuk dokumen final, Word Editable untuk dokumen yang masih akan diedit, CSV untuk olah data spreadsheet.',result:'Format sesuai kebutuhan penerima laporan.'},
   {title:'5. Verifikasi sebelum tanda tangan',detail:'Cocokkan angka utama dengan data sumber dan lengkapi bagian pengesahan bila dipakai sebagai dokumen perusahaan.',result:'Laporan siap disimpan atau disampaikan.'},
  ],
  example:'HR memilih Laporan SDM & Kehadiran periode September. Setelah memastikan alfa dan izin benar, HR unduh Word untuk menambahkan narasi, lalu cetak PDF final.',
  success:['Sidebar dan tombol aplikasi tidak ikut tercetak.','Periode pada header sesuai pilihan.','Angka ringkasan konsisten dengan tabel detail.'],
  tips:['Word digunakan jika masih perlu revisi teks. PDF digunakan untuk versi final.','Jika angka berubah, perbaiki data sumber lalu Muat Ulang laporan; jangan mengedit angka final hanya di Word.'],
  problems:[{problem:'Laporan kosong.',fix:'Periksa periode tanggal dan pastikan memang ada data pada rentang tersebut.'},{problem:'Angka laporan belum terbaru.',fix:'Perbaiki data sumber lalu tekan Muat Ulang sebelum mengunduh dokumen.'}]
 },
 {
  id:'keamanan',category:'Aturan',title:'Aturan data, keamanan, dan kebiasaan kerja',audience:'Semua role',
  summary:'Aturan sederhana yang mencegah data ganda, histori hilang, dan salah akses.',
  goal:'Menjaga data perusahaan tetap rapi walaupun dipakai banyak orang.',
  before:['Setiap orang menggunakan akun sendiri.','Role diberikan sesuai kebutuhan kerja, bukan berdasarkan kemudahan.'],
  steps:[
   {title:'Gunakan satu identitas per orang',detail:'Jangan membuat data Karyawan kedua hanya karena lupa akun lama. Cari data terlebih dahulu.',result:'Riwayat tidak terpecah.'},
   {title:'Nonaktifkan sebelum menghapus',detail:'Untuk pegawai yang keluar, utamakan Nonaktifkan supaya histori presensi, pengajuan, dan payroll tetap ada.',result:'Akses berhenti tetapi histori aman.'},
   {title:'Periksa konfirmasi tindakan',detail:'Baca dialog konfirmasi sebelum Hapus, Tolak, Setujui, Lock, Bayar, atau Logout.',result:'Aksi sensitif tidak terjadi karena salah tekan.'},
   {title:'Tunggu indikator proses',detail:'Jika tombol sedang Memproses, jangan tekan berulang. Sistem mengunci sementara untuk mencegah permintaan ganda.',result:'Tidak ada transaksi dobel akibat klik berulang.'},
   {title:'Logout di perangkat bersama',detail:'Keluar dari akun setelah selesai bekerja pada HP/laptop yang digunakan bersama.',result:'Orang lain tidak dapat memakai akses Anda.'},
  ],
  example:'Karyawan resign tidak perlu dihapus. HR menonaktifkan akun dan data karyawan, sehingga histori payroll tahun lalu tetap tersedia untuk laporan.',
  success:['Tidak ada akun bersama yang dipakai beberapa orang.','Histori lama tetap dapat dilacak.','Aksi sensitif dilakukan setelah konfirmasi.'],
  tips:['Owner sebaiknya meninjau akun Tim secara berkala.','Jika ragu menghapus, nonaktifkan dulu.'],
  problems:[{problem:'Tidak yakin apakah data boleh dihapus.',fix:'Jangan hapus. Nonaktifkan dan periksa histori terlebih dahulu.'},{problem:'Pengguna melihat menu yang tidak seharusnya.',fix:'Periksa role akun pada menu Tim dan ubah sesuai kewenangan.'}]
 },
]

const roleFlow:Record<string,{title:string;items:string[]}>= {
 owner:{title:'Urutan cepat untuk Owner',items:['Lengkapi Pengaturan','Pastikan HR/Admin dan role tim benar','Pantau Karyawan & Kehadiran','Review Approval dan Payroll','Periksa Laporan perusahaan']},
 hr_admin:{title:'Urutan cepat untuk HR/Admin',items:['Siapkan Jadwal & Lokasi','Input/Import Karyawan','Hubungkan akun Tim/ESS','Pantau Kehadiran & Pengajuan','Siapkan Payroll dan Laporan SDM']},
 finance:{title:'Urutan cepat untuk Keuangan',items:['Periksa pengajuan keuangan','Periksa komponen payroll','Review nominal payroll','Tandai pembayaran setelah benar-benar dibayar','Gunakan Laporan Keuangan untuk rekap']},
 supervisor:{title:'Urutan cepat untuk Atasan',items:['Cek Tim Saya','Pantau Kehadiran Tim','Periksa Approval Tim','Gunakan Rekap Tim','Laporkan masalah data ke HR/Admin']},
 employee:{title:'Urutan cepat untuk Karyawan',items:['Pastikan akun dan data diri benar','Lakukan Kehadiran dengan akun sendiri','Buat Pengajuan bila diperlukan','Pantau status pengajuan','Cek slip/payroll pribadi saat tersedia']},
}

const categoryOrder=['Semua','Dasar','Karyawan','Akun','Operasional','Payroll','Laporan','Aturan']

export function GuideManagement({profile}:{profile:Profile}){
 const [query,setQuery]=useState(''),[category,setCategory]=useState('Semua'),[open,setOpen]=useState<string>('mulai')
 const flow=roleFlow[profile.role]||roleFlow.employee
 const visible=useMemo(()=>guides.filter(g=>{
  const matchCategory=category==='Semua'||g.category===category
  const text=`${g.title} ${g.category} ${g.audience} ${g.summary} ${g.goal} ${g.before.join(' ')} ${g.steps.map(s=>`${s.title} ${s.detail} ${s.result||''}`).join(' ')} ${g.example||''} ${g.success.join(' ')} ${g.tips?.join(' ')||''} ${g.problems?.map(p=>`${p.problem} ${p.fix}`).join(' ')||''}`.toLowerCase()
  return matchCategory&&text.includes(query.toLowerCase())
 }),[query,category])
 return <section className="page guide-page">
  <div className="guide-hero"><div><p className="eyebrow">Buku panduan langkah demi langkah</p><h1>Panduan Gajian Pro</h1><p>Pilih topik, ikuti urutannya, lalu cocokkan bagian “Tanda berhasil”. Tidak perlu memahami semua fitur sekaligus.</p></div><div className="guide-role"><ShieldCheck/><span>Akses Anda</span><b>{roleName[profile.role]||profile.role}</b></div></div>

  <article className="guide-quick card"><div className="guide-quick-head"><div className="guide-icon"><Target/></div><div><span>Mulai dari sini</span><h2>{flow.title}</h2></div></div><div className="guide-flow">{flow.items.map((item,i)=><div key={item}><b>{i+1}</b><span>{item}</span></div>)}</div><p>Gunakan urutan ini sebagai peta singkat. Penjelasan lengkap setiap proses ada di bawah.</p></article>

  <label className="guide-search"><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Cari: import karyawan, presensi, payroll, laporan…"/></label>
  <div className="guide-categories" aria-label="Kategori panduan">{categoryOrder.map(item=><button type="button" key={item} className={category===item?'active':''} onClick={()=>setCategory(item)}>{item}</button>)}</div>

  <article className="guide-start card"><div className="guide-icon"><BookOpen/></div><div><h2>Cara membaca panduan ini</h2><p><b>Tujuan</b> menjelaskan hasil yang ingin dicapai. <b>Sebelum mulai</b> berisi syaratnya. Ikuti <b>Langkah</b> berurutan. Setelah selesai, cocokkan dengan <b>Tanda berhasil</b>. Jika ada masalah, buka <b>Kalau gagal, cek ini</b>.</p></div></article>

  <div className="guide-list">{visible.map((guide,index)=>{
   const expanded=open===guide.id
   return <article className={`card guide-detail ${expanded?'expanded':''}`} key={guide.id}>
    <button type="button" className="guide-detail-toggle" onClick={()=>setOpen(expanded?'':guide.id)} aria-expanded={expanded}>
     <span className="guide-number">{String(index+1).padStart(2,'0')}</span><span className="guide-title"><small>{guide.category} · {guide.audience}</small><strong>{guide.title}</strong><em>{guide.summary}</em></span><ChevronDown className="guide-chevron"/>
    </button>
    {expanded&&<div className="guide-detail-body">
     <section className="guide-goal"><Target/><div><span>Tujuan</span><p>{guide.goal}</p></div></section>

     <section className="guide-section"><h3><CircleHelp/>Sebelum mulai</h3><ul className="guide-checklist">{guide.before.map(item=><li key={item}><CheckCircle2/>{item}</li>)}</ul></section>

     <section className="guide-section"><h3><ClipboardCheck/>Langkah satu per satu</h3><div className="guide-steps">{guide.steps.map((step,i)=><div className="guide-step" key={step.title}><span className="guide-step-no">{i+1}</span><div><h4>{step.title.replace(/^\d+\.\s*/,'')}</h4><p>{step.detail}</p>{step.result&&<small><CheckCircle2/>Hasil: {step.result}</small>}</div></div>)}</div></section>

     {guide.example&&<section className="guide-example"><UserCheck/><div><span>Contoh supaya lebih mudah dibayangkan</span><p>{guide.example}</p></div></section>}

     <section className="guide-section"><h3><CheckCircle2/>Tanda berhasil</h3><ul className="guide-success">{guide.success.map(item=><li key={item}>{item}</li>)}</ul></section>

     {guide.tips&&<section className="guide-tips"><div><Lightbulb/>Tips penggunaan</div>{guide.tips.map(tip=><p key={tip}>{tip}</p>)}</section>}

     {guide.problems&&<section className="guide-section"><h3><AlertTriangle/>Kalau gagal, cek ini</h3><div className="guide-problems">{guide.problems.map(item=><div key={item.problem}><b>{item.problem}</b><p>{item.fix}</p></div>)}</div></section>}
    </div>}
   </article>
  })}</div>

  {!visible.length&&<div className="card guide-empty"><FileSpreadsheet/><p>Panduan tidak ditemukan. Hapus filter atau gunakan kata kunci yang lebih sederhana.</p></div>}

  <section className="guide-legend card"><h2>Istilah yang sering muncul</h2><div><p><Users/><b>Karyawan</b><span>Data utama orangnya: identitas, jabatan, jadwal, gaji, dan histori.</span></p><p><ShieldCheck/><b>Tim / ESS</b><span>Akun username dan password untuk masuk ke aplikasi.</span></p><p><CalendarCheck/><b>Kehadiran</b><span>Data check-in/check-out dan status presensi.</span></p><p><WalletCards/><b>Payroll</b><span>Perhitungan gaji dalam satu periode.</span></p><p><FileText/><b>Laporan</b><span>Dokumen ringkasan dan rincian data perusahaan.</span></p><p><Settings/><b>Draft</b><span>Data belum lengkap; disimpan dulu agar bisa dilanjutkan kemudian.</span></p></div></section>
 </section>
}
