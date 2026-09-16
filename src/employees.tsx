import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from './lib/supabase'
import './workflows.css'

type Profile = { id: string; company_id: string; role: string }
type Row = Record<string, any>
const steps = ['Personal', 'Kepegawaian', 'Payroll']
const money = (value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value || 0)
const dateNow = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const blank = (): Row => ({ employee_code: '', full_name: '', email: '', phone: '', department: '', position: '', rank_name: '', employment_type: 'Tetap Permanen', placement: 'Baru Direkrut', hire_date: dateNow(), contract_end: '', base_salary: 0, bank_name: '', bank_account_name: '', bank_account_number: '', profile_id: '', supervisor_profile_id: '', location_id: '', schedule_id: '', personal_data: {}, payroll_data: {}, is_active: false, onboarding_status: 'draft' })
const personalFields = [
  ['birth_place', 'Tempat lahir'], ['birth_date', 'Tanggal lahir', 'date'],
  ['gender', 'Jenis kelamin', 'Laki-laki|Perempuan'], ['marital_status', 'Status perkawinan', 'Belum menikah|Menikah|Cerai hidup|Cerai mati'],
  ['blood_type', 'Golongan darah', 'A|B|AB|O'], ['religion', 'Agama', 'Islam|Kristen|Katolik|Hindu|Buddha|Konghucu|Kepercayaan'],
  ['citizenship', 'Kewarganegaraan', 'WNI|WNA'], ['nationality', 'Negara kewarganegaraan'],
  ['identity_type', 'Jenis identitas', 'KTP|Paspor|KITAS'], ['identity_number', 'Nomor identitas'], ['family_card_number', 'Nomor kartu keluarga'],
  ['telephone', 'Telepon rumah'], ['identity_address', 'Alamat identitas'], ['country', 'Negara'], ['province', 'Provinsi'], ['city', 'Kota / kabupaten'],
  ['domicile_address', 'Alamat domisili'], ['domicile_country', 'Negara domisili'], ['domicile_province', 'Provinsi domisili'], ['domicile_city', 'Kota domisili'],
  ['emergency_name', 'Nama kontak darurat'], ['emergency_phone', 'Telepon kontak darurat'],
  ['education_level', 'Pendidikan terakhir', 'SD|SMP|SMA/SMK|D1|D2|D3|D4|S1|S2|S3'], ['institution', 'Lembaga pendidikan'], ['study_program', 'Program studi'],
]
export function EmployeeWorkflow({ profile }: { profile: Profile }) {
  const canEdit = ['owner', 'hr_admin'].includes(profile.role)
  const [rows, setRows] = useState<Row[]>([]), [members, setMembers] = useState<Row[]>([])
  const [schedules, setSchedules] = useState<Row[]>([]), [locations, setLocations] = useState<Row[]>([]), [masters, setMasters] = useState<Row[]>([])
  const [loading, setLoading] = useState(true), [message, setMessage] = useState(''), [query, setQuery] = useState(''), [filter, setFilter] = useState('active'), [tab, setTab] = useState('Informasi Pribadi')
  const [editing, setEditing] = useState<Row | null>(null), [step, setStep] = useState(0), [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState(''), [detail, setDetail] = useState<Row | null>(null)
  const saving = useRef(false)
  const load = useCallback(async () => {
    setLoading(true)
    const results = await Promise.all([
      supabase.from('employees').select('*,employee_schedules(schedule_id)').order('full_name'),
      supabase.from('profiles').select('id,full_name,username,is_active,role').eq('is_active', true),
      supabase.from('work_schedules').select('*').order('name'),
      supabase.from('company_locations').select('*').eq('is_active', true).order('name'),
      supabase.from('hr_master_items').select('*').eq('is_active', true).order('name'),
    ])
    const failure = results.find(x => x.error)
    if (failure) { setMessage('Data belum berhasil dimuat. Coba muat ulang.'); setLoading(false); return }
    setRows((results[0].data || []).map((r: Row) => ({ ...r, schedule_id: r.employee_schedules?.schedule_id || '' })))
    setMembers(results[1].data || []); setSchedules(results[2].data || []); setLocations(results[3].data || []); setMasters(results[4].data || [])
    setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])
  const change = (key: string, value: any, group?: string) => setEditing(current => current && (group ? { ...current, [group]: { ...current[group], [key]: value } } : { ...current, [key]: value }))
  const start = (row?: Row) => { setEditing(row ? structuredClone(row) : blank()); setStep(0); setFormError('') }
  const save = async (draft: boolean, close: boolean) => {
    if (!editing || saving.current) return
    if (!editing.employee_code?.trim() || !editing.full_name?.trim()) { setFormError('Kode dan nama karyawan wajib diisi.'); setStep(0); return }
    if (!draft && (!editing.department || !editing.position || !editing.hire_date || !editing.schedule_id)) { setFormError('Lengkapi organisasi, jabatan, tanggal bergabung, dan jadwal kerja.'); setStep(1); return }
    saving.current = true; setBusy(true); setFormError('')
    try {
      const payload: Row = { ...editing, onboarding_status: draft ? 'draft' : 'complete', is_active: draft ? false : (editing.onboarding_status === 'draft' ? true : editing.is_active) }
      for (const key of ['profile_id', 'supervisor_profile_id', 'location_id', 'hire_date', 'contract_end']) payload[key] ||= null
      delete payload.employee_schedules; delete payload.created_at; delete payload.updated_at
      const { data, error } = await supabase.rpc('save_employee', { p_data: payload, p_id: editing.id || null, p_expected_updated_at: editing.updated_at || null })
      if (error) throw error
      const supervisorUpdate = await supabase.from('employees').update({ supervisor_profile_id: payload.supervisor_profile_id || null }).eq('id', data)
      if (supervisorUpdate.error) throw supervisorUpdate.error
      if (close) { setEditing(null); setFilter(draft ? 'draft' : payload.is_active ? 'active' : 'inactive') }
      else {
        const refreshed = await supabase.from('employees').select('*').eq('id', data).single()
        if (refreshed.error) throw refreshed.error
        setEditing({ ...refreshed.data, schedule_id: editing.schedule_id }); setStep(v => Math.min(2, v + 1))
      }
      setMessage(draft ? 'Draft tersimpan. Pilih tab Belum lengkap untuk melanjutkan.' : 'Data karyawan dan jadwal kerja berhasil disimpan.')
      await load()
    } catch (error: any) {
      setFormError(error.code === '23505' ? 'Kode karyawan atau akun tim sudah digunakan. Periksa kembali.' : error.message || 'Data belum tersimpan. Coba kembali.')
    } finally { saving.current = false; setBusy(false) }
  }
  const removeEmployee = async (row:Row) => {
    if(!canEdit||!confirm(`Hapus data karyawan ${row.full_name}? Jika sudah memiliki histori, sistem akan menolak dan meminta dinonaktifkan.`)) return
    setBusy(true); const {error}=await supabase.rpc('delete_employee_safe',{p_employee:row.id}); setBusy(false)
    setMessage(error?error.message:'Data karyawan berhasil dihapus.'); if(!error){setDetail(null);await load()}
  }
  const field = (key: string, label: string, type = 'text', group?: string, required = false) => {
    const value = group ? editing?.[group]?.[key] : editing?.[key]
    return <label className="field" key={key}><span>{label}{required ? ' *' : ''}</span>{type.includes('|') ? <select value={value || ''} onChange={e => change(key, e.target.value, group)} required={required}><option value="">Pilih</option>{type.split('|').map(v => <option key={v}>{v}</option>)}</select> : <input type={type} value={value ?? ''} required={required} min={type === 'number' ? 0 : undefined} onChange={e => change(key, type === 'number' ? Number(e.target.value) : e.target.value, group)} />}</label>
  }
  const select = (key: string, label: string, options: Row[], required = false) => <label className="field"><span>{label}{required ? ' *' : ''}</span><select value={editing?.[key] || ''} required={required} onChange={e => change(key, e.target.value)}><option value="">Pilih {label.toLowerCase()}</option>{options.map(x => <option key={x.id} value={x.id}>{x.name || x.full_name}</option>)}</select></label>
  const master = (key: string, label: string, kind: string) => <label className="field"><span>{label}</span><input list={`master-${kind}`} value={editing?.[key] || ''} onChange={e => change(key, e.target.value)} /><datalist id={`master-${kind}`}>{masters.filter(m => m.kind === kind).map(m => <option key={m.id} value={m.name} />)}</datalist></label>
  const supervisors = members.filter(m => m.role === 'supervisor' && m.is_active !== false && m.id !== editing?.profile_id)
  const visible = rows.filter(r => filter === 'all' || (filter === 'draft' ? r.onboarding_status === 'draft' : filter === 'active' ? r.is_active : !r.is_active && r.onboarding_status !== 'draft')).filter(r => `${r.full_name} ${r.employee_code} ${r.department || ''}`.toLowerCase().includes(query.toLowerCase()))
  return <section className="page">
    <div className="intro"><div><p className="eyebrow">Data master</p><h1>Karyawan</h1><p>Personal → kepegawaian → payroll. Data dapat diedit, dinonaktifkan, dan data tanpa histori dapat dihapus.</p></div>{canEdit && <button className="button primary" onClick={() => start()}>Tambah karyawan</button>}</div>
    {message && <p role="status" className="note">{message}</p>}
    <div className="filters">{[['active', 'Aktif'], ['draft', 'Belum lengkap'], ['inactive', 'Nonaktif'], ['all', 'Semua']].map(([id, label]) => <button key={id} className={filter === id ? 'active' : ''} onClick={() => setFilter(id)}>{label} ({rows.filter(r => id === 'all' || (id === 'draft' ? r.onboarding_status === 'draft' : id === 'active' ? r.is_active : !r.is_active && r.onboarding_status !== 'draft')).length})</button>)}</div>
    <div className="workflow-tools"><label className="field"><span>Cari karyawan</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Nama, kode, organisasi" /></label><button className="button secondary" disabled={loading} onClick={() => void load()}>Muat ulang</button></div>
    <div className="filters">{['Informasi Pribadi', 'Kontak', 'Kepegawaian', 'Payroll', 'Login ESS'].map(name => <button key={name} className={tab === name ? 'active' : ''} onClick={() => setTab(name)}>{name}</button>)}</div>
    <div className="card table"><table><thead><tr><th>Karyawan</th><th>{tab}</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{visible.map(row => <tr key={row.id}><td><b>{row.full_name}</b><small>{row.employee_code}</small></td><td>{tab === 'Kontak' ? <>{row.email || '—'}<small>{row.phone || '—'}</small></> : tab === 'Kepegawaian' ? <>{row.department || '—'}<small>{row.position || '—'} · {row.employment_type}</small></> : tab === 'Payroll' ? <>{money(row.base_salary)}<small>{row.bank_name || 'Rekening belum diisi'}</small></> : tab === 'Login ESS' ? (members.find(m => m.id === row.profile_id)?.username || 'Belum terhubung') : <>{row.personal_data?.birth_place || '—'}<small>{row.personal_data?.birth_date || 'Tanggal lahir belum diisi'}</small></>}</td><td>{row.onboarding_status === 'draft' ? 'Belum lengkap' : row.is_active ? 'Aktif' : 'Nonaktif'}</td><td><button className="button secondary" onClick={() => setDetail(row)}>Detail</button>{canEdit && <button className="button secondary" onClick={() => start(row)}>{row.onboarding_status === 'draft' ? 'Lengkapi data' : 'Edit'}</button>}{canEdit&&<button className="button secondary" disabled={busy} onClick={()=>void removeEmployee(row)}>Hapus</button>}</td></tr>)}</tbody></table>{!visible.length && <p className="empty">{loading ? 'Memuat karyawan…' : 'Tidak ada karyawan pada filter ini.'}</p>}</div>
    {editing && <div className="modal-layer"><div className="backdrop" /><section className="modal workflow-modal" role="dialog" aria-modal="true" aria-labelledby="employee-title"><header><h3 id="employee-title">{editing.id ? 'Edit / lengkapi karyawan' : 'Tambah karyawan'}</h3><button className="button secondary" disabled={busy} onClick={() => setEditing(null)}>Tutup</button></header>
      <div className="filters">{steps.map((label, i) => <button key={label} type="button" className={step === i ? 'active' : ''} disabled={busy} onClick={() => setStep(i)}>{i + 1}. {label}</button>)}</div>
      {formError && <p className="note" role="alert">{formError}</p>}
      <form className="form" onSubmit={(event: FormEvent) => { event.preventDefault(); if (step < 2) { if (editing.onboarding_status === 'draft') void save(true, false); else setStep(step + 1) } else void save(false, true) }}>
        <fieldset disabled={busy} className="workflow-fields"><legend>{steps[step]}</legend>
        {step === 0 && <div className="two">{field('employee_code', 'ID karyawan', 'text', undefined, true)}{field('full_name', 'Nama lengkap', 'text', undefined, true)}{field('email', 'Email', 'email')}{field('phone', 'Nomor ponsel', 'tel')}{personalFields.map(([key, label, type]) => field(key, label, type || 'text', 'personal_data'))}</div>}
        {step === 1 && <><div className="two">{field('employment_type', 'Status karyawan', 'Tetap Permanen|Tetap Percobaan|PKWT|Pekerja Lepas|Tenaga Ahli|Magang|Mitra|Tetap|Kontrak|Harian')}{field('hire_date', 'Tanggal bergabung', 'date', undefined, true)}{field('placement', 'Penempatan kerja', 'Baru Direkrut|Demosi|Diangkat Karyawan Tetap|Mutasi|Promosi|Rotasi')}{master('department', 'Organisasi', 'organization')}{master('position', 'Jabatan', 'position')}{master('rank_name', 'Pangkat', 'rank')}{select('supervisor_profile_id', 'Atasan langsung', supervisors)}{select('schedule_id', 'Jadwal kerja', schedules, true)}{select('location_id', 'Lokasi kantor', locations)}{field('contract_end', 'Tanggal akhir kerja', 'date')}</div><p>Organisasi, jabatan, dan pangkat dapat dipilih dari Pengaturan atau diketik. Jadwal dan lokasi dibuat melalui Jadwal & Lokasi.</p></>}
        {step === 2 && <><div className="two">{field('base_salary', 'Gaji pokok', 'number', undefined, true)}{field('bank_name', 'Bank')}{field('bank_account_name', 'Nama pemilik rekening')}{field('bank_account_number', 'Nomor rekening')}{field('npwp', 'NPWP', 'text', 'payroll_data')}{field('tax_status', 'Status pajak', 'TK/0|TK/1|TK/2|TK/3|K/0|K/1|K/2|K/3|K/I/0|K/I/1|K/I/2|K/I/3', 'payroll_data')}{field('tax_method', 'Metode pajak', 'Gross|Gross up|Net', 'payroll_data')}{field('bpjs_health', 'Nomor BPJS Kesehatan', 'text', 'payroll_data')}{field('bpjs_employment', 'Nomor BPJS Ketenagakerjaan', 'text', 'payroll_data')}{select('profile_id', 'Akun tim / ESS', members.filter(m => m.id === editing.profile_id || !rows.some(r => r.profile_id === m.id)))}</div><p className="note">NPWP dan BPJS disimpan sebagai data karyawan. Perhitungan pajak dan iuran otomatis belum diaktifkan.</p>{editing.onboarding_status === 'complete' && <label className="checkbox-line"><input type="checkbox" checked={editing.is_active} onChange={e => change('is_active', e.target.checked)} />Karyawan aktif. Matikan untuk menonaktifkan tanpa menghapus histori.</label>}</>}
        </fieldset><div className="workflow-actions">{step > 0 && <button type="button" className="button secondary" disabled={busy} onClick={() => setStep(step - 1)}>Kembali</button>}{editing.onboarding_status === 'draft' && <button className="button secondary" type="button" disabled={busy} onClick={() => void save(true, true)}>Simpan draft</button>}<button className="button primary" disabled={busy}>{busy ? 'Menyimpan…' : step < 2 ? 'Simpan & lanjutkan' : 'Simpan karyawan'}</button></div>
      </form></section></div>}
    {detail && <div className="modal-layer"><div className="backdrop" /><section className="modal workflow-modal" role="dialog" aria-modal="true" aria-label="Detail karyawan"><header><h3>{detail.full_name}</h3><button className="button secondary" onClick={() => setDetail(null)}>Tutup detail</button></header><dl className="workflow-detail">{[['Kode', detail.employee_code], ['Organisasi', detail.department], ['Jabatan', detail.position], ['Status kerja', detail.employment_type], ['Pangkat', detail.rank_name], ['Penempatan', detail.placement], ['Bergabung', detail.hire_date], ['Akhir kerja', detail.contract_end], ['Jadwal', schedules.find(s => s.id === detail.schedule_id)?.name], ['Lokasi', locations.find(s => s.id === detail.location_id)?.name], ['Email', detail.email], ['Telepon', detail.phone], ['Gaji pokok', money(detail.base_salary)], ['Bank', detail.bank_name], ['Pemilik rekening', detail.bank_account_name], ['Nomor rekening', detail.bank_account_number], ['NPWP', detail.payroll_data?.npwp], ['Status pajak', detail.payroll_data?.tax_status], ['BPJS Kesehatan', detail.payroll_data?.bpjs_health], ['BPJS Ketenagakerjaan', detail.payroll_data?.bpjs_employment], ...personalFields.map(([key, label]) => [label, detail.personal_data?.[key]])].map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value || '—'}</dd></div>)}</dl>{canEdit&&<div className="workflow-actions"><button className="button secondary" onClick={()=>{setDetail(null);start(detail)}}>Edit</button><button className="button secondary" disabled={busy} onClick={()=>void removeEmployee(detail)}>Hapus</button></div>}</section></div>}
  </section>
}

