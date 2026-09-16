create or replace function private.notify_assignment_event() returns trigger language plpgsql security definer set search_path = '' as $$
declare employee_profile uuid; schedule_name text;
begin
  select e.profile_id into employee_profile from public.employees e where e.id=new.employee_id;
  select s.name into schedule_name from public.work_schedules s where s.id=new.schedule_id;
  perform private.notify_user(new.company_id,employee_profile,'Jadwal kerja diperbarui','Anda ditempatkan pada jadwal '||coalesce(schedule_name,'kerja')||'.','schedule','Kehadiran','employee_schedules',new.employee_id,'schedule:'||new.employee_id||':'||new.schedule_id||':'||new.effective_from);
  return new;
end; $$;

create or replace function private.notify_business_event() returns trigger language plpgsql security definer set search_path = '' as $$
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
