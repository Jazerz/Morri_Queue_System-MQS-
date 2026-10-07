-- Run once using Supabase SQL Editor or `supabase db push`.
create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;
set search_path = public, extensions;

create table public.admin_members (
  user_id uuid primary key references auth.users(id),
  display_name text not null,
  active boolean not null default true
);

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$ select exists(select 1 from public.admin_members where user_id = auth.uid() and active) $$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

create table public.camera_models (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check(length(trim(name)) between 1 and 120),
  active boolean not null default true
);
create table public.camera_units (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references public.camera_models(id),
  code text not null unique check(length(trim(code)) between 1 and 40),
  number text not null check(length(trim(number)) between 1 and 40),
  color text not null check(length(trim(color)) between 1 and 60),
  active boolean not null default true
);
create table public.rental_rates (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references public.camera_models(id),
  days integer not null check(days between 1 and 3660),
  price numeric(12,2) not null check(price >= 0),
  unique(model_id, days)
);
create table public.gadgets (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check(length(trim(name)) between 1 and 120),
  active boolean not null default true
);
create table public.delivery_methods (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check(length(trim(name)) between 1 and 120),
  days_before integer not null default 0 check(days_before between 0 and 365),
  days_after integer not null default 0 check(days_after between 0 and 365),
  requires_address boolean not null default true,
  active boolean not null default true
);
insert into public.delivery_methods(name, days_before, days_after, requires_address) values
 ('นัดรับ',0,0,false),('EMS',2,2,true),('แมสจากคอน',0,0,true),('แมสจากอ้อม',0,0,true);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  reference bigint generated always as identity unique,
  customer_name text not null check(length(trim(customer_name)) between 1 and 200),
  phone text not null check(length(trim(phone)) between 3 and 40),
  address text not null default '' check(length(address) <= 2000),
  notes text not null default '' check(length(notes) <= 4000),
  start_date date not null,
  end_date date not null,
  delivery_method_id uuid not null references public.delivery_methods(id),
  delivery_name text not null,
  days_before integer not null check(days_before between 0 and 365),
  days_after integer not null check(days_after between 0 and 365),
  requires_address boolean not null,
  status text not null default 'booked' check(status in ('booked','dispatched','returned','cancelled')),
  version integer not null default 1,
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(end_date >= start_date and end_date - start_date < 3660),
  check(not requires_address or length(trim(address)) > 0)
);
create table public.booking_cameras (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id),
  unit_id uuid not null references public.camera_units(id),
  model_id uuid not null references public.camera_models(id),
  model_name text not null,
  unit_code text not null,
  unit_number text not null,
  color text not null,
  price numeric(12,2) not null check(price >= 0),
  blocked_start date not null,
  blocked_end date not null,
  cancelled boolean not null default false,
  unique(booking_id, unit_id),
  check(blocked_end >= blocked_start),
  constraint camera_no_overlap exclude using gist
    (unit_id with =, daterange(blocked_start, blocked_end, '[]') with &&)
    where (not cancelled)
);
create table public.booking_gadgets (
  booking_id uuid not null references public.bookings(id),
  gadget_id uuid not null references public.gadgets(id),
  quantity integer not null check(quantity between 1 and 9999),
  primary key(booking_id,gadget_id)
);
create index bookings_start_date_idx on public.bookings(start_date);
create index booking_cameras_booking_idx on public.booking_cameras(booking_id);
create index booking_cameras_dates_idx on public.booking_cameras(blocked_start,blocked_end);

alter table public.admin_members enable row level security;
create policy member_self on public.admin_members for select to authenticated using(user_id = auth.uid());
grant select on public.admin_members to authenticated;
revoke insert, update, delete on public.admin_members from anon, authenticated;

do $$ declare t text; begin
  foreach t in array array['camera_models','camera_units','rental_rates','gadgets','delivery_methods'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('create policy admin_read on public.%I for select to authenticated using(public.is_admin())',t);
    execute format('create policy admin_insert on public.%I for insert to authenticated with check(public.is_admin())',t);
    execute format('create policy admin_update on public.%I for update to authenticated using(public.is_admin()) with check(public.is_admin())',t);
    execute format('grant select, insert, update on public.%I to authenticated',t);
    execute format('revoke delete on public.%I from authenticated',t);
    execute format('revoke all on public.%I from anon',t);
  end loop;
  foreach t in array array['bookings','booking_cameras','booking_gadgets'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('create policy admin_read on public.%I for select to authenticated using(public.is_admin())',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('revoke insert, update, delete on public.%I from authenticated',t);
    execute format('revoke all on public.%I from anon',t);
  end loop;
end $$;

-- This is the only write interface for bookings. The caller cannot supply snapshot
-- dates, creator IDs or overlap flags. A failed insert rolls back the whole RPC.
create function public.save_booking(payload jsonb) returns uuid
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
  if target_id is null then
    insert into public.bookings(customer_name,phone,address,notes,start_date,end_date,delivery_method_id,delivery_name,
      days_before,days_after,requires_address,status,created_by,updated_by)
    values(trim(payload->>'customer_name'),trim(payload->>'phone'),coalesce(payload->>'address',''),coalesce(payload->>'notes',''),
      start_day,end_day,method_id,delivery_label,before_days,after_days,address_required,state,auth.uid(),auth.uid())
    returning id into target_id;
  else
    update public.bookings set customer_name=trim(payload->>'customer_name'), phone=trim(payload->>'phone'),
      address=coalesce(payload->>'address',''), notes=coalesce(payload->>'notes',''), start_date=start_day,end_date=end_day,
      delivery_method_id=method_id,delivery_name=delivery_label,days_before=before_days,days_after=after_days,
      requires_address=address_required,status=state,version=version+1,updated_by=auth.uid(),updated_at=now()
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
    insert into public.booking_cameras(booking_id,unit_id,model_id,model_name,unit_code,unit_number,color,price,blocked_start,blocked_end,cancelled)
    values(target_id,camera.id,coalesce((old_item->>'model_id')::uuid,camera.model_id),coalesce(old_item->>'model_name',camera.model_name),
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

-- Status changes go through the same version/overlap/snapshot transaction.
create function public.set_booking_status(booking_id uuid, expected_version integer, new_status text) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$ declare doc jsonb; begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
  select to_jsonb(b) into doc from public.bookings b where b.id=booking_id;
  if doc is null then raise exception 'BOOKING_NOT_FOUND'; end if;
  doc := doc || jsonb_build_object('expected_version',expected_version,'status',new_status,
    'cameras',(select jsonb_agg(jsonb_build_object('unit_id',bc.unit_id,'price',bc.price)) from public.booking_cameras bc where bc.booking_id=set_booking_status.booking_id),
    'gadgets',coalesce((select jsonb_agg(jsonb_build_object('gadget_id',bg.gadget_id,'quantity',bg.quantity)) from public.booking_gadgets bg where bg.booking_id=set_booking_status.booking_id),'[]'::jsonb));
  return public.save_booking(doc);
end $$;
revoke all on function public.set_booking_status(uuid,integer,text) from public, anon;
grant execute on function public.set_booking_status(uuid,integer,text) to authenticated;
