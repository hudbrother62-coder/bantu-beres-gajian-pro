create policy attendance_self_update on public.attendance_records
for update to authenticated
using (company_id = private.current_company_id() and employee_id = private.my_employee_id())
with check (company_id = private.current_company_id() and employee_id = private.my_employee_id());
