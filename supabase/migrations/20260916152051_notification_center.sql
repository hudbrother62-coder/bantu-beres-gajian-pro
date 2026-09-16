create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  message text not null,
  category text not null default 'system',
  target_page text not null default 'Beranda',
  entity_type text,
  entity_id uuid,
  dedupe_key text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (recipient_id, dedupe_key)
);

create index notifications_recipient_created_idx on public.notifications(recipient_id, created_at desc);
create index notifications_recipient_unread_idx on public.notifications(recipient_id, created_at desc) where read_at is null;

alter table public.notifications enable row level security;
grant select on public.notifications to authenticated;
grant update(read_at) on public.notifications to authenticated;

create policy notifications_read_own on public.notifications for select to authenticated
using (recipient_id = (select auth.uid()) and company_id = (select private.current_company_id()));
create policy notifications_mark_own on public.notifications for update to authenticated
using (recipient_id = (select auth.uid()) and company_id = (select private.current_company_id()))
with check (recipient_id = (select auth.uid()) and company_id = (select private.current_company_id()));

create function private.notify_user(
  p_company uuid, p_recipient uuid, p_title text, p_message text, p_category text,
  p_page text, p_entity_type text, p_entity_id uuid, p_key text
) returns void language sql security definer set search_path = '' as $$
  insert into public.notifications(company_id,recipient_id,title,message,category,target_page,entity_type,entity_id,dedupe_key)
  select p_company,p_recipient,p_title,p_message,p_category,p_page,p_entity_type,p_entity_id,p_key
  where p_recipient is not null
  on conflict (recipient_id,dedupe_key) do nothing;
$$;

create function private.notify_roles(
  p_company uuid, p_roles public.app_role[], p_title text, p_message text, p_category text,
  p_page text, p_entity_type text, p_entity_id uuid, p_key text, p_exclude uuid default null
) returns void language sql security definer set search_path = '' as $$
  insert into public.notifications(company_id,recipient_id,title,message,category,target_page,entity_type,entity_id,dedupe_key)
  select p_company,p.id,p_title,p_message,p_category,p_page,p_entity_type,p_entity_id,p_key
  from public.profiles p
  where p.company_id=p_company and p.is_active and p.role=any(p_roles) and (p_exclude is null or p.id<>p_exclude)
  on conflict (recipient_id,dedupe_key) do nothing;
$$;

revoke all on function private.notify_user(uuid,uuid,text,text,text,text,text,uuid,text) from public,anon,authenticated;
revoke all on function private.notify_roles(uuid,public.app_role[],text,text,text,text,text,uuid,text,uuid) from public,anon,authenticated;

create function private.notify_request_event() returns trigger language plpgsql security definer set search_path = '' as $$
declare employee_name text; employee_profile uuid; label text; manager_roles public.app_role[];
begin
  select e.full_name,e.profile_id into employee_name,employee_profile from public.employees e where e.id=new.employee_id;
  label:=case tg_table_name when 'leave_requests' then 'Cuti / izin' when 'overtime_requests' then 'Lembur' when 'cash_advances' then 'Kasbon' else 'Reimburse' end;
  manager_roles:=case when tg_table_name in ('cash_advances','reimbursements') then array['owner','hr_admin','finance']::public.app_role[] else array['owner','hr_admin']::public.app_role[] end;
  if tg_op='INSERT' then
    perform private.notify_roles(new.company_id,manager_roles,'Pengajuan baru menunggu approval',coalesce(employee_name,'Karyawan')||' mengajukan '||lower(label)||'.','approval','Approval',tg_table_name,new.id,tg_table_name||':'||new.id||':submitted',auth.uid());
  elsif old.status is distinct from new.status then
    perform private.notify_user(new.company_id,employee_profile,label||' '||case new.status when 'approved' then 'disetujui' when 'rejected' then 'ditolak' when 'cancelled' then 'dibatalkan' else 'diperbarui' end,'Status pengajuan Anda sekarang: '||new.status||'.','approval','Pengajuan',tg_table_name,new.id,tg_table_name||':'||new.id||':'||new.status);
  end if;
  return new;
end; $$;

create trigger notify_leave_event after insert or update of status on public.leave_requests for each row execute function private.notify_request_event();
create trigger notify_overtime_event after insert or update of status on public.overtime_requests for each row execute function private.notify_request_event();
create trigger notify_cash_advance_event after insert or update of status on public.cash_advances for each row execute function private.notify_request_event();
create trigger notify_reimbursement_event after insert or update of status on public.reimbursements for each row execute function private.notify_request_event();