export function CompanyWorkflow({ profile }: { profile: Profile }) {
  const [company, setCompany] = useState<Row | null>(null), [items, setItems] = useState<Row[]>([]), [message, setMessage] = useState(''), [busy, setBusy] = useState(false)
  const [kind, setKind] = useState('organization'), [selected, setSelected] = useState<Row | null>(null)
  const hr = ['owner', 'hr_admin'].includes(profile.role)
  const load = useCallback(async () => { const [a, b] = await Promise.all([supabase.from('companies').select('*').eq('id', profile.company_id).single(), supabase.from('hr_master_items').select('*').order('name')]); if (a.error || b.error) setMessage('Pengaturan belum berhasil dimuat.'); else { setCompany(a.data); setItems(b.data || []) } }, [profile.company_id])
  useEffect(() => { void load() }, [load])
  const saveCompany = async (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); setBusy(true); const f = new FormData(e.currentTarget); const { error } = await supabase.from('companies').update({ name: String(f.get('name')).trim(), legal_name: String(f.get('legal_name')).trim(), address: String(f.get('address')).trim(), phone: String(f.get('phone')).trim(), payroll_day: Number(f.get('payroll_day')), timezone: String(f.get('timezone')) }).eq('id', profile.company_id).select('id').single(); setMessage(error ? 'Pengaturan belum tersimpan.' : 'Pengaturan perusahaan tersimpan.'); setBusy(false); if (!error) await load() }
  const saveMaster = async (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); const form = e.currentTarget; const f = new FormData(form); setBusy(true); const values = { name: String(f.get('name')).trim(), is_active: f.get('is_active') === 'on' }; const result = selected ? await supabase.from('hr_master_items').update(values).eq('id', selected.id).select('id').single() : await supabase.from('hr_master_items').insert({ ...values, company_id: profile.company_id, kind }).select('id').single(); setBusy(false); setMessage(result.error ? 'Data master belum tersimpan. Nama mungkin sudah digunakan.' : 'Data master tersimpan.'); if (!result.error) { setSelected(null); form.reset(); await load() } }
  const removeMaster=async(row:Row)=>{if(!hr||!confirm(`Hapus ${row.name}?`))return;setBusy(true);const {error}=await supabase.from('hr_master_items').delete().eq('id',row.id);setBusy(false);setMessage(error?'Data master belum dapat dihapus.':'Data master berhasil dihapus.');if(!error){setSelected(null);await load()}}
  return <section className="page"><div className="intro"><div><p className="eyebrow">Konfigurasi</p><h1>Pengaturan perusahaan</h1><p>Siapkan identitas perusahaan serta pilihan kepegawaian.</p></div></div>{message && <p className="note" role="status">{message}</p>}{company && <article className="card"><h3>Identitas perusahaan</h3><form className="form" onSubmit={saveCompany}><fieldset className="workflow-fields" disabled={profile.role !== 'owner' || busy}><div className="two">{[['name', 'Nama perusahaan'], ['legal_name', 'Nama badan usaha'], ['address', 'Alamat'], ['phone', 'Telepon']].map(([key, label]) => <label className="field" key={key}><span>{label}</span><input name={key} defaultValue={company[key] || ''} required={key === 'name'} /></label>)}<label className="field"><span>Tanggal gajian setiap bulan</span><input name="payroll_day" type="number" min="1" max="31" defaultValue={company.payroll_day} required /></label><label className="field"><span>Zona waktu</span><select name="timezone" defaultValue={company.timezone}><option>Asia/Jakarta</option><option>Asia/Makassar</option><option>Asia/Jayapura</option></select></label></div>{profile.role === 'owner' && <button className="button primary">Simpan perusahaan</button>}</fieldset></form></article>}
    <article className="card"><h3>Data master kepegawaian</h3><div className="filters">{[['organization', 'Organisasi'], ['position', 'Jabatan'], ['rank', 'Pangkat']].map(([id, label]) => <button key={id} className={id === kind ? 'active' : ''} onClick={() => { setKind(id); setSelected(null) }}>{label}</button>)}</div>{items.filter(m => m.kind === kind).map(m => <div className="row" key={m.id}><div><b>{m.name}</b><small>{m.is_active ? 'Aktif' : 'Nonaktif'}</small></div>{hr && <div className="inline-actions"><button className="button secondary" onClick={() => setSelected(m)}>Edit</button><button className="button secondary" disabled={busy} onClick={()=>void removeMaster(m)}>Hapus</button></div>}</div>)}{hr && <form key={`${kind}-${selected?.id || 'new'}`} className="form" onSubmit={saveMaster}><label className="field"><span>{selected ? 'Edit nama' : 'Tambah nama'}</span><input name="name" required defaultValue={selected?.name || ''} /></label><label className="checkbox-line"><input type="checkbox" name="is_active" defaultChecked={selected?.is_active ?? true} />Aktif</label><div className="workflow-actions"><button className="button primary" disabled={busy}>Simpan data master</button>{selected && <button type="button" className="button secondary" onClick={() => setSelected(null)}>Batal edit</button>}</div></form>}</article>
  </section>
}
