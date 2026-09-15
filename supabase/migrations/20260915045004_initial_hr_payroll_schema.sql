create extension if not exists pgcrypto;

create type public.app_role as enum ('owner', 'hr_admin', 'finance', 'supervisor', 'employee');
create type public.attendance_status as enum ('present', 'late', 'absent', 'leave', 'sick', 'holiday');
create type public.request_status as enum ('draft', 'submitted', 'approved', 'rejected', 'cancelled');
create type public.payroll_status as enum ('draft', 'review', 'approved', 'locked', 'paid');
create type public.component_kind as enum ('earning', 'deduction');

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  address text,
  phone text,
  payroll_day smallint check (payroll_day between 1 and 31) default 25,
  timezone text not null default 'Asia/Jakarta',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  full_name text not null,
  username text not null unique,
  role public.app_role not null default 'employee',
  job_title text,
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  profile_id uuid unique references public.profiles(id) on delete set null,
  employee_code text not null,
  full_name text not null,
  email text,
  phone text,
  department text,
  position text,
  employment_type text not null default 'Tetap',
  hire_date date,
  base_salary numeric(14,2) not null default 0 check (base_salary >= 0),
  bank_name text,
  bank_account_name text,
  bank_account_number text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, employee_code)
);

create table public.company_locations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  address text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  radius_meters integer not null default 100 check (radius_meters between 25 and 5000),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.work_schedules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  work_days smallint[] not null default array[1,2,3,4,5],
  start_time time not null,
  end_time time not null,
  grace_minutes integer not null default 0 check (grace_minutes between 0 and 180),
  created_at timestamptz not null default now()
);

create table public.employee_schedules (
  employee_id uuid primary key references public.employees(id) on delete cascade,
  schedule_id uuid not null references public.work_schedules(id) on delete restrict,
  company_id uuid not null references public.companies(id) on delete cascade,
  effective_from date not null default current_date
);

create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  attendance_date date not null,
  status public.attendance_status not null default 'present',
  check_in_at timestamptz,
  check_out_at timestamptz,
  check_in_latitude numeric(10,7),
  check_in_longitude numeric(10,7),
  check_out_latitude numeric(10,7),
  check_out_longitude numeric(10,7),
  location_note text,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, attendance_date)
);

create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  request_type text not null,
  start_date date not null,
  end_date date not null,
  reason text,
  status public.request_status not null default 'submitted',
  reviewer_id uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  reviewer_note text,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create table public.overtime_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  overtime_date date not null,
  start_time time not null,
  end_time time not null,
  reason text,
  status public.request_status not null default 'submitted',
  reviewer_id uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  reviewer_note text,
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);

create table public.cash_advances (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  request_date date not null default current_date,
  amount numeric(14,2) not null check (amount > 0),
  installment_amount numeric(14,2) check (installment_amount > 0),
  remaining_amount numeric(14,2) not null check (remaining_amount >= 0),
  reason text,
  status public.request_status not null default 'submitted',
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.reimbursements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  expense_date date not null,
  amount numeric(14,2) not null check (amount > 0),
  description text not null,
  receipt_url text,
  status public.request_status not null default 'submitted',
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.payroll_components (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  kind public.component_kind not null,
  is_taxable boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (company_id, name)
);

create table public.employee_compensation (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  component_id uuid not null references public.payroll_components(id) on delete cascade,
  amount numeric(14,2) not null check (amount >= 0),
  is_recurring boolean not null default true,
  effective_from date not null default current_date,
  effective_until date,
  created_at timestamptz not null default now(),
  check (effective_until is null or effective_until >= effective_from)
);

create table public.payroll_periods (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  payment_date date,
  status public.payroll_status not null default 'draft',
  total_gross numeric(14,2) not null default 0,
  total_deduction numeric(14,2) not null default 0,
  total_net numeric(14,2) not null default 0,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, period_start, period_end),
  check (period_end >= period_start)
);

