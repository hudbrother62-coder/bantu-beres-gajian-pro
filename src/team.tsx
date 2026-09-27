import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Plus, UserRoundCheck, UserRoundPlus, X } from 'lucide-react'
import { supabase } from './lib/supabase'

type Profile = { id: string; company_id: string; role: string }
type Employee = { id: string; employee_code: string; full_name: string; department?: string | null; position?: string | null; is_active: boolean }
type Member = { id: string; full_name: string; username: string; role: string; is_active: boolean; employees?: Employee[] }
const roles: Record<string, string> = { owner: 'Owner', hr_admin: 'HR / Admin', finance: 'Keuangan', supervisor: 'Atasan', employee: 'Karyawan' }

async function invokeTeam(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.functions.invoke('create-team-member', { body })
  if (data?.error) return { ok: false, error: String(data.error) }
  if (error) {
    let detail = ''
    try { detail = String((await (error as any).context?.json?.())?.error || '') } catch { /* Keep a helpful fallback. */ }
    return { ok: false, error: detail || 'Permintaan belum berhasil. Periksa koneksi, lalu coba lagi.' }
  }
  return { ok: data?.ok === true, error: data?.ok ? undefined : 'Server belum mengonfirmasi perubahan.' }
}

export function Team({ profile }: { profile: Profile }) {
  const isOwner = profile.role === 'owner'
  const [members, setMembers] = useState<Member[]>([])
  const [available, setAvailable] = useState<Employee[]>([])
  const [newOpen, setNewOpen] = useState(false)
  const [linking, setLinking] = useState<Member | null>(null)
  const [linkMode, setLinkMode] = useState<'existing' | 'draft'>('existing')
  const [selectedEmployee, setSelectedEmployee] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([
      supabase.from('profiles')
        .select('id,full_name,username,role,is_active,employees(id,employee_code,full_name,department,position,is_active)')
        .eq('company_id', profile.company_id).order('created_at'),
      supabase.from('employees')
        .select('id,employee_code,full_name,department,position,is_active')
        .eq('company_id', profile.company_id).eq('is_active', true)
        .is('profile_id', null).order('full_name')
    ])
    setLoading(false)
    if (a.error || b.error) {
      setMessage('Data tim belum berhasil dimuat. Periksa akses workspace, kemudian muat ulang.')
      return
    }
    setMembers((a.data || []) as Member[])
    setAvailable((b.data || []) as Employee[])
  }, [profile.company_id])

  useEffect(() => { void load() }, [load])
  const picked = available.find(e => e.id === selectedEmployee)

  const add = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setMessage('')
    const body = Object.fromEntries(new FormData(event.currentTarget).entries())
    const result = await invokeTeam({ ...body, action: 'create' })
    setBusy(false)
    if (!result.ok) { setMessage(result.error || 'Akun tim belum dibuat.'); return }
    setNewOpen(false)
    setSelectedEmployee('')
    setMessage(picked ? 'Akun berhasil dibuat dan terhubung ke karyawan aktif.' : 'Akun tim dibuat. Lengkapi data karyawan draft di menu Karyawan sebelum dipakai presensi.')
    void load()
  }

  const link = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!linking || busy) return
    setBusy(true)
    setMessage('')
    const body = Object.fromEntries(new FormData(event.currentTarget).entries())
    const result = await invokeTeam({
      ...body,
      action: linkMode === 'existing' ? 'link-existing' : 'create-draft-employee',
      profileId: linking.id
    })
    setBusy(false)
    if (!result.ok) { setMessage(result.error || 'Akun belum terhubung.'); return }
    setLinking(null)
    setSelectedEmployee('')
    setMessage(linkMode === 'existing'
      ? 'Akun lama berhasil terhubung ke data karyawan. Riwayat karyawan tetap dipertahankan.'
      : 'Data karyawan draft berhasil dibuat. HR perlu melengkapi dan mengaktifkannya sebelum presensi.')
    void load()
  }

  const openLink = (member: Member) => {
    setMessage('')
    setSelectedEmployee('')
    setLinkMode(available.length ? 'existing' : 'draft')
    setLinking(member)
  }

  return <section className="page">
    <div className="intro"><div><p className="eyebrow">Akses perusahaan</p><h1>Tim & akun karyawan</h1><p>Hubungkan akun login dengan data karyawan agar presensi, pengajuan, dan slip gaji menggunakan identitas yang benar.</p></div>
      <button className="button primary" onClick={() => { setNewOpen(true); setSelectedEmployee(''); setMessage('') }}><Plus /> Tambah tim</button>
    </div>
    {message && <p className="note" role="status">{message}</p>}
    {loading && <div className="card"><p>Memuat anggota tim…</p></div>}
    {!loading && <div className="team">{members.map(member => {
      const employee = member.employees?.[0]
      const mayLink = !employee && member.role !== 'owner' && (isOwner || member.role === 'employee')
      return <article className="card member" key={member.id}>
        <div className="avatar">{(employee?.full_name || member.full_name || '?').charAt(0).toUpperCase()}</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h3>{employee?.full_name || member.full_name}</h3>
          <p>@{member.username}</p>
          <div className="inline-actions" style={{ flexWrap: 'wrap' }}>
            <span className="badge">{roles[member.role] || member.role}</span>
            {!member.is_active ? <span className="badge draft">Akun dinonaktifkan</span>
              : employee?.is_active ? <span className="badge active">Karyawan aktif · {employee.employee_code}</span>
              : employee ? <span className="badge draft">Data karyawan draft/nonaktif · {employee.employee_code}</span>
              : member.role === 'owner' ? <span className="badge">Owner workspace</span>
              : <span className="badge draft">Belum terhubung data karyawan</span>}
          </div>
          {employee && <small>{employee.position || employee.department || 'Lengkapi jabatan di menu Karyawan'}</small>}
          {mayLink && <button type="button" className="button secondary" onClick={() => openLink(member)}><UserRoundCheck /> Hubungkan data karyawan</button>}
        </div>
      </article>
    })}</div>}

    {newOpen && <div className="modal-layer"><button type="button" className="backdrop" aria-label="Tutup" onClick={() => !busy && setNewOpen(false)} />
      <section className="modal" role="dialog" aria-modal="true" aria-label="Tambah anggota tim">
        <header><h3>Tambah anggota tim</h3><button type="button" className="icon" disabled={busy} onClick={() => setNewOpen(false)} aria-label="Tutup"><X /></button></header>
        <form onSubmit={add} className="form">
          <label className="field"><span>Hubungkan ke karyawan aktif (opsional)</span><select name="employeeId" value={selectedEmployee} onChange={e => setSelectedEmployee(e.target.value)}>
            <option value="">Buat akun baru tanpa memilih karyawan</option>
            {available.map(e => <option key={e.id} value={e.id}>{e.full_name} · {e.employee_code}</option>)}
          </select></label>
          {picked && <p className="note">Nama akun menggunakan data {picked.full_name}; riwayat karyawan tidak dibuat ulang.</p>}
          <div className="two" key={selectedEmployee || 'manual'}>
            <label className="field"><span>Nama lengkap</span><input name="fullName" defaultValue={picked?.full_name || ''} required={!selectedEmployee} /></label>
            <label className="field"><span>Jabatan</span><input name="jobTitle" defaultValue={picked?.position || ''} /></label>
          </div>
          <div className="two"><label className="field"><span>Username</span><input name="username" minLength={4} maxLength={30} pattern="[a-zA-Z0-9._-]+" required /></label>
            <label className="field"><span>Password awal</span><input name="password" type="password" minLength={8} required /></label></div>
          <label className="field"><span>Hak akses</span><select name="role" defaultValue="employee">
            {isOwner && <><option value="hr_admin">HR / Admin</option><option value="finance">Keuangan</option><option value="supervisor">Atasan</option></>}
            <option value="employee">Karyawan</option>
          </select></label>
          <p className="form-help">Akun role Karyawan tanpa data aktif dibuat sebagai draft, bukan langsung dianggap aktif.</p>
          <div className="two"><label className="field"><span>Kode karyawan baru (opsional)</span><input name="employeeCode" placeholder="Otomatis dari username" /></label>
            <label className="field"><span>Divisi baru</span><input name="department" /></label></div>
          <label className="field"><span>Jabatan karyawan baru</span><input name="position" /></label>
          <button className="button primary" disabled={busy}><UserRoundPlus />{busy ? 'Menyimpan…' : 'Buat akun tim'}</button>
        </form>
      </section></div>}

    {linking && <div className="modal-layer"><button type="button" className="backdrop" aria-label="Tutup" onClick={() => !busy && setLinking(null)} />
      <section className="modal" role="dialog" aria-modal="true" aria-label="Hubungkan data karyawan">
        <header><h3>Hubungkan @{linking.username}</h3><button type="button" className="icon" disabled={busy} onClick={() => setLinking(null)} aria-label="Tutup"><X /></button></header>
        <div className="filters">
          <button type="button" className={linkMode === 'existing' ? 'active' : ''} disabled={!available.length || busy} onClick={() => setLinkMode('existing')}>Data karyawan aktif</button>
          <button type="button" className={linkMode === 'draft' ? 'active' : ''} disabled={busy} onClick={() => setLinkMode('draft')}>Buat data draft</button>
        </div>
        <form onSubmit={link} className="form">
          {linkMode === 'existing' ? <>
            <p className="form-help">Pilih karyawan yang belum mempunyai akun. Seluruh riwayat presensi dan payroll tetap melekat pada data karyawan tersebut.</p>
            <label className="field"><span>Data karyawan</span><select name="employeeId" required value={selectedEmployee} onChange={e => setSelectedEmployee(e.target.value)}>
              <option value="">Pilih karyawan</option>{available.map(e => <option value={e.id} key={e.id}>{e.full_name} · {e.employee_code}</option>)}
            </select></label>
          </> : <>
            <p className="form-help">Buat data karyawan baru dalam status draft/nonaktif. Setelah HR melengkapi profil dan mengaktifkan karyawan, akun ini dapat melakukan presensi dan pengajuan.</p>
            <label className="field"><span>Kode karyawan (opsional)</span><input name="employeeCode" placeholder={linking.username.toUpperCase()} /></label>
            <div className="two"><label className="field"><span>Divisi</span><input name="department" placeholder="Operasional" /></label>
              <label className="field"><span>Jabatan</span><input name="position" placeholder="Staf" /></label></div>
          </>}
          <button className="button primary" disabled={busy || (linkMode === 'existing' && !selectedEmployee)}>{busy ? 'Menghubungkan…' : linkMode === 'existing' ? 'Hubungkan akun lama' : 'Buat data karyawan draft'}</button>
        </form>
      </section></div>}
  </section>
}
