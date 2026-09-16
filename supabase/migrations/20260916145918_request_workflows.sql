-- Centralize approval transitions so stale or unauthorized UI actions cannot change requests.
create function public.review_request(p_table text,p_id uuid,p_status public.request_status,p_note text default null) returns void
language plpgsql security invoker set search_path='' as $$
declare cid uuid:=private.current_company_id(); allowed boolean; changed integer;
begin
  if auth.uid() is null or p_status not in ('approved','rejected') then raise exception 'Status persetujuan tidak valid.'; end if;
  allowed:=case when p_table in ('leave_requests','overtime_requests') then private.can_manage_hr() when p_table in ('cash_advances','reimbursements') then private.can_manage_finance() else false end;
  if not coalesce(allowed,false) then raise exception 'Anda tidak memiliki akses untuk memproses pengajuan ini.'; end if;
  case p_table
    when 'leave_requests' then update public.leave_requests set status=p_status,reviewer_id=auth.uid(),reviewed_at=now(),reviewer_note=nullif(trim(p_note),'') where id=p_id and company_id=cid and status='submitted';
    when 'overtime_requests' then update public.overtime_requests set status=p_status,reviewer_id=auth.uid(),reviewed_at=now(),reviewer_note=nullif(trim(p_note),'') where id=p_id and company_id=cid and status='submitted';
    when 'cash_advances' then update public.cash_advances set status=p_status,approved_by=auth.uid(),approved_at=now() where id=p_id and company_id=cid and status='submitted';
    when 'reimbursements' then update public.reimbursements set status=p_status,approved_by=auth.uid(),approved_at=now() where id=p_id and company_id=cid and status='submitted';
    else raise exception 'Jenis pengajuan tidak dikenal.';
  end case;
  get diagnostics changed=row_count;
  if changed<>1 then raise exception 'Pengajuan sudah diproses atau tidak ditemukan.'; end if;
  insert into public.audit_logs(company_id,actor_id,entity_type,entity_id,action,payload) values(cid,auth.uid(),p_table,p_id,'review',jsonb_build_object('status',p_status,'note',nullif(trim(p_note),'')));
end $$;
revoke all on function public.review_request(text,uuid,public.request_status,text) from public,anon;
grant execute on function public.review_request(text,uuid,public.request_status,text) to authenticated;

create function public.cancel_request(p_table text,p_id uuid) returns void
language plpgsql security invoker set search_path='' as $$
declare cid uuid:=private.current_company_id(); eid uuid:=private.my_employee_id(); changed integer;
begin
  if auth.uid() is null or eid is null then raise exception 'Akun belum terhubung ke karyawan.'; end if;
  case p_table
    when 'leave_requests' then update public.leave_requests set status='cancelled' where id=p_id and company_id=cid and employee_id=eid and status='submitted';
    when 'overtime_requests' then update public.overtime_requests set status='cancelled' where id=p_id and company_id=cid and employee_id=eid and status='submitted';
    when 'cash_advances' then update public.cash_advances set status='cancelled' where id=p_id and company_id=cid and employee_id=eid and status='submitted';
    when 'reimbursements' then update public.reimbursements set status='cancelled' where id=p_id and company_id=cid and employee_id=eid and status='submitted';
    else raise exception 'Jenis pengajuan tidak dikenal.';
  end case;
  get diagnostics changed=row_count;
  if changed<>1 then raise exception 'Pengajuan sudah diproses atau tidak ditemukan.'; end if;
  insert into public.audit_logs(company_id,actor_id,entity_type,entity_id,action) values(cid,auth.uid(),p_table,p_id,'cancel');
end $$;
revoke all on function public.cancel_request(text,uuid) from public,anon;
grant execute on function public.cancel_request(text,uuid) to authenticated;

-- Self-service cancellation still passes through RLS and only changes submitted rows.
create policy leave_self_cancel on public.leave_requests for update to authenticated using(company_id=private.current_company_id() and employee_id=private.my_employee_id() and status='submitted') with check(company_id=private.current_company_id() and employee_id=private.my_employee_id() and status='cancelled' and reviewer_id is null and reviewed_at is null);
create policy overtime_self_cancel on public.overtime_requests for update to authenticated using(company_id=private.current_company_id() and employee_id=private.my_employee_id() and status='submitted') with check(company_id=private.current_company_id() and employee_id=private.my_employee_id() and status='cancelled' and reviewer_id is null and reviewed_at is null);
create policy cash_self_cancel on public.cash_advances for update to authenticated using(company_id=private.current_company_id() and employee_id=private.my_employee_id() and status='submitted') with check(company_id=private.current_company_id() and employee_id=private.my_employee_id() and status='cancelled' and approved_by is null and approved_at is null);
create policy reimburse_self_cancel on public.reimbursements for update to authenticated using(company_id=private.current_company_id() and employee_id=private.my_employee_id() and status='submitted') with check(company_id=private.current_company_id() and employee_id=private.my_employee_id() and status='cancelled' and approved_by is null and approved_at is null);