create table public.payroll_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  payroll_period_id uuid not null references public.payroll_periods(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  base_salary numeric(14,2) not null default 0,
  earnings numeric(14,2) not null default 0,
  deductions numeric(14,2) not null default 0,
  net_pay numeric(14,2) not null default 0,
  detail jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (payroll_period_id, employee_id)
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index employees_company_id_idx on public.employees(company_id);
create index attendance_company_date_idx on public.attendance_records(company_id, attendance_date desc);
create index leave_requests_company_status_idx on public.leave_requests(company_id, status);
create index overtime_requests_company_status_idx on public.overtime_requests(company_id, status);
create index payroll_periods_company_period_idx on public.payroll_periods(company_id, period_end desc);
create index payroll_entries_company_id_idx on public.payroll_entries(company_id);
create index audit_logs_company_id_idx on public.audit_logs(company_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger companies_set_updated_at before update on public.companies for each row execute function public.set_updated_at();
create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger employees_set_updated_at before update on public.employees for each row execute function public.set_updated_at();
create trigger attendance_set_updated_at before update on public.attendance_records for each row execute function public.set_updated_at();
create trigger payroll_periods_set_updated_at before update on public.payroll_periods for each row execute function public.set_updated_at();
create trigger payroll_entries_set_updated_at before update on public.payroll_entries for each row execute function public.set_updated_at();

create or replace function public.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id from public.profiles where id = (select auth.uid()) and is_active = true limit 1;
$$;

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = (select auth.uid()) and is_active = true limit 1;
$$;

create or replace function public.my_employee_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.employees where profile_id = (select auth.uid()) and is_active = true limit 1;
$$;

create or replace function public.can_manage_hr()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_app_role() in ('owner', 'hr_admin');
$$;

create or replace function public.can_manage_finance()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_app_role() in ('owner', 'hr_admin', 'finance');
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_app_role() = 'owner';
$$;

revoke all on function public.current_company_id() from public;
revoke all on function public.current_app_role() from public;
revoke all on function public.my_employee_id() from public;
revoke all on function public.can_manage_hr() from public;
revoke all on function public.can_manage_finance() from public;
revoke all on function public.is_owner() from public;
grant execute on function public.current_company_id(), public.current_app_role(), public.my_employee_id(), public.can_manage_hr(), public.can_manage_finance(), public.is_owner() to authenticated;

alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.employees enable row level security;
alter table public.company_locations enable row level security;
alter table public.work_schedules enable row level security;
alter table public.employee_schedules enable row level security;
alter table public.attendance_records enable row level security;
alter table public.leave_requests enable row level security;
alter table public.overtime_requests enable row level security;
alter table public.cash_advances enable row level security;
alter table public.reimbursements enable row level security;
alter table public.payroll_components enable row level security;
alter table public.employee_compensation enable row level security;
alter table public.payroll_periods enable row level security;
alter table public.payroll_entries enable row level security;
alter table public.audit_logs enable row level security;

create policy companies_select on public.companies for select to authenticated using (id = public.current_company_id());
create policy companies_update on public.companies for update to authenticated using (id = public.current_company_id() and public.is_owner()) with check (id = public.current_company_id() and public.is_owner());
create policy profiles_select on public.profiles for select to authenticated using (company_id = public.current_company_id());
create policy profiles_owner_manage on public.profiles for all to authenticated using (company_id = public.current_company_id() and public.is_owner()) with check (company_id = public.current_company_id() and public.is_owner());

create policy employees_read on public.employees for select to authenticated using (company_id = public.current_company_id() and (public.can_manage_finance() or id = public.my_employee_id()));
create policy employees_manage on public.employees for all to authenticated using (company_id = public.current_company_id() and public.can_manage_hr()) with check (company_id = public.current_company_id() and public.can_manage_hr());

create policy locations_read on public.company_locations for select to authenticated using (company_id = public.current_company_id());
create policy locations_manage on public.company_locations for all to authenticated using (company_id = public.current_company_id() and public.can_manage_hr()) with check (company_id = public.current_company_id() and public.can_manage_hr());
create policy schedules_read on public.work_schedules for select to authenticated using (company_id = public.current_company_id());
create policy schedules_manage on public.work_schedules for all to authenticated using (company_id = public.current_company_id() and public.can_manage_hr()) with check (company_id = public.current_company_id() and public.can_manage_hr());
create policy employee_schedules_read on public.employee_schedules for select to authenticated using (company_id = public.current_company_id());
create policy employee_schedules_manage on public.employee_schedules for all to authenticated using (company_id = public.current_company_id() and public.can_manage_hr()) with check (company_id = public.current_company_id() and public.can_manage_hr());

create policy attendance_read on public.attendance_records for select to authenticated using (company_id = public.current_company_id() and (public.can_manage_hr() or employee_id = public.my_employee_id()));
create policy attendance_self_insert on public.attendance_records for insert to authenticated with check (company_id = public.current_company_id() and employee_id = public.my_employee_id());
create policy attendance_manage on public.attendance_records for all to authenticated using (company_id = public.current_company_id() and public.can_manage_hr()) with check (company_id = public.current_company_id() and public.can_manage_hr());

create policy leave_read on public.leave_requests for select to authenticated using (company_id = public.current_company_id() and (public.can_manage_hr() or employee_id = public.my_employee_id()));
create policy leave_self_create on public.leave_requests for insert to authenticated with check (company_id = public.current_company_id() and employee_id = public.my_employee_id());
create policy leave_manage on public.leave_requests for all to authenticated using (company_id = public.current_company_id() and public.can_manage_hr()) with check (company_id = public.current_company_id() and public.can_manage_hr());
create policy overtime_read on public.overtime_requests for select to authenticated using (company_id = public.current_company_id() and (public.can_manage_hr() or employee_id = public.my_employee_id()));
create policy overtime_self_create on public.overtime_requests for insert to authenticated with check (company_id = public.current_company_id() and employee_id = public.my_employee_id());
create policy overtime_manage on public.overtime_requests for all to authenticated using (company_id = public.current_company_id() and public.can_manage_hr()) with check (company_id = public.current_company_id() and public.can_manage_hr());

create policy cash_advances_read on public.cash_advances for select to authenticated using (company_id = public.current_company_id() and (public.can_manage_finance() or employee_id = public.my_employee_id()));
create policy cash_advances_self_create on public.cash_advances for insert to authenticated with check (company_id = public.current_company_id() and employee_id = public.my_employee_id());
create policy cash_advances_manage on public.cash_advances for all to authenticated using (company_id = public.current_company_id() and public.can_manage_finance()) with check (company_id = public.current_company_id() and public.can_manage_finance());
create policy reimbursements_read on public.reimbursements for select to authenticated using (company_id = public.current_company_id() and (public.can_manage_finance() or employee_id = public.my_employee_id()));
create policy reimbursements_self_create on public.reimbursements for insert to authenticated with check (company_id = public.current_company_id() and employee_id = public.my_employee_id());
create policy reimbursements_manage on public.reimbursements for all to authenticated using (company_id = public.current_company_id() and public.can_manage_finance()) with check (company_id = public.current_company_id() and public.can_manage_finance());

create policy components_read on public.payroll_components for select to authenticated using (company_id = public.current_company_id() and public.can_manage_finance());
create policy components_manage on public.payroll_components for all to authenticated using (company_id = public.current_company_id() and public.can_manage_finance()) with check (company_id = public.current_company_id() and public.can_manage_finance());
create policy compensation_read on public.employee_compensation for select to authenticated using (company_id = public.current_company_id() and public.can_manage_finance());
create policy compensation_manage on public.employee_compensation for all to authenticated using (company_id = public.current_company_id() and public.can_manage_finance()) with check (company_id = public.current_company_id() and public.can_manage_finance());
create policy payroll_periods_read on public.payroll_periods for select to authenticated using (company_id = public.current_company_id() and public.can_manage_finance());
create policy payroll_periods_manage on public.payroll_periods for all to authenticated using (company_id = public.current_company_id() and public.can_manage_finance()) with check (company_id = public.current_company_id() and public.can_manage_finance());
create policy payroll_entries_read on public.payroll_entries for select to authenticated using (company_id = public.current_company_id() and (public.can_manage_finance() or employee_id = public.my_employee_id()));
create policy payroll_entries_manage on public.payroll_entries for all to authenticated using (company_id = public.current_company_id() and public.can_manage_finance()) with check (company_id = public.current_company_id() and public.can_manage_finance());
create policy audit_logs_owner_read on public.audit_logs for select to authenticated using (company_id = public.current_company_id() and public.is_owner());
create policy audit_logs_insert on public.audit_logs for insert to authenticated with check (company_id = public.current_company_id());
