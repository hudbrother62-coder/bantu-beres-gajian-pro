drop policy if exists leave_supervisor_review on public.leave_requests;
create policy leave_supervisor_review on public.leave_requests
for update to authenticated
using (
  company_id = private.current_company_id()
  and private.current_app_role() = 'supervisor'
  and status = 'submitted'
  and private.is_supervisor_for(employee_id)
)
with check (
  company_id = private.current_company_id()
  and private.current_app_role() = 'supervisor'
  and private.is_supervisor_for(employee_id)
  and status in ('approved','rejected')
  and reviewer_id = auth.uid()
  and reviewed_at is not null
);

drop policy if exists overtime_supervisor_review on public.overtime_requests;
create policy overtime_supervisor_review on public.overtime_requests
for update to authenticated
using (
  company_id = private.current_company_id()
  and private.current_app_role() = 'supervisor'
  and status = 'submitted'
  and private.is_supervisor_for(employee_id)
)
with check (
  company_id = private.current_company_id()
  and private.current_app_role() = 'supervisor'
  and private.is_supervisor_for(employee_id)
  and status in ('approved','rejected')
  and reviewer_id = auth.uid()
  and reviewed_at is not null
);

create or replace function public.review_request(p_table text,p_id uuid,p_status public.request_status,p_note text default null)
returns void
language plpgsql
security invoker
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