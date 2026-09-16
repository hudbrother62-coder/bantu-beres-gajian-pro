from pathlib import Path

app_path=Path('src/App.tsx')
employees_path=Path('src/employees.tsx')
app=app_path.read_text()
employees=employees_path.read_text()

needle="import { WorkSetupManagement, PayrollComponentsManagement } from './setup-management'\n"
insert=needle+"import { SupervisorApprovals, SupervisorAttendance, SupervisorDashboard, SupervisorReport, SupervisorTeam } from './supervisor'\n"
if "from './supervisor'" not in app:
    if needle not in app: raise SystemExit('App import anchor not found')
    app=app.replace(needle,insert,1)

old="const allNav:[string,React.ElementType,string[]][]=[['Beranda',LayoutDashboard,['owner','hr_admin','finance','supervisor','employee']],['Karyawan',Users,['owner','hr_admin','finance']],['Kehadiran',CalendarCheck,['owner','hr_admin','employee']],['Jadwal & Lokasi',MapPinned,['owner','hr_admin']],['Kunjungan Klien',MapPin,['owner','hr_admin','employee']],['Pelacakan Lokasi',MapPinned,['owner','hr_admin','employee']],['Pengajuan',ClipboardCheck,['owner','hr_admin','finance','supervisor','employee']],['Approval',ClipboardCheck,['owner','hr_admin','finance']],['Komponen Gaji',WalletCards,['owner','hr_admin','finance']],['Payroll',CircleDollarSign,['owner','hr_admin','finance','employee']],['Keuangan',WalletCards,['owner','hr_admin','finance']],['Rekrutmen',Users,['owner','hr_admin']],['Tim',ShieldCheck,['owner','hr_admin']],['Laporan',FileText,['owner','hr_admin','finance']],['Pengaturan',Settings,['owner','hr_admin']]]"
new="const allNav:[string,React.ElementType,string[]][]=[['Beranda',LayoutDashboard,['owner','hr_admin','finance','supervisor','employee']],['Tim Saya',Users,['supervisor']],['Kehadiran Tim',CalendarCheck,['supervisor']],['Approval Tim',ClipboardCheck,['supervisor']],['Pengajuan Saya',ClipboardCheck,['supervisor']],['Rekap Tim',FileText,['supervisor']],['Karyawan',Users,['owner','hr_admin','finance']],['Kehadiran',CalendarCheck,['owner','hr_admin','employee']],['Jadwal & Lokasi',MapPinned,['owner','hr_admin']],['Kunjungan Klien',MapPin,['owner','hr_admin','employee']],['Pelacakan Lokasi',MapPinned,['owner','hr_admin','employee']],['Pengajuan',ClipboardCheck,['owner','hr_admin','finance','employee']],['Approval',ClipboardCheck,['owner','hr_admin','finance']],['Komponen Gaji',WalletCards,['owner','hr_admin','finance']],['Payroll',CircleDollarSign,['owner','hr_admin','finance','employee']],['Keuangan',WalletCards,['owner','hr_admin','finance']],['Rekrutmen',Users,['owner','hr_admin']],['Tim',ShieldCheck,['owner','hr_admin']],['Laporan',FileText,['owner','hr_admin','finance']],['Pengaturan',Settings,['owner','hr_admin']]]"
if old in app: app=app.replace(old,new,1)
elif "['Tim Saya',Users,['supervisor']]" not in app: raise SystemExit('Navigation anchor not found')

old="const bottomNames=profile.role==='employee'?['Beranda','Kehadiran','Pengajuan','Payroll','Pelacakan Lokasi']:['Beranda','Karyawan','Kehadiran','Payroll','Approval']"
new="const bottomNames=profile.role==='employee'?['Beranda','Kehadiran','Pengajuan','Payroll','Pelacakan Lokasi']:profile.role==='supervisor'?['Beranda','Tim Saya','Kehadiran Tim','Approval Tim','Pengajuan Saya']:['Beranda','Karyawan','Kehadiran','Payroll','Approval']"
if old in app: app=app.replace(old,new,1)
elif "profile.role==='supervisor'?['Beranda','Tim Saya'" not in app: raise SystemExit('Bottom nav anchor not found')