create function private.notify_payroll_event() returns trigger language plpgsql security definer set search_path = '' as $$
declare recipient record; period_text text;
begin
  period_text:=to_char(new.period_start,'DD Mon YYYY')||'–'||to_char(new.period_end,'DD Mon YYYY');
  if tg_op='INSERT' then
    perform private.notify_roles(new.company_id,array['owner','hr_admin','finance']::public.app_role[],'Draft payroll dibuat','Payroll periode '||period_text||' siap diperiksa.','payroll','Payroll','payroll_periods',new.id,'payroll:'||new.id||':draft',auth.uid());
  elsif old.status is distinct from new.status then
    perform private.notify_roles(new.company_id,array['owner','hr_admin','finance']::public.app_role[],'Status payroll diperbarui','Payroll periode '||period_text||' sekarang berstatus '||new.status||'.','payroll','Payroll','payroll_periods',new.id,'payroll:'||new.id||':'||new.status,auth.uid());
    if new.status in ('locked','paid') then
      for recipient in select distinct e.profile_id from public.payroll_entries pe join public.employees e on e.id=pe.employee_id where pe.payroll_period_id=new.id and e.profile_id is not null loop
        perform private.notify_user(new.company_id,recipient.profile_id,case new.status when 'paid' then 'Gaji telah dibayarkan' else 'Slip gaji telah tersedia' end,'Payroll periode '||period_text||case new.status when 'paid' then ' telah dibayarkan.' else ' telah dikunci dan slip dapat dilihat.' end,'payroll','Payroll','payroll_periods',new.id,'payroll:'||new.id||':'||new.status);
      end loop;
    end if;
  end if;
  return new;
end; $$;
create trigger notify_payroll_event after insert or update of status on public.payroll_periods for each row execute function private.notify_payroll_event();

create function private.notify_attendance_event() returns trigger language plpgsql security definer set search_path = '' as $$
declare employee_name text; employee_profile uuid;
begin
  if new.status='late' then
    select e.full_name,e.profile_id into employee_name,employee_profile from public.employees e where e.id=new.employee_id;
    perform private.notify_roles(new.company_id,array['owner','hr_admin']::public.app_role[],'Karyawan terlambat',coalesce(employee_name,'Karyawan')||' tercatat terlambat hari ini.','attendance','Kehadiran','attendance_records',new.id,'attendance:'||new.id||':late',employee_profile);
    perform private.notify_user(new.company_id,employee_profile,'Presensi tercatat terlambat','Check-in Anda telah tercatat dengan status terlambat.','attendance','Kehadiran','attendance_records',new.id,'attendance:'||new.id||':late:self');
  end if;
  return new;
end; $$;
create trigger notify_attendance_event after insert on public.attendance_records for each row execute function private.notify_attendance_event();

create function private.notify_assignment_event() returns trigger language plpgsql security definer set search_path = '' as $$
declare employee_profile uuid; schedule_name text;
begin
  select e.profile_id into employee_profile from public.employees e where e.id=new.employee_id;
  select s.name into schedule_name from public.work_schedules s where s.id=new.schedule_id;
  perform private.notify_user(new.company_id,employee_profile,'Jadwal kerja diperbarui','Anda ditempatkan pada jadwal '||coalesce(schedule_name,'kerja')||'.','schedule','Kehadiran','employee_schedules',new.employee_id,'schedule:'||new.employee_id||':'||new.schedule_id||':'||new.effective_from);
  return new;
end; $$;
create trigger notify_assignment_event after insert or update on public.employee_schedules for each row execute function private.notify_assignment_event();

create function private.notify_visit_event() returns trigger language plpgsql security definer set search_path = '' as $$
declare employee_profile uuid; employee_name text;
begin
  select e.profile_id,e.full_name into employee_profile,employee_name from public.employees e where e.id=new.employee_id;
  if tg_op='INSERT' then
    perform private.notify_user(new.company_id,employee_profile,'Kunjungan klien baru','Anda mendapat kunjungan ke '||new.client_name||'.','visit','Kunjungan Klien','client_visits',new.id,'visit:'||new.id||':planned');
  elsif old.status is distinct from new.status then
    perform private.notify_roles(new.company_id,array['owner','hr_admin']::public.app_role[],'Status kunjungan diperbarui',coalesce(employee_name,'Karyawan')||' memperbarui kunjungan '||new.client_name||' menjadi '||new.status||'.','visit','Kunjungan Klien','client_visits',new.id,'visit:'||new.id||':'||new.status,employee_profile);
  end if;
  return new;
