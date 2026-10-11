-- Run after 202610100001_camera_preparation.sql. Safe to rerun this file.
-- Additive upgrade: no existing booking rows, prices, dates or checkboxes change.
-- Existing unresolved next-day handovers are kept; future saves validate them.
begin;
alter table public.bookings add column if not exists return_appointment_time time without time zone;

-- An earlier run may already have added the column. Preserve its values and
-- check the type instead of silently converting or replacing existing data.
do $$
begin
  if exists (
    select 1 from pg_attribute where attrelid='public.bookings'::regclass
      and attname='return_appointment_time' and not attisdropped
      and atttypid <> 'time without time zone'::regtype
  ) then
    raise exception 'return_appointment_time must be time without time zone; existing data was not changed';
  end if;
  if not exists (
    select 1 from pg_constraint where conrelid='public.bookings'::regclass
      and conname='bookings_return_appointment_time_check'
  ) then
    alter table public.bookings add constraint bookings_return_appointment_time_check
      check (return_appointment_time < time '24:00' and extract(second from return_appointment_time)=0);
  end if;
end $$;

-- Thailand local wall-clock intervals. The upper endpoint is exclusive, so
-- return at 11:00 permits the next pickup at 11:00. Unknown times reserve the
-- whole return day. EMS/custom buffered deliveries keep their original dates.
create or replace function public.booking_occupied_interval(
  start_day date, end_day date, before_days integer, after_days integer,
  delivery_label text, appointment time without time zone, return_appointment time without time zone
) returns tsrange language sql immutable set search_path = public, pg_temp as $$
  select case when before_days=0 and after_days=0 and delivery_label ~* '(นัดรับ|แมส|เเมส|messenger|pickup)'
    then tsrange(start_day+coalesce(appointment,time '00:00'),
      case when return_appointment is null then (end_day+2)::timestamp
        else (end_day+1)+return_appointment end, '[)')
    else tsrange((start_day-before_days)::timestamp,(end_day+after_days+1)::timestamp,'[)') end;
$$;
revoke all on function public.booking_occupied_interval(date,date,integer,integer,text,time,time) from public, anon;
grant execute on function public.booking_occupied_interval(date,date,integer,integer,text,time,time) to authenticated;