old="function Content({page,profile}:{page:string;profile:Profile}){if(page==='Beranda')return <Dashboard profile={profile}/>;if(page==='Karyawan')return <EmployeeWorkflow profile={profile}/>;"
new="function Content({page,profile}:{page:string;profile:Profile}){if(page==='Beranda')return profile.role==='supervisor'?<SupervisorDashboard profile={profile}/>:<Dashboard profile={profile}/>;if(page==='Tim Saya')return <SupervisorTeam profile={profile}/>;if(page==='Kehadiran Tim')return <SupervisorAttendance profile={profile}/>;if(page==='Approval Tim')return <SupervisorApprovals profile={profile}/>;if(page==='Pengajuan Saya')return <RequestManagement profile={profile}/>;if(page==='Rekap Tim')return <SupervisorReport profile={profile}/>;if(page==='Karyawan')return <EmployeeWorkflow profile={profile}/>;"
if old in app: app=app.replace(old,new,1)
elif "if(page==='Tim Saya')return <SupervisorTeam" not in app: raise SystemExit('Content anchor not found')

app_path.write_text(app)

old="const blank = (): Row => ({ employee_code: '', full_name: '', email: '', phone: '', department: '', position: '', rank_name: '', employment_type: 'Tetap Permanen', placement: 'Baru Direkrut', hire_date: dateNow(), contract_end: '', base_salary: 0, bank_name: '', bank_account_name: '', bank_account_number: '', profile_id: '', location_id: '', schedule_id: '', personal_data: {}, payroll_data: {}, is_active: false, onboarding_status: 'draft' })"
new="const blank = (): Row => ({ employee_code: '', full_name: '', email: '', phone: '', department: '', position: '', rank_name: '', employment_type: 'Tetap Permanen', placement: 'Baru Direkrut', hire_date: dateNow(), contract_end: '', base_salary: 0, bank_name: '', bank_account_name: '', bank_account_number: '', profile_id: '', supervisor_profile_id: '', location_id: '', schedule_id: '', personal_data: {}, payroll_data: {}, is_active: false, onboarding_status: 'draft' })"
if old in employees: employees=employees.replace(old,new,1)
elif "supervisor_profile_id: ''" not in employees: raise SystemExit('Employee blank anchor not found')

old="supabase.from('profiles').select('id,full_name,username,is_active').eq('is_active', true),"
new="supabase.from('profiles').select('id,full_name,username,is_active,role').eq('is_active', true),"
if old in employees: employees=employees.replace(old,new,1)
elif "username,is_active,role" not in employees: raise SystemExit('Profile query anchor not found')

old="for (const key of ['profile_id', 'location_id', 'hire_date', 'contract_end']) payload[key] ||= null"
new="for (const key of ['profile_id', 'supervisor_profile_id', 'location_id', 'hire_date', 'contract_end']) payload[key] ||= null"
if old in employees: employees=employees.replace(old,new,1)
elif "'supervisor_profile_id', 'location_id'" not in employees: raise SystemExit('Nullable fields anchor not found')

old="if (error) throw error\n      if (close)"
new="if (error) throw error\n      const supervisorUpdate = await supabase.from('employees').update({ supervisor_profile_id: payload.supervisor_profile_id || null }).eq('id', data)\n      if (supervisorUpdate.error) throw supervisorUpdate.error\n      if (close)"
if old in employees: employees=employees.replace(old,new,1)
elif "const supervisorUpdate = await supabase.from('employees')" not in employees: raise SystemExit('Supervisor update anchor not found')

old="const visible = rows.filter(r => filter === 'all'"
new="const supervisors = members.filter(m => m.role === 'supervisor' && m.is_active !== false && m.id !== editing?.profile_id)\n  const visible = rows.filter(r => filter === 'all'"
if old in employees: employees=employees.replace(old,new,1)
elif "const supervisors = members.filter" not in employees: raise SystemExit('Visible rows anchor not found')

old="{master('position', 'Jabatan', 'position')}{master('rank_name', 'Pangkat', 'rank')}{select('schedule_id', 'Jadwal kerja', schedules, true)}"
new="{master('position', 'Jabatan', 'position')}{master('rank_name', 'Pangkat', 'rank')}{select('supervisor_profile_id', 'Atasan langsung', supervisors)}{select('schedule_id', 'Jadwal kerja', schedules, true)}"
if old in employees: employees=employees.replace(old,new,1)
elif "select('supervisor_profile_id', 'Atasan langsung'" not in employees: raise SystemExit('Employee organization fields anchor not found')

employees_path.write_text(employees)
