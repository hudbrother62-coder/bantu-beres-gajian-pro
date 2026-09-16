alter table public.payroll_entries add column employee_snapshot jsonb not null default '{}';

-- Validate edits and transitions in PostgreSQL, including calls outside this UI.
create function private.guard_payroll_period() returns trigger language plpgsql security invoker set search_path='' as $$
declare n integer; gross numeric; deductions numeric; net numeric;
begin
  if tg_op='DELETE' then
    if old.status<>'draft' then raise exception 'Hanya draft payroll dapat dihapus.'; end if;
    return old;
  end if;
  if tg_op='INSERT' then
    if new.status<>'draft' then raise exception 'Payroll harus dimulai sebagai draft.'; end if;
    return new;
  end if;
  if old.status in ('locked','paid') and (to_jsonb(new)-array['status','updated_at']) is distinct from (to_jsonb(old)-array['status','updated_at']) then raise exception 'Payroll terkunci tidak dapat diubah.'; end if;
  if old.status<>new.status then
    if not ((old.status='draft' and new.status='review') or (old.status='review' and new.status in ('draft','approved')) or (old.status='approved' and new.status='locked') or (old.status='locked' and new.status='paid')) then raise exception 'Urutan status payroll tidak valid.'; end if;
    select count(*),coalesce(sum(pe.base_salary+pe.earnings),0),coalesce(sum(pe.deductions),0),coalesce(sum(pe.net_pay),0) into n,gross,deductions,net from public.payroll_entries pe where pe.payroll_period_id=old.id and pe.company_id=old.company_id;
    if n=0 then raise exception 'Payroll kosong tidak dapat diproses. Hitung ulang draft terlebih dahulu.'; end if;
    if new.total_gross<>gross or new.total_deduction<>deductions or new.total_net<>net then raise exception 'Total payroll tidak sesuai rincian. Hitung ulang draft.'; end if;
    if new.status='approved' then new.approved_by:=auth.uid(); new.approved_at:=now(); end if;
    if new.status='locked' then new.locked_at:=now(); end if;
  end if;
  return new;
end $$;
create trigger payroll_period_guard before insert or update or delete on public.payroll_periods for each row execute function private.guard_payroll_period();

create function private.guard_payroll_entry() returns trigger language plpgsql security invoker set search_path='' as $$
declare pid uuid; cid uuid; st public.payroll_status;
begin
  if tg_op='DELETE' then pid:=old.payroll_period_id; cid:=old.company_id; else pid:=new.payroll_period_id; cid:=new.company_id; end if;
  select status into st from public.payroll_periods where id=pid and company_id=cid for update;
  if not found or st<>'draft' then raise exception 'Rincian hanya boleh diubah pada draft payroll.'; end if;
  if tg_op='UPDATE' and (old.payroll_period_id<>new.payroll_period_id or old.employee_id<>new.employee_id or old.company_id<>new.company_id) then raise exception 'Identitas rincian payroll tidak dapat dipindahkan.'; end if;
  if tg_op<>'DELETE' then
    if not exists(select 1 from public.employees where id=new.employee_id and company_id=new.company_id) then raise exception 'Karyawan payroll tidak valid.'; end if;
    if new.base_salary<0 or new.earnings<0 or new.deductions<0 or new.net_pay<>new.base_salary+new.earnings-new.deductions then raise exception 'Nominal payroll tidak valid.'; end if;
    if new.net_pay<0 then raise exception 'Potongan melebihi penghasilan.'; end if;
    return new;
  end if;
  return old;
end $$;
create trigger payroll_entry_guard before insert or update or delete on public.payroll_entries for each row execute function private.guard_payroll_entry();