create or replace function public.save_booking(payload jsonb) returns uuid
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare
  target_id uuid := nullif(payload->>'id','')::uuid;
  previous public.bookings%rowtype;
  delivery public.delivery_methods%rowtype;
  old_items jsonb := '[]'::jsonb;
  old_gadgets uuid[] := array[]::uuid[];
  item jsonb;
  camera record;
  old_item jsonb;
  start_day date := (payload->>'start_date')::date;
  end_day date := (payload->>'end_date')::date;
  method_id uuid := (payload->>'delivery_method_id')::uuid;
  state text := payload->>'status';
  before_days integer;
  after_days integer;
  delivery_label text;
  address_required boolean;
  appointment time without time zone;
  return_appointment time without time zone;
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
  if jsonb_typeof(payload->'cameras') is distinct from 'array'
     or jsonb_array_length(payload->'cameras') < 1 then raise exception 'CAMERAS_REQUIRED'; end if;
  if jsonb_typeof(payload->'gadgets') is distinct from 'array' then raise exception 'INVALID_GADGETS'; end if;
  if (select count(*) <> count(distinct value->>'unit_id') from jsonb_array_elements(payload->'cameras')) then
    raise exception 'DUPLICATE_CAMERA';
  end if;
  if target_id is not null then
    select * into previous from public.bookings where id=target_id for update;
    if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
    if (payload->>'expected_version')::integer is distinct from previous.version then
      raise exception 'STALE_VERSION' using errcode='40001';
    end if;
    select coalesce(jsonb_agg(to_jsonb(bc)), '[]'::jsonb) into old_items from public.booking_cameras bc where booking_id=target_id;
    select coalesce(array_agg(gadget_id),array[]::uuid[]) into old_gadgets from public.booking_gadgets where booking_id=target_id;
  end if;
  select * into delivery from public.delivery_methods where id=method_id;
  if not found then raise exception 'INVALID_DELIVERY'; end if;
  if target_id is not null and method_id=previous.delivery_method_id then
    before_days := previous.days_before; after_days := previous.days_after;
    delivery_label := previous.delivery_name; address_required := previous.requires_address;
  else
    if not delivery.active then raise exception 'INACTIVE_DELIVERY'; end if;
    before_days := delivery.days_before; after_days := delivery.days_after;
    delivery_label := delivery.name; address_required := delivery.requires_address;
  end if;
  if payload ? 'appointment_time' then
    if nullif(payload->>'appointment_time','') is not null
       and (payload->>'appointment_time') !~ '^([01][0-9]|2[0-3]):[0-5][0-9](:00)?$' then
      raise exception 'INVALID_APPOINTMENT_TIME';
    end if;
    appointment := nullif(payload->>'appointment_time','')::time;
  else
    appointment := previous.appointment_time;
  end if;
  if upper(trim(delivery_label)) = 'EMS' then appointment := null; end if;
  if payload ? 'return_appointment_time' then
    if nullif(payload->>'return_appointment_time','') is not null
       and (payload->>'return_appointment_time') !~ '^([01][0-9]|2[0-3]):[0-5][0-9](:00)?$' then
      raise exception 'INVALID_RETURN_APPOINTMENT_TIME';
    end if;
    return_appointment := nullif(payload->>'return_appointment_time','')::time;
  else
    return_appointment := previous.return_appointment_time;
  end if;
  if not (before_days=0 and after_days=0 and delivery_label ~* '(นัดรับ|แมส|เเมส|messenger|pickup)') then
    return_appointment := null;
  end if;
  -- All booking writers use this RPC. Lock every selected physical camera in
  -- stable order BEFORE checking availability. A concurrent writer waits, then
  -- the following statements see its committed bookings (READ COMMITTED).
  perform u.id from public.camera_units u
    where u.id in (select (value->>'unit_id')::uuid from jsonb_array_elements(payload->'cameras'))
    order by u.id for update;
  if state <> 'cancelled' and exists (
    select 1 from public.booking_cameras bc join public.bookings b on b.id=bc.booking_id
    where bc.unit_id in (select (value->>'unit_id')::uuid from jsonb_array_elements(payload->'cameras'))
      and not bc.cancelled and b.status <> 'cancelled'
      and (target_id is null or b.id <> target_id)
      and (
        public.booking_occupied_interval(start_day,end_day,before_days,after_days,delivery_label,appointment,return_appointment)
          && public.booking_occupied_interval(b.start_date,b.end_date,b.days_before,b.days_after,b.delivery_name,b.appointment_time,b.return_appointment_time)
        or (before_days=0 and after_days=0 and b.days_before=0 and b.days_after=0
          and delivery_label ~* '(นัดรับ|แมส|เเมส|messenger|pickup)'
          and b.delivery_name ~* '(นัดรับ|แมส|เเมส|messenger|pickup)'
          and ((end_day+1=b.start_date and (return_appointment is null or b.appointment_time is null))
            or (b.end_date+1=start_day and (b.return_appointment_time is null or appointment is null))))
      )
  ) then
    raise exception 'CAMERA_RETURN_OVERLAP' using errcode='23P01';
  end if;
  if target_id is null then
    insert into public.bookings(customer_name,phone,address,notes,start_date,end_date,delivery_method_id,delivery_name,
      days_before,days_after,requires_address,status,created_by,updated_by,appointment_time,return_appointment_time)
    values(trim(payload->>'customer_name'),trim(payload->>'phone'),coalesce(payload->>'address',''),coalesce(payload->>'notes',''),
      start_day,end_day,method_id,delivery_label,before_days,after_days,address_required,state,auth.uid(),auth.uid(),appointment,return_appointment)
    returning id into target_id;
  else
    update public.bookings set customer_name=trim(payload->>'customer_name'), phone=trim(payload->>'phone'),
      address=coalesce(payload->>'address',''), notes=coalesce(payload->>'notes',''), start_date=start_day,end_date=end_day,
      delivery_method_id=method_id,delivery_name=delivery_label,days_before=before_days,days_after=after_days,
      requires_address=address_required,appointment_time=appointment,return_appointment_time=return_appointment,status=state,version=version+1,updated_by=auth.uid(),updated_at=now()
    where id=target_id;
    delete from public.booking_cameras where booking_id=target_id;
    delete from public.booking_gadgets where booking_id=target_id;
  end if;
  -- Consistent order reduces deadlocks when concurrent bookings select many units.
  for item in select value from jsonb_array_elements(payload->'cameras') order by value->>'unit_id' loop
    select u.*,m.name as model_name,m.active as model_active into camera
      from public.camera_units u join public.camera_models m on m.id=u.model_id where u.id=(item->>'unit_id')::uuid;
    if not found then raise exception 'INVALID_CAMERA'; end if;
    select value into old_item from jsonb_array_elements(old_items) where value->>'unit_id'=item->>'unit_id';
    if (not camera.active or not camera.model_active) and old_item is null then raise exception 'INACTIVE_CAMERA'; end if;
    insert into public.booking_cameras(id,preparation_completed,booking_id,unit_id,model_id,model_name,unit_code,unit_number,color,price,blocked_start,blocked_end,cancelled)
    values(coalesce((old_item->>'id')::uuid,gen_random_uuid()),coalesce((old_item->>'preparation_completed')::boolean,false),target_id,camera.id,coalesce((old_item->>'model_id')::uuid,camera.model_id),coalesce(old_item->>'model_name',camera.model_name),
      coalesce(old_item->>'unit_code',camera.code),coalesce(old_item->>'unit_number',camera.number),coalesce(old_item->>'color',camera.color),
      (item->>'price')::numeric,start_day-before_days,end_day+after_days,state='cancelled');
  end loop;
  for item in select value from jsonb_array_elements(payload->'gadgets') loop
    if not exists(select 1 from public.gadgets where id=(item->>'gadget_id')::uuid
      and (active or id=any(old_gadgets))) then raise exception 'INACTIVE_GADGET'; end if;
    insert into public.booking_gadgets(booking_id,gadget_id,quantity) values(target_id,(item->>'gadget_id')::uuid,(item->>'quantity')::integer);
  end loop;
  return target_id;
end $$;
revoke all on function public.save_booking(jsonb) from public, anon;
grant execute on function public.save_booking(jsonb) to authenticated;


commit;
