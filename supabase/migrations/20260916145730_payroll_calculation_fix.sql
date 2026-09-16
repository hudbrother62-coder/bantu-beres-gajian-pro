create or replace function public.generate_payroll(p_start date,p_end date,p_payment date,p_period uuid default null) returns uuid
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
  update public.payroll_periods set total_gross=(select sum(pe.base_salary+pe.earnings) from public.payroll_entries pe where pe.payroll_period_id=pid),total_deduction=(select sum(pe.deductions) from public.payroll_entries pe where pe.payroll_period_id=pid),total_net=(select sum(net_pay) from public.payroll_entries where payroll_period_id=pid) where id=pid;
  insert into public.audit_logs(company_id,actor_id,entity_type,entity_id,action) values(cid,auth.uid(),'payroll_periods',pid,'calculate');
  return pid;
end $$;
