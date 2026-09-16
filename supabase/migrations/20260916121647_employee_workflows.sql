-- Keep existing employee IDs and payroll history. Drafts are never payroll eligible.
alter table public.employees
  add column onboarding_status text not null default 'complete' check (onboarding_status in ('draft','complete')),
  add column personal_data jsonb not null default '{}' check (jsonb_typeof(personal_data)='object'),
  add column payroll_data jsonb not null default '{}' check (jsonb_typeof(payroll_data)='object'),
  add column rank_name text,
  add column placement text,
  add column contract_end date,
  add column location_id uuid references public.company_locations(id),
  add constraint employee_contract_dates check (contract_end is null or hire_date is null or contract_end >= hire_date);

create table public.hr_master_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  kind text not null check(kind in ('organization','position','rank')),
  name text not null check(length(trim(name))>0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(company_id,kind,name)
);
alter table public.hr_master_items enable row level security;
grant select,insert,update on public.hr_master_items to authenticated;
create policy hr_master_read on public.hr_master_items for select to authenticated using(company_id=(select private.current_company_id()));
create policy hr_master_manage on public.hr_master_items for all to authenticated using(company_id=(select private.current_company_id()) and (select private.can_manage_hr())) with check(company_id=(select private.current_company_id()) and (select private.can_manage_hr()));

create or replace function private.validate_employee_links() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if new.profile_id is not null and not exists(select 1 from public.profiles p where p.id=new.profile_id and p.company_id=new.company_id and p.is_active) then
    raise exception 'Akun tim tidak aktif atau berasal dari perusahaan lain.';
  end if;
  if new.location_id is not null and not exists(select 1 from public.company_locations l where l.id=new.location_id and l.company_id=new.company_id) then
    raise exception 'Lokasi kantor tidak valid.';
  end if;
  if new.onboarding_status='draft' and new.is_active then raise exception 'Draft karyawan belum boleh diaktifkan.'; end if;
  return new;
end $$;
create trigger employees_validate_links before insert or update on public.employees for each row execute function private.validate_employee_links();

-- One transaction saves the employee and schedule assignment together.
create function public.save_employee(p_data jsonb,p_id uuid default null,p_expected_updated_at timestamptz default null) returns uuid
language plpgsql security invoker set search_path='' as $$
declare e public.employees; cid uuid := private.current_company_id(); sid uuid := nullif(p_data->>'schedule_id','')::uuid; previous public.employees;
begin
  if auth.uid() is null or not coalesce(private.can_manage_hr(),false) then raise exception 'Akses HR diperlukan.'; end if;
  if p_id is not null then
    select * into previous from public.employees where id=p_id and company_id=cid for update;
    if not found then raise exception 'Karyawan tidak ditemukan.'; end if;
    if p_expected_updated_at is null or previous.updated_at<>p_expected_updated_at then raise exception 'Data berubah. Tutup formulir dan muat ulang sebelum menyimpan.'; end if;
  end if;
  e:=jsonb_populate_record(null::public.employees,p_data);
  e.id:=coalesce(p_id,gen_random_uuid()); e.company_id:=cid;
  e.employee_code:=trim(e.employee_code); e.full_name:=trim(e.full_name);
  e.onboarding_status:=coalesce(e.onboarding_status,'draft'); e.is_active:=coalesce(e.is_active,false);
  e.personal_data:=coalesce(e.personal_data,'{}'); e.payroll_data:=coalesce(e.payroll_data,'{}'); e.base_salary:=coalesce(e.base_salary,0);
  if coalesce(e.employee_code,'')='' or coalesce(e.full_name,'')='' then raise exception 'Kode dan nama karyawan wajib diisi.'; end if;
  if sid is not null and not exists(select 1 from public.work_schedules where id=sid and company_id=cid) then raise exception 'Jadwal tidak valid.'; end if;
  if e.onboarding_status='complete' and (e.hire_date is null or coalesce(e.department,'')='' or coalesce(e.position,'')='' or coalesce(e.employment_type,'')='' or sid is null) then
    raise exception 'Lengkapi tanggal bergabung, organisasi, jabatan, status kerja, dan jadwal.';
  end if;
  insert into public.employees(id,company_id,profile_id,employee_code,full_name,email,phone,department,position,employment_type,hire_date,base_salary,bank_name,bank_account_name,bank_account_number,is_active,onboarding_status,personal_data,payroll_data,rank_name,placement,contract_end,location_id)
  values(e.id,cid,e.profile_id,e.employee_code,e.full_name,e.email,e.phone,e.department,e.position,e.employment_type,e.hire_date,e.base_salary,e.bank_name,e.bank_account_name,e.bank_account_number,e.is_active,e.onboarding_status,e.personal_data,e.payroll_data,e.rank_name,e.placement,e.contract_end,e.location_id)
  on conflict(id) do update set profile_id=excluded.profile_id,employee_code=excluded.employee_code,full_name=excluded.full_name,email=excluded.email,phone=excluded.phone,department=excluded.department,position=excluded.position,employment_type=excluded.employment_type,hire_date=excluded.hire_date,base_salary=excluded.base_salary,bank_name=excluded.bank_name,bank_account_name=excluded.bank_account_name,bank_account_number=excluded.bank_account_number,is_active=excluded.is_active,onboarding_status=excluded.onboarding_status,personal_data=excluded.personal_data,payroll_data=excluded.payroll_data,rank_name=excluded.rank_name,placement=excluded.placement,contract_end=excluded.contract_end,location_id=excluded.location_id;
  if sid is not null then
    insert into public.employee_schedules(employee_id,company_id,schedule_id,effective_from) values(e.id,cid,sid,coalesce(e.hire_date,current_date))
    on conflict(employee_id) do update set schedule_id=excluded.schedule_id,effective_from=excluded.effective_from;
  else delete from public.employee_schedules where employee_id=e.id and company_id=cid;
  end if;
  insert into public.audit_logs(company_id,actor_id,entity_type,entity_id,action,payload) values(cid,auth.uid(),'employees',e.id,case when p_id is null then 'create' else 'update' end,jsonb_build_object('onboarding_status',e.onboarding_status,'is_active',e.is_active));
  return e.id;
end $$;
revoke all on function public.save_employee(jsonb,uuid,timestamptz) from public,anon;
grant execute on function public.save_employee(jsonb,uuid,timestamptz) to authenticated;

-- Employees submit requests; approval fields cannot be supplied through self-service.
alter policy leave_self_create on public.leave_requests with check(company_id=private.current_company_id() and employee_id=private.my_employee_id() and status='submitted' and reviewer_id is null and reviewed_at is null);
alter policy overtime_self_create on public.overtime_requests with check(company_id=private.current_company_id() and employee_id=private.my_employee_id() and status='submitted' and reviewer_id is null and reviewed_at is null);
alter policy cash_advances_self_create on public.cash_advances with check(company_id=private.current_company_id() and employee_id=private.my_employee_id() and status='submitted' and approved_by is null and approved_at is null and remaining_amount=amount);
alter policy reimbursements_self_create on public.reimbursements with check(company_id=private.current_company_id() and employee_id=private.my_employee_id() and status='submitted' and approved_by is null and approved_at is null);