create function public.generate_payroll(p_start date,p_end date,p_payment date,p_period uuid default null) returns uuid
language plpgsql security invoker set search_path='' as $$
declare cid uuid:=private.current_company_id(); pid uuid; e public.employees; details jsonb; earnings numeric; deductions numeric; st public.payroll_status;
begin
  if auth.uid() is null or not coalesce(private.can_manage_finance(),false) then raise exception 'Akses keuangan diperlukan.'; end if;
  if p_start is null or p_end is null or p_payment is null or p_end<p_start or p_end-p_start>62 then raise exception 'Isi periode yang valid, maksimal 63 hari.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(cid::text,0));
  if not exists(select 1 from public.employees where company_id=cid and is_active and onboarding_status='complete' and (hire_date is null or hire_date<=p_end) and (contract_end is null or contract_end>=p_start)) then raise exception 'Belum ada karyawan aktif dan lengkap pada periode ini.'; end if;
  if p_period is not null then
    select id,status into pid,st from public.payroll_periods where id=p_period and company_id=cid for update;
    if not found or st<>'draft' then raise exception 'Hanya draft dapat dihitung ulang.'; end if;
  end if;
  if exists(select 1 from public.payroll_periods where company_id=cid and id<>coalesce(pid,'00000000-0000-0000-0000-000000000000'::uuid) and period_start<=p_end and period_end>=p_start) then raise exception 'Periode bertumpuk dengan payroll yang sudah ada.'; end if;
  if pid is null then
    insert into public.payroll_periods(company_id,period_start,period_end,payment_date) values(cid,p_start,p_end,p_payment) returning id into pid;
  else
    delete from public.payroll_entries where payroll_period_id=pid and company_id=cid;
    update public.payroll_periods set period_start=p_start,period_end=p_end,payment_date=p_payment where id=pid;
  end if;
  for e in select * from public.employees where company_id=cid and is_active and onboarding_status='complete' and (hire_date is null or hire_date<=p_end) and (contract_end is null or contract_end>=p_start) loop
    select coalesce(jsonb_agg(jsonb_build_object('name',c.name,'kind',c.kind,'amount',ec.amount)),'[]'),coalesce(sum(ec.amount) filter(where c.kind='earning'),0),coalesce(sum(ec.amount) filter(where c.kind='deduction'),0)
      into details,earnings,deductions from public.employee_compensation ec join public.payroll_components c on c.id=ec.component_id and c.company_id=cid and c.is_active
      where ec.employee_id=e.id and ec.company_id=cid and ec.effective_from<=p_end and (ec.effective_until is null or ec.effective_until>=p_start) and (ec.is_recurring or ec.effective_from>=p_start);
    insert into public.payroll_entries(company_id,payroll_period_id,employee_id,base_salary,earnings,deductions,net_pay,detail,employee_snapshot)
      values(cid,pid,e.id,e.base_salary,earnings,deductions,e.base_salary+earnings-deductions,details,jsonb_build_object('full_name',e.full_name,'employee_code',e.employee_code,'department',e.department,'position',e.position,'bank_name',e.bank_name,'bank_account_name',e.bank_account_name,'bank_account_number',e.bank_account_number));
  end loop;
  update public.payroll_periods set total_gross=(select sum(base_salary+earnings) from public.payroll_entries where payroll_period_id=pid),total_deduction=(select sum(deductions) from public.payroll_entries where payroll_period_id=pid),total_net=(select sum(net_pay) from public.payroll_entries where payroll_period_id=pid) where id=pid;
  insert into public.audit_logs(company_id,actor_id,entity_type,entity_id,action) values(cid,auth.uid(),'payroll_periods',pid,'calculate');
  return pid;
end $$;
revoke all on function public.generate_payroll(date,date,date,uuid) from public,anon;
grant execute on function public.generate_payroll(date,date,date,uuid) to authenticated;

create function public.adjust_payroll_entry(p_entry uuid,p_base numeric,p_details jsonb) returns void
language plpgsql security invoker set search_path='' as $$
declare e public.payroll_entries; earning numeric; deduction numeric;
begin
  if auth.uid() is null or not coalesce(private.can_manage_finance(),false) then raise exception 'Akses keuangan diperlukan.'; end if;
  select * into e from public.payroll_entries where id=p_entry and company_id=private.current_company_id();
  if not found then raise exception 'Rincian tidak ditemukan.'; end if;
  perform 1 from public.payroll_periods where id=e.payroll_period_id for update;
  if p_details is null or jsonb_typeof(p_details)<>'array' then raise exception 'Rincian tidak valid.'; end if;
  if exists(select 1 from jsonb_array_elements(p_details) x where coalesce(x->>'name','')='' or coalesce(x->>'kind','') not in ('earning','deduction') or x->>'amount' is null or (x->>'amount')::numeric<0) then raise exception 'Nama, jenis, dan nominal komponen wajib valid.'; end if;
  select coalesce(sum((x->>'amount')::numeric) filter(where x->>'kind'='earning'),0),coalesce(sum((x->>'amount')::numeric) filter(where x->>'kind'='deduction'),0) into earning,deduction from jsonb_array_elements(p_details) x;
  update public.payroll_entries set base_salary=p_base,earnings=earning,deductions=deduction,net_pay=p_base+earning-deduction,detail=p_details where id=p_entry;
  update public.payroll_periods set total_gross=(select sum(base_salary+earnings) from public.payroll_entries where payroll_period_id=e.payroll_period_id),total_deduction=(select sum(deductions) from public.payroll_entries where payroll_period_id=e.payroll_period_id),total_net=(select sum(net_pay) from public.payroll_entries where payroll_period_id=e.payroll_period_id) where id=e.payroll_period_id;
  insert into public.audit_logs(company_id,actor_id,entity_type,entity_id,action) values(e.company_id,auth.uid(),'payroll_entries',p_entry,'adjust');
end $$;
revoke all on function public.adjust_payroll_entry(uuid,numeric,jsonb) from public,anon;
grant execute on function public.adjust_payroll_entry(uuid,numeric,jsonb) to authenticated;

-- Private read helper avoids recursive RLS when an employee opens their released slip.
create function private.can_read_payroll(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.payroll_periods p join public.profiles u on u.id=auth.uid() and u.company_id=p.company_id and u.is_active where p.id=p_id and (u.role in ('owner','hr_admin','finance') or (p.status in ('locked','paid') and exists(select 1 from public.payroll_entries pe join public.employees e on e.id=pe.employee_id where pe.payroll_period_id=p.id and e.profile_id=u.id and e.company_id=p.company_id))));
$$;
revoke all on function private.can_read_payroll(uuid) from public,anon;
grant execute on function private.can_read_payroll(uuid) to authenticated;
alter policy payroll_periods_read on public.payroll_periods using(company_id=private.current_company_id() and private.can_read_payroll(id));
alter policy payroll_entries_read on public.payroll_entries using(company_id=private.current_company_id() and (private.can_manage_finance() or (employee_id=private.my_employee_id() and private.can_read_payroll(payroll_period_id))));
