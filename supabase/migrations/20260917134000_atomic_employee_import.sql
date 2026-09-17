create or replace function public.import_employees_batch(p_rows jsonb)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  cid uuid := private.current_company_id();
  item jsonb;
  emp_id uuid;
  supervisor_id uuid;
  imported_count integer := 0;
  row_no text;
  employee_name text;
begin
  if auth.uid() is null or not coalesce(private.can_manage_hr(), false) then
    raise exception 'Akses HR diperlukan.';
  end if;
  if cid is null then raise exception 'Workspace tidak aktif.'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows)=0 then
    raise exception 'Tidak ada data import.';
  end if;
  if jsonb_array_length(p_rows) > 500 then
    raise exception 'Maksimal 500 karyawan per sekali import.';
  end if;

  for item in select value from jsonb_array_elements(p_rows)
  loop
    row_no := coalesce(item->>'row','?');
    employee_name := coalesce(item->>'name','Karyawan');
    begin
      emp_id := public.save_employee(item->'payload', null, null);
      supervisor_id := nullif(item->>'supervisor_profile_id','')::uuid;
      if supervisor_id is not null then
        if not exists(
          select 1 from public.profiles
          where id=supervisor_id and company_id=cid and role='supervisor' and is_active=true
        ) then
          raise exception 'Atasan tidak valid atau sudah nonaktif.';
        end if;
        update public.employees
        set supervisor_profile_id=supervisor_id
        where id=emp_id and company_id=cid;
      end if;
      imported_count := imported_count + 1;
    exception when others then
      raise exception 'Baris % (%): %', row_no, employee_name, sqlerrm;
    end;
  end loop;

  return jsonb_build_object('ok',true,'imported',imported_count);
end
$function$;

grant execute on function public.import_employees_batch(jsonb) to authenticated;
