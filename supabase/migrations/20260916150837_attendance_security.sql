create function private.guard_employee_attendance() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if coalesce(private.can_manage_hr(),false) then return new; end if;
  if tg_op='INSERT' then
    if new.employee_id<>private.my_employee_id() or new.company_id<>private.current_company_id() or new.attendance_date<>current_date or new.status not in ('present','late') or new.check_in_at is null or new.check_out_at is not null or new.admin_note is not null then
      raise exception 'Presensi mandiri harus menggunakan akun, tanggal, dan waktu check-in saat ini.';
    end if;
  elsif old.employee_id<>new.employee_id or old.company_id<>new.company_id or old.attendance_date<>new.attendance_date or old.status<>new.status or old.check_in_at<>new.check_in_at or old.check_in_latitude is distinct from new.check_in_latitude or old.check_in_longitude is distinct from new.check_in_longitude or old.admin_note is distinct from new.admin_note or old.check_out_at is not null or new.check_out_at is null or new.check_out_at<new.check_in_at then
    raise exception 'Karyawan hanya dapat mencatat check-out satu kali.';
  end if;
  return new;
end $$;
create trigger attendance_employee_guard before insert or update on public.attendance_records for each row execute function private.guard_employee_attendance();

drop policy attendance_self_insert on public.attendance_records;
create policy attendance_self_insert on public.attendance_records for insert to authenticated with check(company_id=private.current_company_id() and employee_id=private.my_employee_id() and attendance_date=current_date and status in ('present','late') and check_in_at is not null and check_out_at is null and admin_note is null);
drop policy attendance_self_update on public.attendance_records;
create policy attendance_self_update on public.attendance_records for update to authenticated using(company_id=private.current_company_id() and employee_id=private.my_employee_id()) with check(company_id=private.current_company_id() and employee_id=private.my_employee_id());