end; $$;
create trigger notify_visit_event after insert or update of status on public.client_visits for each row execute function private.notify_visit_event();

create function private.notify_tracking_event() returns trigger language plpgsql security definer set search_path = '' as $$
declare employee_name text;
begin
  select e.full_name into employee_name from public.employees e where e.id=new.employee_id;
  if tg_table_name='location_pings' and new.is_mock_suspected then
    perform private.notify_roles(new.company_id,array['owner','hr_admin']::public.app_role[],'Indikasi lokasi tidak valid','Fake GPS terindikasi pada lokasi '||coalesce(employee_name,'karyawan')||'.','security','Pelacakan Lokasi','location_pings',new.id,'ping:'||new.id||':mock',null);
  elsif tg_table_name='tracking_sessions' and tg_op='UPDATE' and old.status is distinct from new.status and new.status='ended' then
    perform private.notify_roles(new.company_id,array['owner','hr_admin']::public.app_role[],'Pelacakan selesai',coalesce(employee_name,'Karyawan')||' menyelesaikan tugas '||new.task_name||'.','tracking','Pelacakan Lokasi','tracking_sessions',new.id,'tracking:'||new.id||':ended',auth.uid());
  end if;
  return new;
end; $$;
create trigger notify_tracking_session_event after update of status on public.tracking_sessions for each row execute function private.notify_tracking_event();
create trigger notify_mock_location_event after insert on public.location_pings for each row execute function private.notify_tracking_event();

create function private.notify_business_event() returns trigger language plpgsql security definer set search_path = '' as $$
declare employee_profile uuid; employee_name text; component_name text;
begin
  if tg_table_name='candidates' then
    perform private.notify_roles(new.company_id,array['owner','hr_admin']::public.app_role[],case when tg_op='INSERT' then 'Kandidat baru' else 'Tahap kandidat diperbarui' end,new.full_name||' berada pada tahap '||new.status||'.','recruitment','Rekrutmen','candidates',new.id,'candidate:'||new.id||':'||new.status,auth.uid());
  elsif tg_table_name='petty_cash_entries' then
    perform private.notify_roles(new.company_id,array['owner','finance']::public.app_role[],'Transaksi kas dicatat',new.description||' · Rp'||trim(to_char(new.amount,'FM999G999G999G999'))||'.','finance','Keuangan','petty_cash_entries',new.id,'cash-entry:'||new.id,auth.uid());
  elsif tg_table_name='employee_compensation' then
    select e.profile_id,e.full_name into employee_profile,employee_name from public.employees e where e.id=new.employee_id;
    select c.name into component_name from public.payroll_components c where c.id=new.component_id;
    perform private.notify_user(new.company_id,employee_profile,'Komponen gaji diperbarui',coalesce(component_name,'Komponen gaji')||' telah dipasang pada data payroll Anda.','payroll','Payroll','employee_compensation',new.id,'compensation:'||new.id);
  elsif tg_table_name='profiles' then
    perform private.notify_roles(new.company_id,array['owner']::public.app_role[],'Anggota tim baru',new.full_name||' bergabung sebagai '||new.role||'.','team','Tim','profiles',new.id,'profile:'||new.id,new.id);
  end if;
  return new;
end; $$;
create trigger notify_candidate_event after insert or update of status on public.candidates for each row execute function private.notify_business_event();
create trigger notify_petty_cash_event after insert on public.petty_cash_entries for each row execute function private.notify_business_event();
create trigger notify_compensation_event after insert on public.employee_compensation for each row execute function private.notify_business_event();
create trigger notify_team_event after insert on public.profiles for each row execute function private.notify_business_event();

revoke all on function private.notify_request_event() from public,anon,authenticated;
revoke all on function private.notify_payroll_event() from public,anon,authenticated;
revoke all on function private.notify_attendance_event() from public,anon,authenticated;
revoke all on function private.notify_assignment_event() from public,anon,authenticated;
revoke all on function private.notify_visit_event() from public,anon,authenticated;
revoke all on function private.notify_tracking_event() from public,anon,authenticated;
revoke all on function private.notify_business_event() from public,anon,authenticated;

do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
