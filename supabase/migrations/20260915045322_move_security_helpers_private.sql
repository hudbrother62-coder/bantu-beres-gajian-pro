create schema if not exists private;

alter function public.current_company_id() set schema private;
alter function public.current_app_role() set schema private;
alter function public.my_employee_id() set schema private;
alter function public.can_manage_hr() set schema private;
alter function public.can_manage_finance() set schema private;
alter function public.is_owner() set schema private;

create or replace function private.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id from public.profiles where id = (select auth.uid()) and is_active = true limit 1;
$$;

create or replace function private.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = (select auth.uid()) and is_active = true limit 1;
$$;

create or replace function private.my_employee_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.employees where profile_id = (select auth.uid()) and is_active = true limit 1;
$$;

create or replace function private.can_manage_hr()
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select private.current_app_role() in ('owner', 'hr_admin');
$$;

create or replace function private.can_manage_finance()
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select private.current_app_role() in ('owner', 'hr_admin', 'finance');
$$;

create or replace function private.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select private.current_app_role() = 'owner';
$$;

revoke all on all functions in schema private from public, anon;
grant usage on schema private to authenticated;
grant execute on all functions in schema private to authenticated;
