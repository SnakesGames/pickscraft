-- ============ ROOM CO-OWNERS ============
-- Only a room's creator and its co-owners can use the Maker Pen in it. The creator adds / removes co-owners.
create table if not exists public.room_coowners (
  room_id  uuid not null references public.rooms(id) on delete cascade,
  user_id  uuid not null references public.profiles(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
alter table public.room_coowners enable row level security;

-- helpers (security definer, so the rooms <-> co-owners policies don't loop into each other)
create or replace function public.room_owner_of(p_room uuid) returns uuid
language sql stable security definer set search_path = public as $$ select r.owner_id from public.rooms r where r.id = p_room $$;
create or replace function public.is_room_coowner(p_room uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.room_coowners c where c.room_id = p_room and c.user_id = p_user) $$;

drop policy if exists "owners and coowners see coowners" on public.room_coowners;
create policy "owners and coowners see coowners" on public.room_coowners for select
  using (user_id = auth.uid() or public.room_owner_of(room_id) = auth.uid());
revoke insert, update, delete on public.room_coowners from anon, authenticated;
grant select on public.room_coowners to authenticated;

-- co-owners can open the room even while it's private
drop policy if exists "public or own rooms" on public.rooms;
create policy "public or own rooms" on public.rooms for select
  using (is_public or owner_id = auth.uid() or public.is_room_coowner(id, auth.uid()));

create or replace function public.add_room_coowner(p_room uuid, p_username text) returns json
language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_name text;
begin
  if public.room_owner_of(p_room) is distinct from auth.uid() then raise exception 'Only the room''s creator can add co-owners.'; end if;
  select pr.id, pr.username into v_user, v_name from public.profiles pr where lower(pr.username) = lower(trim(p_username));
  if v_user is null then raise exception 'No player called %.', p_username; end if;
  if v_user = auth.uid() then raise exception 'You already own this room.'; end if;
  if (select count(*) from public.room_coowners c where c.room_id = p_room) >= 20 then raise exception 'Rooms can have at most 20 co-owners.'; end if;
  insert into public.room_coowners (room_id, user_id) values (p_room, v_user) on conflict do nothing;
  return json_build_object('id', v_user, 'username', v_name);
end $$;

create or replace function public.remove_room_coowner(p_room uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  -- the creator can remove anyone; a co-owner can remove themselves
  if public.room_owner_of(p_room) is distinct from auth.uid() and p_user is distinct from auth.uid() then
    raise exception 'Only the room''s creator can remove co-owners.';
  end if;
  delete from public.room_coowners c where c.room_id = p_room and c.user_id = p_user;
end $$;

revoke execute on function public.room_owner_of(uuid), public.is_room_coowner(uuid, uuid),
  public.add_room_coowner(uuid, text), public.remove_room_coowner(uuid, uuid) from public, anon;
grant execute on function public.room_owner_of(uuid), public.is_room_coowner(uuid, uuid) to anon, authenticated;
grant execute on function public.add_room_coowner(uuid, text), public.remove_room_coowner(uuid, uuid) to authenticated;
