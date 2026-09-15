# Bantu Beres Gajian Pro

Web app payroll dan administrasi SDM untuk usaha kecil dan menengah di Indonesia. Produk ini berfokus pada alur yang benar-benar dipakai kantor: data karyawan, presensi, pengajuan, kasbon/reimburse, payroll, approval, dan laporan.

## Fitur tahap pertama

- Owner membuat workspace perusahaan dan akun tim.
- Role dasar: Owner, HR/Admin, Finance, Supervisor, dan Karyawan.
- Data karyawan, presensi, jadwal kerja, pengajuan cuti/lembur, kasbon, dan reimburse.
- Payroll bulanan: draf, komponen kompensasi, entri penggajian, dan penguncian periode.
- Dashboard, approval, ekspor CSV karyawan, serta audit-log-ready data model.
- Check-in dan check-out berbasis lokasi dirancang sebagai presensi lapangan, bukan pelacakan lokasi terus-menerus.

KPI, rekrutmen, CRM klien, dan akuntansi penuh sengaja tidak dimasukkan ke tahap pertama supaya aplikasi tetap fokus dan ringan dipakai.

## Stack

- React + TypeScript + Vite
- Supabase Auth, Postgres, Row Level Security, dan Edge Functions
- Lucide icons

## Menjalankan lokal

1. Salin `.env.example` menjadi `.env.local`.
2. Isi variabel Supabase yang sesuai.
3. Jalankan `npm install` lalu `npm run dev`.

Untuk pengecekan rilis, jalankan:

```bash
npm run lint
npm run build
```

## Konfigurasi lingkungan

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<supabase-publishable-key>
```

Jangan pernah memasukkan `service_role` key ke browser ataupun repository.

## Supabase

Folder `supabase/migrations` berisi skema awal dan aturan RLS. Edge Functions yang dibutuhkan:

- `register-owner`: registrasi perusahaan dan owner.
- `create-team-member`: hanya Owner dapat membuat akun tim dalam workspace-nya.

## Status kualitas

Build TypeScript/Vite dan lint telah dijalankan sebelum source dipublikasikan. Hak akses inti diterapkan dengan RLS, sementara publishable key hanya dipakai di frontend.
