-- Existing members remain ordinary admins. Bootstrap the owner using README SQL.
alter table public.admin_members add column role text not null default 'admin'
  check (role in ('owner', 'admin'));

create function public.is_owner() returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$ select exists(select 1 from public.admin_members where user_id=auth.uid() and active and role='owner') $$;
revoke all on function public.is_owner() from public;
grant execute on function public.is_owner() to authenticated;

create function public.list_admin_members()
returns table(user_id uuid, display_name text, email text, active boolean, role text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.is_owner() then raise exception 'OWNER_REQUIRED' using errcode='42501'; end if;
  return query select m.user_id,m.display_name,u.email::text,m.active,m.role
    from public.admin_members m join auth.users u on u.id=m.user_id
    order by (m.role='owner') desc,m.display_name,m.user_id;
end $$;

-- This RPC never creates/promotes an owner and never changes Auth credentials.
create function public.add_admin_member(member_email text, member_name text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare target uuid;
begin
  if not public.is_owner() then raise exception 'OWNER_REQUIRED' using errcode='42501'; end if;
  if member_name is null or length(trim(member_name)) not between 1 and 120 then
    raise exception 'INVALID_NAME';
  end if;
  select id into target from auth.users where lower(email)=lower(trim(member_email));
  if target is null then raise exception 'USER_NOT_FOUND'; end if;
  insert into public.admin_members(user_id,display_name,active,role)
    values(target,trim(member_name),true,'admin');
  return target;
end $$;

create function public.set_admin_active(member_id uuid, enabled boolean)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare target_role text;
begin
  if not public.is_owner() then raise exception 'OWNER_REQUIRED' using errcode='42501'; end if;
  select role into target_role from public.admin_members where user_id=member_id for update;
  if target_role is null then raise exception 'USER_NOT_FOUND'; end if;
  if target_role='owner' or member_id=auth.uid() then raise exception 'OWNER_PROTECTED'; end if;
  if enabled is null then raise exception 'INVALID_STATUS'; end if;
  update public.admin_members set active=enabled where user_id=member_id;
end $$;

revoke all on function public.list_admin_members() from public;
revoke all on function public.add_admin_member(text,text) from public;
revoke all on function public.set_admin_active(uuid,boolean) from public;
grant execute on function public.list_admin_members() to authenticated;
grant execute on function public.add_admin_member(text,text) to authenticated;
grant execute on function public.set_admin_active(uuid,boolean) to authenticated;
