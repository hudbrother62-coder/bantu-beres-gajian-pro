-- Do not expose company-wide period totals to employees.
alter policy payroll_periods_read on public.payroll_periods using(company_id=private.current_company_id() and private.can_manage_finance());
create function private.my_payroll_periods() returns table(id uuid,period_start date,period_end date,payment_date date,status public.payroll_status)
language sql stable security definer set search_path='' as $$
 select distinct p.id,p.period_start,p.period_end,p.payment_date,p.status from public.payroll_periods p
 join public.payroll_entries pe on pe.payroll_period_id=p.id and pe.company_id=p.company_id
 join public.employees e on e.id=pe.employee_id and e.company_id=p.company_id
 join public.profiles u on u.id=e.profile_id and u.company_id=p.company_id
 where auth.uid() is not null and u.id=auth.uid() and u.is_active and e.is_active and p.status in ('locked','paid');
$$;
revoke all on function private.my_payroll_periods() from public,anon;
grant execute on function private.my_payroll_periods() to authenticated;
create function public.my_payroll_periods() returns table(id uuid,period_start date,period_end date,payment_date date,status public.payroll_status)
language sql stable security invoker set search_path='' as $$ select * from private.my_payroll_periods(); $$;
revoke all on function public.my_payroll_periods() from public,anon;
grant execute on function public.my_payroll_periods() to authenticated;
