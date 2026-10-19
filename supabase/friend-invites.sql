-- ============ PRIVATE ROOMS IN PRESENCE + ROOM INVITES ============
-- Presence remembers whether your room is private (dorms, private Maker rooms). Friends can only "Join" public rooms;
-- private rooms need an invite.
alter table public.presence add column if not exists is_private boolean not null default false;
alter table public.presence add column if not exists maker_room_id uuid;
alter table public.presence add column if not exists maker_owner_id uuid;

drop function if exists public.heartbeat(text, text, text, text);
drop function if exists public.heartbeat(text, text, text, text, boolean, uuid, uuid);
create or replace function public.heartbeat(p_room_kind text, p_room_name text, p_session text, p_platform text,
  p_private boolean default false, p_maker_room uuid default null, p_maker_owner uuid default null) returns void
language sql security definer set search_path = public as $$
  insert into public.presence (user_id, room_kind, room_name, session_name, platform, is_private, maker_room_id, maker_owner_id, updated_at)
  values (auth.uid(), left(coalesce(p_room_kind, ''), 24), left(coalesce(p_room_name, ''), 48),
          left(coalesce(p_session, ''), 64), left(coalesce(p_platform, ''), 16), coalesce(p_private, false), p_maker_room, p_maker_owner, now())
  on conflict (user_id) do update set room_kind = excluded.room_kind, room_name = excluded.room_name,
    session_name = excluded.session_name, platform = excluded.platform, is_private = excluded.is_private,
    maker_room_id = excluded.maker_room_id, maker_owner_id = excluded.maker_owner_id, updated_at = now();
$$;

-- Friends list. A friend in a private room shows where they are, but not how to get in (no session) - that needs an invite.
drop function if exists public.get_friends();
create or replace function public.get_friends()
returns table(id uuid, username text, display_name text, avatar_color text, shirt_color text, level int,
              online boolean, room_kind text, room_name text, session_name text, platform text, last_seen timestamptz,
              is_private boolean, maker_room_id uuid, maker_owner_id uuid)
language sql stable security definer set search_path = public as $$
  select p.id, p.username::text, p.display_name, p.avatar_color, p.shirt_color, p.level,
         coalesce(pr.updated_at > now() - interval '90 seconds', false),
         pr.room_kind, pr.room_name,
         case when coalesce(pr.is_private, false) then null else pr.session_name end,
         pr.platform, pr.updated_at, coalesce(pr.is_private, false),
         case when coalesce(pr.is_private, false) then null else pr.maker_room_id end,
         case when coalesce(pr.is_private, false) then null else pr.maker_owner_id end
    from public.friend_requests f
    join public.profiles p on p.id = case when f.from_id = auth.uid() then f.to_id else f.from_id end
    left join public.presence pr on pr.user_id = p.id
   where f.status = 'accepted' and auth.uid() in (f.from_id, f.to_id)
   order by 7 desc, p.username;
$$;

create table if not exists public.room_invites (
  id             bigint generated always as identity primary key,
  from_id        uuid not null references public.profiles(id) on delete cascade,
  to_id          uuid not null references public.profiles(id) on delete cascade,
  room_kind      text not null default 'plaza',
  room_name      text not null default '',
  session_name   text not null default '',
  maker_room_id  uuid,
  maker_owner_id uuid,
  created_at     timestamptz not null default now(),
  seen_at        timestamptz
);
create index if not exists room_invites_to on public.room_invites (to_id, created_at desc);
alter table public.room_invites enable row level security;
drop policy if exists "see own invites" on public.room_invites;
create policy "see own invites" on public.room_invites for select using (to_id = auth.uid() or from_id = auth.uid());
revoke insert, update, delete on public.room_invites from anon, authenticated;
grant select on public.room_invites to authenticated;

-- Invite friends to the room you're in. p_to = the friends to invite, or null for all your friends. Returns how many were invited.
create or replace function public.send_room_invites(p_to uuid[], p_room_kind text, p_room_name text, p_session text,
  p_maker_room uuid default null, p_maker_owner uuid default null) returns int
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); n int;
begin
  if me is null then raise exception 'Log in to invite friends.'; end if;
  if coalesce(p_session, '') = '' then raise exception 'You need to be in a room to invite people.'; end if;
  -- one pending invite per friend: a new invite replaces the old one
  delete from public.room_invites ri where ri.from_id = me
     and (p_to is null or ri.to_id = any(p_to)) and ri.seen_at is null;
  delete from public.room_invites ri where ri.from_id = me and ri.created_at < now() - interval '1 day';
  insert into public.room_invites (from_id, to_id, room_kind, room_name, session_name, maker_room_id, maker_owner_id)
  select me, fr.friend, left(coalesce(p_room_kind, ''), 24), left(coalesce(p_room_name, ''), 48), left(p_session, 64), p_maker_room, p_maker_owner
    from (select case when f.from_id = me then f.to_id else f.from_id end as friend
            from public.friend_requests f where f.status = 'accepted' and me in (f.from_id, f.to_id)) fr
   where p_to is null or fr.friend = any(p_to)
   limit 200;
  get diagnostics n = row_count;
  return n;
end $$;

-- New invites for me (last 30 minutes, not seen yet). They're marked seen as they're handed out.
create or replace function public.my_room_invites()
returns table(id bigint, from_id uuid, from_name text, from_username text, room_kind text, room_name text, session_name text,
              maker_room_id uuid, maker_owner_id uuid, created_at timestamptz)
language sql security definer set search_path = public as $$
  with got as (
    update public.room_invites ri set seen_at = now()
     where ri.to_id = auth.uid() and ri.seen_at is null and ri.created_at > now() - interval '30 minutes'
    returning ri.*
  )
  select g.id, g.from_id, coalesce(p.display_name, p.username::text), p.username::text, g.room_kind, g.room_name, g.session_name,
         g.maker_room_id, g.maker_owner_id, g.created_at
    from got g join public.profiles p on p.id = g.from_id
   order by g.created_at;
$$;

revoke execute on function public.heartbeat(text, text, text, text, boolean, uuid, uuid), public.get_friends(),
  public.send_room_invites(uuid[], text, text, text, uuid, uuid), public.my_room_invites() from public, anon;
grant execute on function public.heartbeat(text, text, text, text, boolean, uuid, uuid), public.get_friends(),
  public.send_room_invites(uuid[], text, text, text, uuid, uuid), public.my_room_invites() to authenticated;
