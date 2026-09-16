alter table public.employees
  add column if not exists supervisor_profile_id uuid references public.profiles(id) on delete set null;

create index if not exists employees_supervisor_profile_id_idx on public.employees(supervisor_profile_id) where supervisor_profile_id is not null;

create or replace function private.is_supervisor_for(p_employee uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1
    from public.employees e
    join public.profiles p on p.id = auth.uid()
    where e.id = p_employee
      and e.company_id = p.company_id
      and e.supervisor_profile_id = p.id
      and p.role = 'supervisor'
      and p.is_active = true
      and e.is_active = true
  );
$$;
revoke all on function private.is_supervisor_for(uuid) from public,anon;
grant execute on function private.is_supervisor_for(uuid) to authenticated;

create or replace function private.validate_supervisor_assignment()
returns trigger
language plpgsql
security invoker
set search_path=''
as $$
begin
  if new.supervisor_profile_id is not null then
    if new.profile_id = new.supervisor_profile_id then
      raise exception 'Karyawan tidak dapat menjadi atasan langsung dirinya sendiri.';
    end if;
    if not exists(
      select 1 from public.profiles p
      where p.id = new.supervisor_profile_id
        and p.company_id = new.company_id
        and p.role = 'supervisor'
        and p.is_active = true
    ) then
      raise exception 'Atasan langsung harus berupa akun Atasan aktif dari perusahaan yang sama.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists employees_validate_supervisor on public.employees;
create trigger employees_validate_supervisor
before insert or update of supervisor_profile_id,profile_id,company_id on public.employees
for each row execute function private.validate_supervisor_assignment();

alter policy employees_read on public.employees
  using (company_id = private.current_company_id() and (private.can_manage_finance() or id = private.my_employee_id() or private.is_supervisor_for(id)));

alter policy attendance_read on public.attendance_records
  using (company_id = private.current_company_id() and (private.can_manage_hr() or employee_id = private.my_employee_id() or private.is_supervisor_for(employee_id)));

alter policy leave_read on public.leave_requests
  using (company_id = private.current_company_id() and (private.can_manage_hr() or employee_id = private.my_employee_id() or private.is_supervisor_for(employee_id)));

alter policy overtime_read on public.overtime_requests
  using (company_id = private.current_company_id() and (private.can_manage_hr() or employee_id = private.my_employee_id() or private.is_supervisor_for(employee_id)));

create or replace function public.review_request(p_table text,p_id uuid,p_status public.request_status,p_note text default null)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  cid uuid := private.current_company_id();
  role public.app_role := private.current_app_role();
  allowed boolean := false;
  target_employee uuid;
  changed integer;
begin
  if auth.uid() is null or cid is null or p_status not in ('approved','rejected') then
    raise exception 'Status persetujuan tidak valid.';
  end if;

  case p_table
    when 'leave_requests' then
      select employee_id into target_employee from public.leave_requests where id=p_id and company_id=cid and status='submitted';
      allowed := private.can_manage_hr() or (role='supervisor' and target_employee is not null and private.is_supervisor_for(target_employee));
    when 'overtime_requests' then
      select employee_id into target_employee from public.overtime_requests where id=p_id and company_id=cid and status='submitted';
      allowed := private.can_manage_hr() or (role='supervisor' and target_employee is not null and private.is_supervisor_for(target_employee));
    when 'cash_advances' then
      allowed := private.can_manage_finance();
    when 'reimbursements' then
      allowed := private.can_manage_finance();
    else
      raise exception 'Jenis pengajuan tidak dikenal.';
  end case;

  if not coalesce(allowed,false) then
    raise exception 'Anda tidak memiliki akses untuk memproses pengajuan ini.';
  end if;

  case p_table
    when 'leave_requests' then
      update public.leave_requests set status=p_status,reviewer_id=auth.uid(),reviewed_at=now(),reviewer_note=nullif(trim(p_note),'') where id=p_id and company_id=cid and status='submitted';
    when 'overtime_requests' then
      update public.overtime_requests set status=p_status,reviewer_id=auth.uid(),reviewed_at=now(),reviewer_note=nullif(trim(p_note),'') where id=p_id and company_id=cid and status='submitted';
    when 'cash_advances' then
      update public.cash_advances set status=p_status,approved_by=auth.uid(),approved_at=now() where id=p_id and company_id=cid and status='submitted';
    when 'reimbursements' then
      update public.reimbursements set status=p_status,approved_by=auth.uid(),approved_at=now() where id=p_id and company_id=cid and status='submitted';
  end case;

  get diagnostics changed=row_count;
  if changed<>1 then raise exception 'Pengajuan sudah diproses atau tidak ditemukan.'; end if;

  insert into public.audit_logs(company_id,actor_id,entity_type,entity_id,action,payload)
  values(cid,auth.uid(),p_table,p_id,'review',jsonb_build_object('status',p_status,'note',nullif(trim(p_note),'')));
end;
$$;
revoke all on function public.review_request(text,uuid,public.request_status,text) from public,anon;
grant execute on function public.review_request(text,uuid,public.request_status,text) to authenticated;