create type public.opening_status as enum ('draft', 'open', 'paused', 'closed');
create type public.candidate_status as enum ('new', 'screening', 'interview', 'offer', 'hired', 'rejected');
create type public.cash_entry_kind as enum ('income', 'expense');
create type public.visit_status as enum ('planned', 'in_progress', 'completed', 'cancelled');
create type public.tracking_status as enum ('active', 'paused', 'ended');

create table public.job_openings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  title text not null,
  department text,
  employment_type text,
  headcount integer not null default 1 check (headcount > 0),
  description text,
  status public.opening_status not null default 'draft',
  published_at timestamptz,
  closed_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.candidates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  job_opening_id uuid references public.job_openings(id) on delete set null,
  full_name text not null,
  email text,
  phone text,
  source text,
  status public.candidate_status not null default 'new',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.petty_cash_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  entry_date date not null default current_date,
  kind public.cash_entry_kind not null,
  category text not null,
  description text not null,
  amount numeric(14,2) not null check (amount > 0),
  reference_no text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.client_visits (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  client_name text not null,
  client_address text,
  scheduled_at timestamptz,
  purpose text,
  status public.visit_status not null default 'planned',
  check_in_at timestamptz,
  check_out_at timestamptz,
  check_in_latitude numeric(10,7),
  check_in_longitude numeric(10,7),
  check_out_latitude numeric(10,7),
  check_out_longitude numeric(10,7),
  result_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tracking_sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  client_visit_id uuid references public.client_visits(id) on delete set null,
  task_name text not null,
  status public.tracking_status not null default 'active',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  started_latitude numeric(10,7),
  started_longitude numeric(10,7),
  ended_latitude numeric(10,7),
  ended_longitude numeric(10,7),
  total_distance_meters numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'ended' and ended_at is not null) or status <> 'ended')
);

create table public.location_pings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  tracking_session_id uuid not null references public.tracking_sessions(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  captured_at timestamptz not null default now(),
  latitude numeric(10,7) not null,
  longitude numeric(10,7) not null,
  accuracy_meters numeric(10,2),
  speed_mps numeric(10,2),
  is_mock_suspected boolean not null default false,
  created_at timestamptz not null default now()
);

create index job_openings_company_status_idx on public.job_openings(company_id, status);
create index candidates_company_status_idx on public.candidates(company_id, status, created_at desc);
create index petty_cash_entries_company_date_idx on public.petty_cash_entries(company_id, entry_date desc);
create index client_visits_company_employee_idx on public.client_visits(company_id, employee_id, scheduled_at desc);
create index tracking_sessions_company_status_idx on public.tracking_sessions(company_id, status, started_at desc);
create unique index tracking_one_active_session_per_employee on public.tracking_sessions(employee_id) where status = 'active';
create index location_pings_session_captured_idx on public.location_pings(tracking_session_id, captured_at);
create index location_pings_company_employee_idx on public.location_pings(company_id, employee_id, captured_at desc);

create trigger job_openings_set_updated_at before update on public.job_openings for each row execute function public.set_updated_at();
create trigger candidates_set_updated_at before update on public.candidates for each row execute function public.set_updated_at();
create trigger client_visits_set_updated_at before update on public.client_visits for each row execute function public.set_updated_at();
create trigger tracking_sessions_set_updated_at before update on public.tracking_sessions for each row execute function public.set_updated_at();

create or replace function private.owns_tracking_session(session_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists (
    select 1 from public.tracking_sessions
    where id = session_uuid
      and company_id = private.current_company_id()
      and employee_id = private.my_employee_id()
      and status in ('active', 'paused')
  );
$$;

revoke all on function private.owns_tracking_session(uuid) from public, anon;
grant execute on function private.owns_tracking_session(uuid) to authenticated;

grant select, insert, update, delete on public.job_openings, public.candidates, public.petty_cash_entries, public.client_visits, public.tracking_sessions, public.location_pings to authenticated;

alter table public.job_openings enable row level security;
alter table public.candidates enable row level security;
alter table public.petty_cash_entries enable row level security;
alter table public.client_visits enable row level security;
alter table public.tracking_sessions enable row level security;
alter table public.location_pings enable row level security;

create policy job_openings_read on public.job_openings for select to authenticated using (company_id = (select private.current_company_id()));
create policy job_openings_manage on public.job_openings for all to authenticated using (company_id = (select private.current_company_id()) and (select private.can_manage_hr())) with check (company_id = (select private.current_company_id()) and (select private.can_manage_hr()));
create policy candidates_manage on public.candidates for all to authenticated using (company_id = (select private.current_company_id()) and (select private.can_manage_hr())) with check (company_id = (select private.current_company_id()) and (select private.can_manage_hr()));
create policy petty_cash_manage on public.petty_cash_entries for all to authenticated using (company_id = (select private.current_company_id()) and (select private.can_manage_finance())) with check (company_id = (select private.current_company_id()) and (select private.can_manage_finance()));
create policy visits_read on public.client_visits for select to authenticated using (company_id = (select private.current_company_id()) and ((select private.can_manage_hr()) or employee_id = (select private.my_employee_id())));
create policy visits_manage on public.client_visits for all to authenticated using (company_id = (select private.current_company_id()) and (select private.can_manage_hr())) with check (company_id = (select private.current_company_id()) and (select private.can_manage_hr()));
create policy visits_self_create on public.client_visits for insert to authenticated with check (company_id = (select private.current_company_id()) and employee_id = (select private.my_employee_id()));
create policy visits_self_update on public.client_visits for update to authenticated using (company_id = (select private.current_company_id()) and employee_id = (select private.my_employee_id())) with check (company_id = (select private.current_company_id()) and employee_id = (select private.my_employee_id()));
create policy sessions_read on public.tracking_sessions for select to authenticated using (company_id = (select private.current_company_id()) and ((select private.can_manage_hr()) or employee_id = (select private.my_employee_id())));
create policy sessions_manage on public.tracking_sessions for all to authenticated using (company_id = (select private.current_company_id()) and (select private.can_manage_hr())) with check (company_id = (select private.current_company_id()) and (select private.can_manage_hr()));
create policy sessions_self_create on public.tracking_sessions for insert to authenticated with check (company_id = (select private.current_company_id()) and employee_id = (select private.my_employee_id()));
create policy sessions_self_update on public.tracking_sessions for update to authenticated using (company_id = (select private.current_company_id()) and employee_id = (select private.my_employee_id())) with check (company_id = (select private.current_company_id()) and employee_id = (select private.my_employee_id()));
create policy pings_read on public.location_pings for select to authenticated using (company_id = (select private.current_company_id()) and ((select private.can_manage_hr()) or employee_id = (select private.my_employee_id())));
create policy pings_manage on public.location_pings for all to authenticated using (company_id = (select private.current_company_id()) and (select private.can_manage_hr())) with check (company_id = (select private.current_company_id()) and (select private.can_manage_hr()));
create policy pings_self_create on public.location_pings for insert to authenticated with check (company_id = (select private.current_company_id()) and employee_id = (select private.my_employee_id()) and (select private.owns_tracking_session(tracking_session_id)));
