-- Pickscraft Network database (Supabase / Postgres)
-- Paste this whole file into Supabase > SQL Editor > New query > Run. Safe to re-run (do it again after updates).
-- Players sign up with a username + their real email + a password, then log in with email + password.
-- To make yourself an admin (so you can hand out Tokens), run once:
--   update public.profiles set is_admin = true where username = 'YourUsername';

create extension if not exists citext;

-- ============ PROFILES ============
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  username      citext unique not null check (username ~ '^[A-Za-z0-9_]{3,20}$'),
  display_name  text not null check (char_length(display_name) between 1 and 32),
  bio           text not null default '' check (char_length(bio) <= 280),
  avatar_color  text not null default '#F7C78C' check (avatar_color ~ '^#[0-9A-Fa-f]{6}$'),
  shirt_color   text not null default '#338CF2' check (shirt_color ~ '^#[0-9A-Fa-f]{6}$'),
  level         int  not null default 1,
  xp            int  not null default 0,
  last_xp_at    timestamptz,
  created_at    timestamptz not null default now()
);
alter table public.profiles enable row level security;

drop policy if exists "profiles are public" on public.profiles;
create policy "profiles are public" on public.profiles for select using (true);
drop policy if exists "edit own profile" on public.profiles;
create policy "edit own profile" on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

-- Players may only edit cosmetic columns; level/xp change through award_game_xp().
revoke insert, update, delete on public.profiles from anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant update (display_name, bio, avatar_color, shirt_color) on public.profiles to authenticated;
-- (more columns are granted further down)

-- Create a profile automatically when someone signs up.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare uname text := coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1));
begin
  insert into public.profiles (id, username, display_name)
  values (new.id, uname, coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), uname));
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.username_available(p_username text) returns boolean
language sql stable security definer set search_path = public as $$
  select p_username ~ '^[A-Za-z0-9_]{3,20}$'
     and not exists (select 1 from public.profiles where username = p_username::citext);
$$;

-- Small XP reward after a match (capped + rate-limited so it can't be farmed easily).
create or replace function public.award_game_xp(p_amount int) returns table(level int, xp int)
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not signed in'; end if;
  update public.profiles p
     set xp = p.xp + least(greatest(p_amount, 0), 50),
         level = 1 + (p.xp + least(greatest(p_amount, 0), 50)) / 500,
         last_xp_at = now()
   where p.id = me and (p.last_xp_at is null or p.last_xp_at < now() - interval '30 seconds');
  return query select p.level, p.xp from public.profiles p where p.id = me;
end $$;

-- ============ FRIENDS ============
create table if not exists public.friend_requests (
  id         bigint generated always as identity primary key,
  from_id    uuid not null references public.profiles(id) on delete cascade,
  to_id      uuid not null references public.profiles(id) on delete cascade,
  status     text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  unique (from_id, to_id),
  check (from_id <> to_id)
);
alter table public.friend_requests enable row level security;
drop policy if exists "see my requests" on public.friend_requests;
create policy "see my requests" on public.friend_requests for select
  using (auth.uid() in (from_id, to_id));
revoke insert, update, delete on public.friend_requests from anon, authenticated;
grant select on public.friend_requests to authenticated;

create or replace function public.are_friends(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.friend_requests
    where status = 'accepted' and ((from_id = a and to_id = b) or (from_id = b and to_id = a)));
$$;

create or replace function public.send_friend_request(p_username text) returns text
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); target uuid;
begin
  if me is null then raise exception 'not signed in'; end if;
  select id into target from public.profiles where username = p_username::citext;
  if target is null then return 'not_found'; end if;
  if target = me then return 'self'; end if;
  if public.are_friends(me, target) then return 'already_friends'; end if;
  -- They already asked me: accept instead.
  update public.friend_requests set status = 'accepted'
   where from_id = target and to_id = me and status = 'pending';
  if found then return 'accepted'; end if;
  insert into public.friend_requests (from_id, to_id) values (me, target) on conflict do nothing;
  return 'sent';
end $$;

create or replace function public.respond_friend_request(p_request_id bigint, p_accept boolean) returns text
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if p_accept then
    update public.friend_requests set status = 'accepted'
     where id = p_request_id and to_id = me and status = 'pending';
    return case when found then 'accepted' else 'not_found' end;
  end if;
  delete from public.friend_requests where id = p_request_id and to_id = me and status = 'pending';
  return case when found then 'declined' else 'not_found' end;
end $$;

-- Unfriend, or cancel a request I sent.
create or replace function public.remove_friend(p_other uuid) returns void
language sql security definer set search_path = public as $$
  delete from public.friend_requests
   where (from_id = auth.uid() and to_id = p_other) or (from_id = p_other and to_id = auth.uid());
$$;

-- ============ PRESENCE (who is online, and where) ============
create table if not exists public.presence (
  user_id      uuid primary key references public.profiles(id) on delete cascade,
  room_kind    text not null default 'dorm',
  room_name    text not null default '',
  session_name text not null default '',
  platform     text not null default '',
  updated_at   timestamptz not null default now()
);
alter table public.presence enable row level security;
drop policy if exists "friends see presence" on public.presence;
create policy "friends see presence" on public.presence for select
  using (user_id = auth.uid() or public.are_friends(auth.uid(), user_id));
revoke insert, update, delete on public.presence from anon, authenticated;
grant select on public.presence to authenticated;

create or replace function public.heartbeat(p_room_kind text, p_room_name text, p_session text, p_platform text) returns void
language sql security definer set search_path = public as $$
  insert into public.presence (user_id, room_kind, room_name, session_name, platform, updated_at)
  values (auth.uid(), left(coalesce(p_room_kind, ''), 24), left(coalesce(p_room_name, ''), 48),
          left(coalesce(p_session, ''), 64), left(coalesce(p_platform, ''), 16), now())
  on conflict (user_id) do update set room_kind = excluded.room_kind, room_name = excluded.room_name,
    session_name = excluded.session_name, platform = excluded.platform, updated_at = now();
$$;

create or replace function public.go_offline() returns void
language sql security definer set search_path = public as $$
  delete from public.presence where user_id = auth.uid();
$$;

-- Friends list with online status (online = heartbeat in the last 90 seconds).
drop function if exists public.get_friends();
create or replace function public.get_friends()
returns table(id uuid, username text, display_name text, avatar_color text, shirt_color text, level int,
              online boolean, room_kind text, room_name text, session_name text, platform text, last_seen timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.username::text, p.display_name, p.avatar_color, p.shirt_color, p.level,
         coalesce(pr.updated_at > now() - interval '90 seconds', false),
         pr.room_kind, pr.room_name, pr.session_name, pr.platform, pr.updated_at
    from public.friend_requests f
    join public.profiles p on p.id = case when f.from_id = auth.uid() then f.to_id else f.from_id end
    left join public.presence pr on pr.user_id = p.id
   where f.status = 'accepted' and auth.uid() in (f.from_id, f.to_id)
   order by 7 desc, p.username;
$$;

create or replace function public.get_friend_requests()
returns table(request_id bigint, direction text, user_id uuid, username text, display_name text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select f.id, case when f.to_id = auth.uid() then 'incoming' else 'outgoing' end,
         p.id, p.username::text, p.display_name, f.created_at
    from public.friend_requests f
    join public.profiles p on p.id = case when f.to_id = auth.uid() then f.from_id else f.to_id end
   where f.status = 'pending' and auth.uid() in (f.from_id, f.to_id)
   order by f.created_at desc;
$$;

-- ============ ROOMS (made with the in-game Maker Pen) ============
create table if not exists public.rooms (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 40),
  description text not null default '' check (char_length(description) <= 280),
  data        jsonb not null default '{"blocks":[]}'::jsonb check (octet_length(data::text) < 200000),
  is_public   boolean not null default false,
  visits      int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.rooms enable row level security;
drop policy if exists "public or own rooms" on public.rooms;
create policy "public or own rooms" on public.rooms for select using (is_public or owner_id = auth.uid());
drop policy if exists "create own rooms" on public.rooms;
create policy "create own rooms" on public.rooms for insert with check (owner_id = auth.uid());
drop policy if exists "edit own rooms" on public.rooms;
create policy "edit own rooms" on public.rooms for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "delete own rooms" on public.rooms;
create policy "delete own rooms" on public.rooms for delete using (owner_id = auth.uid());
revoke update on public.rooms from anon, authenticated;
grant select on public.rooms to anon, authenticated;
grant insert, delete on public.rooms to authenticated;
grant update (name, description, data, is_public, updated_at) on public.rooms to authenticated;

-- Every visit is logged for the creator dashboard. The owner's own visits don't count, and one player
-- counts at most once every 10 minutes per room.
create table if not exists public.room_visits (
  id         bigint generated always as identity primary key,
  room_id    uuid not null references public.rooms(id) on delete cascade,
  visitor_id uuid references public.profiles(id) on delete set null,
  visited_at timestamptz not null default now()
);
create index if not exists room_visits_room_time on public.room_visits (room_id, visited_at desc);
alter table public.room_visits enable row level security;
drop policy if exists "owners see visits" on public.room_visits;
create policy "owners see visits" on public.room_visits for select
  using (exists (select 1 from public.rooms r where r.id = room_id and r.owner_id = auth.uid()));
revoke insert, update, delete on public.room_visits from anon, authenticated;
grant select on public.room_visits to authenticated;

drop function if exists public.record_room_visit(uuid);
create or replace function public.record_room_visit(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v_owner uuid; v_public boolean;
begin
  select r.owner_id, r.is_public into v_owner, v_public from public.rooms r where r.id = p_room;
  if v_owner is null or me = v_owner then return; end if;
  if not v_public and me is null then return; end if;
  if me is not null and exists (select 1 from public.room_visits
      where room_id = p_room and visitor_id = me and visited_at > now() - interval '10 minutes') then return; end if;
  insert into public.room_visits (room_id, visitor_id) values (p_room, me);
  update public.rooms set visits = visits + 1 where id = p_room;
end $$;

-- ============ CREATOR DASHBOARD ============
-- One row per room I own: visits today / last 7 days / last 30 days / all time, and unique players.
create or replace function public.creator_stats()
returns table(room_id uuid, name text, is_public boolean, visits_total int, today bigint, week bigint, month bigint,
              unique_week bigint, unique_month bigint, last_visit timestamptz, created_at timestamptz, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select r.id, r.name, r.is_public, r.visits,
         count(v.id) filter (where v.visited_at >= date_trunc('day', now())),
         count(v.id) filter (where v.visited_at >= now() - interval '7 days'),
         count(v.id) filter (where v.visited_at >= now() - interval '30 days'),
         count(distinct v.visitor_id) filter (where v.visited_at >= now() - interval '7 days'),
         count(distinct v.visitor_id) filter (where v.visited_at >= now() - interval '30 days'),
         max(v.visited_at), r.created_at, r.updated_at
    from public.rooms r
    left join public.room_visits v on v.room_id = r.id and v.visited_at >= now() - interval '400 days'
   where r.owner_id = auth.uid()
   group by r.id
   order by r.visits desc, r.updated_at desc;
$$;

-- Visits per day across my rooms (or one room), with zero days filled in.
create or replace function public.creator_daily(p_days int default 30, p_room uuid default null)
returns table(day date, visits bigint, players bigint)
language sql stable security definer set search_path = public as $$
  with days as (
    select generate_series(current_date - (least(greatest(p_days, 1), 366) - 1), current_date, interval '1 day')::date as day
  )
  select d.day, count(v.id), count(distinct v.visitor_id)
    from days d
    left join public.room_visits v on v.visited_at::date = d.day
     and v.room_id in (select id from public.rooms where owner_id = auth.uid() and (p_room is null or id = p_room))
   group by d.day order by d.day;
$$;

-- Totals for the dashboard tiles (unique players are counted across all my rooms).
create or replace function public.creator_totals()
returns table(today bigint, week bigint, month bigint, year bigint, all_time bigint, players_week bigint, players_month bigint, rooms bigint)
language sql stable security definer set search_path = public as $$
  with mine as (select id, visits from public.rooms where owner_id = auth.uid()),
       v as (select * from public.room_visits where room_id in (select id from mine))
  select (select count(*) from v where visited_at >= date_trunc('day', now())),
         (select count(*) from v where visited_at >= now() - interval '7 days'),
         (select count(*) from v where visited_at >= now() - interval '30 days'),
         (select count(*) from v where visited_at >= now() - interval '365 days'),
         (select coalesce(sum(visits), 0) from mine),
         (select count(distinct visitor_id) from v where visited_at >= now() - interval '7 days'),
         (select count(distinct visitor_id) from v where visited_at >= now() - interval '30 days'),
         (select count(*) from mine);
$$;

-- Homepage numbers.
create or replace function public.public_stats() returns table(players bigint, online bigint, rooms bigint)
language sql stable security definer set search_path = public as $$
  select (select count(*) from public.profiles),
         (select count(*) from public.presence where updated_at > now() - interval '90 seconds'),
         (select count(*) from public.rooms where is_public);
$$;

-- ============ TOKENS (currency) + GIFT BOXES ============
alter table public.profiles add column if not exists tokens int not null default 0;
alter table public.profiles add column if not exists is_admin boolean not null default false;
do $$ begin
  alter table public.profiles add constraint profiles_tokens_positive check (tokens >= 0);
exception when duplicate_object then null; end $$;
-- (players still can't change tokens or is_admin themselves: only the columns granted above are editable)

create table if not exists public.token_gifts (
  id         bigint generated always as identity primary key,
  to_id      uuid not null references public.profiles(id) on delete cascade,
  from_id    uuid references public.profiles(id) on delete set null,
  amount     int not null check (amount > 0 and amount <= 1000000),
  message    text not null default '' check (char_length(message) <= 120),
  opened_at  timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists token_gifts_unopened on public.token_gifts (to_id) where opened_at is null;
alter table public.token_gifts enable row level security;
drop policy if exists "see my gifts" on public.token_gifts;
create policy "see my gifts" on public.token_gifts for select using (to_id = auth.uid());
revoke insert, update, delete on public.token_gifts from anon, authenticated;
grant select on public.token_gifts to authenticated;

-- Admins send Tokens. The amount is added straight away; the player gets a gift box to open in the game.
-- p_username '*' sends the gift to every player. A negative amount takes Tokens away (no gift box).
create or replace function public.admin_give_tokens(p_username text, p_amount int, p_message text)
returns table(username text, gift_id bigint, tokens int)
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); target record; n int := 0;
begin
  if me is null or not exists (select 1 from public.profiles pr where pr.id = me and pr.is_admin) then
    raise exception 'Only admins can give Tokens.';
  end if;
  if p_amount = 0 or abs(p_amount) > 1000000 then raise exception 'Amount must be between 1 and 1,000,000.'; end if;
  for target in select pr.id as pid, pr.username::text as uname from public.profiles pr
                 where (p_username = '*' or pr.username = p_username::citext) loop
    n := n + 1;
    if p_amount > 0 then
      update public.profiles pr set tokens = pr.tokens + p_amount where pr.id = target.pid;
      insert into public.token_gifts (to_id, from_id, amount, message)
      values (target.pid, me, p_amount, left(coalesce(p_message, ''), 120)) returning token_gifts.id into gift_id;
    else
      update public.profiles pr set tokens = greatest(0, pr.tokens + p_amount) where pr.id = target.pid;
      gift_id := null;
    end if;
    username := target.uname;
    select pr.tokens into tokens from public.profiles pr where pr.id = target.pid;
    return next;
  end loop;
  if n = 0 then raise exception 'No player called %.', p_username; end if;
end $$;

-- Gift boxes I haven't opened yet.
create or replace function public.my_gifts()
returns table(id bigint, amount int, message text, from_name text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select g.id, g.amount, g.message, coalesce(p.display_name, 'Pickscraft'), g.created_at
    from public.token_gifts g left join public.profiles p on p.id = g.from_id
   where g.to_id = auth.uid() and g.opened_at is null
   order by g.created_at;
$$;

create or replace function public.open_gift(p_id bigint)
returns table(amount int, message text, from_name text, tokens int)
language sql security definer set search_path = public as $$
  with g as (
    update public.token_gifts set opened_at = now()
     where id = p_id and to_id = auth.uid() and opened_at is null
    returning token_gifts.amount, token_gifts.message, token_gifts.from_id
  )
  select g.amount, g.message, coalesce((select display_name from public.profiles where id = g.from_id), 'Pickscraft'),
         (select profiles.tokens from public.profiles where id = auth.uid())
    from g;
$$;

-- Recent gifts, for the admin page.
create or replace function public.admin_gift_log(p_limit int default 50)
returns table(id bigint, to_username text, from_username text, amount int, message text, opened_at timestamptz, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.is_admin) then raise exception 'Only admins can see this.'; end if;
  return query
    select g.id, t.username::text, f.username::text, g.amount, g.message, g.opened_at, g.created_at
      from public.token_gifts g join public.profiles t on t.id = g.to_id left join public.profiles f on f.id = g.from_id
     order by g.created_at desc limit least(greatest(p_limit, 1), 200);
end $$;

-- ============ ROOM LIKES / DISLIKES + ROOM SETTINGS ============
-- likes / dislikes are kept on the room (fast to list and sort); players can't edit them directly.
alter table public.rooms add column if not exists likes int not null default 0;
alter table public.rooms add column if not exists dislikes int not null default 0;
-- Room settings the game applies: who can build, category, gravity / speed / jump, sky colour.
alter table public.rooms add column if not exists settings jsonb not null default '{}'::jsonb;
do $$ begin
  alter table public.rooms add constraint rooms_settings_size check (octet_length(settings::text) < 4000);
exception when duplicate_object then null; end $$;
create index if not exists rooms_public_likes on public.rooms (likes desc) where is_public;
revoke update on public.rooms from anon, authenticated;
grant update (name, description, data, is_public, settings, updated_at) on public.rooms to authenticated;

create table if not exists public.room_votes (
  room_id  uuid not null references public.rooms(id) on delete cascade,
  user_id  uuid not null references public.profiles(id) on delete cascade,
  vote     smallint not null check (vote in (-1, 1)),
  voted_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
alter table public.room_votes enable row level security;
drop policy if exists "see own votes" on public.room_votes;
create policy "see own votes" on public.room_votes for select using (user_id = auth.uid());
revoke insert, update, delete on public.room_votes from anon, authenticated;
grant select on public.room_votes to authenticated;

-- Like (1), dislike (-1) or clear (0) a room. You can't rate your own room or a private one.
create or replace function public.vote_room(p_room uuid, p_vote int) returns json
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v_owner uuid; v_public boolean; v_l int; v_d int;
begin
  if me is null then raise exception 'Log in to rate rooms.'; end if;
  select r.owner_id, r.is_public into v_owner, v_public from public.rooms r where r.id = p_room;
  if v_owner is null or (not v_public and v_owner <> me) then raise exception 'Room not found.'; end if;
  if v_owner = me then raise exception 'You can''t rate your own room.'; end if;
  if p_vote = 0 then
    delete from public.room_votes rv where rv.room_id = p_room and rv.user_id = me;
  elsif p_vote in (-1, 1) then
    insert into public.room_votes as rv (room_id, user_id, vote) values (p_room, me, p_vote)
      on conflict (room_id, user_id) do update set vote = excluded.vote, voted_at = now();
  else
    raise exception 'Vote must be 1, -1 or 0.';
  end if;
  select count(*) filter (where rv.vote = 1), count(*) filter (where rv.vote = -1) into v_l, v_d
    from public.room_votes rv where rv.room_id = p_room;
  update public.rooms r set likes = v_l, dislikes = v_d where r.id = p_room;
  return json_build_object('likes', v_l, 'dislikes', v_d,
    'my_vote', coalesce((select rv.vote from public.room_votes rv where rv.room_id = p_room and rv.user_id = me), 0));
end $$;

revoke execute on function public.vote_room(uuid, int) from public, anon;
grant execute on function public.vote_room(uuid, int) to authenticated;

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

-- ============ AVATAR SHOP (items bought with Tokens) + LOOK SAVED ON THE ACCOUNT ============
-- The avatar look (outfit + colours, a small JSON string) is saved on the profile so it follows you to other devices.
alter table public.profiles add column if not exists look text check (look is null or char_length(look) <= 600);
revoke update on public.profiles from anon, authenticated;
grant update (display_name, bio, avatar_color, shirt_color, look) on public.profiles to authenticated;

-- What every item costs. The server decides prices; the game just shows them.
create table if not exists public.shop_items (
  key    text primary key check (key ~ '^[a-z0-9_]{2,40}$'),
  name   text not null,
  slot   text not null,
  price  int not null default 0 check (price >= 0),
  active boolean not null default true
);
alter table public.shop_items enable row level security;
drop policy if exists "anyone sees the shop" on public.shop_items;
create policy "anyone sees the shop" on public.shop_items for select using (true);
revoke insert, update, delete on public.shop_items from anon, authenticated;
grant select on public.shop_items to anon, authenticated;

create table if not exists public.owned_items (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  item_key    text not null references public.shop_items(key) on delete cascade,
  acquired_at timestamptz not null default now(),
  how         text not null default 'bought',   -- bought / gift
  primary key (user_id, item_key)
);
alter table public.owned_items enable row level security;
drop policy if exists "see own items" on public.owned_items;
create policy "see own items" on public.owned_items for select using (user_id = auth.uid());
revoke insert, update, delete on public.owned_items from anon, authenticated;
grant select on public.owned_items to authenticated;

-- Buy an item with Tokens. Returns your new balance. Buying something you already own costs nothing.
create or replace function public.buy_item(p_key text) returns json
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v_price int; v_name text; v_tokens int;
begin
  if me is null then raise exception 'Log in to buy items.'; end if;
  select si.price, si.name into v_price, v_name from public.shop_items si where si.key = p_key and si.active;
  if v_price is null then raise exception 'That item isn''t for sale.'; end if;
  select pr.tokens into v_tokens from public.profiles pr where pr.id = me for update;   -- lock: no double spending
  if exists (select 1 from public.owned_items oi where oi.user_id = me and oi.item_key = p_key) then
    return json_build_object('tokens', v_tokens, 'owned', true, 'already', true);
  end if;
  if v_tokens < v_price then raise exception 'You need % more Tokens for %.', v_price - v_tokens, v_name; end if;
  update public.profiles pr set tokens = pr.tokens - v_price where pr.id = me returning pr.tokens into v_tokens;
  insert into public.owned_items (user_id, item_key, how) values (me, p_key, 'bought');
  return json_build_object('tokens', v_tokens, 'owned', true, 'already', false);
end $$;

-- ============ EARNING TOKENS: 50 per level-up, plus a daily reward ============
alter table public.profiles add column if not exists last_daily date;
alter table public.profiles add column if not exists daily_streak int not null default 0;

create or replace function public.award_game_xp(p_amount int) returns table(level int, xp int)
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); old_level int;
begin
  if me is null then raise exception 'not signed in'; end if;
  select pr.level into old_level from public.profiles pr where pr.id = me for update;
  update public.profiles p
     set xp = p.xp + least(greatest(p_amount, 0), 50),
         level = 1 + (p.xp + least(greatest(p_amount, 0), 50)) / 500,
         last_xp_at = now()
   where p.id = me and (p.last_xp_at is null or p.last_xp_at < now() - interval '30 seconds');
  update public.profiles p set tokens = p.tokens + 50 * (p.level - old_level) where p.id = me and p.level > old_level;
  return query select p.level, p.xp from public.profiles p where p.id = me;
end $$;

-- Once per day (UTC): 20 Tokens, +5 for each day in a row, up to 50.
create or replace function public.claim_daily() returns json
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v_last date; v_streak int; v_amount int; v_tokens int;
begin
  if me is null then raise exception 'Log in first.'; end if;
  select pr.last_daily, pr.daily_streak into v_last, v_streak from public.profiles pr where pr.id = me for update;
  if v_last = current_date then
    return json_build_object('claimed', false, 'streak', v_streak, 'tokens', (select pr.tokens from public.profiles pr where pr.id = me));
  end if;
  v_streak := case when v_last = current_date - 1 then v_streak + 1 else 1 end;
  v_amount := least(20 + 5 * (v_streak - 1), 50);
  update public.profiles pr set tokens = pr.tokens + v_amount, last_daily = current_date, daily_streak = v_streak
   where pr.id = me returning pr.tokens into v_tokens;
  return json_build_object('claimed', true, 'amount', v_amount, 'streak', v_streak, 'tokens', v_tokens);
end $$;
revoke execute on function public.claim_daily() from public, anon;
grant execute on function public.claim_daily() to authenticated;

-- ============ ADMIN TOOLS: bans, mutes, announcements, item gifts, player lookup ============
alter table public.profiles add column if not exists banned_until timestamptz;
alter table public.profiles add column if not exists ban_reason text not null default '';
alter table public.profiles add column if not exists muted_until timestamptz;

create table if not exists public.announcements (
  id         bigint generated always as identity primary key,
  message    text not null check (char_length(message) between 1 and 200),
  from_id    uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.announcements enable row level security;
drop policy if exists "anyone reads announcements" on public.announcements;
create policy "anyone reads announcements" on public.announcements for select using (created_at > now() - interval '1 day');
revoke insert, update, delete on public.announcements from anon, authenticated;
grant select on public.announcements to anon, authenticated;

create table if not exists public.admin_log (
  id         bigint generated always as identity primary key,
  admin_id   uuid references public.profiles(id) on delete set null,
  action     text not null,
  target     text not null default '',
  detail     text not null default '',
  created_at timestamptz not null default now()
);
alter table public.admin_log enable row level security;
drop policy if exists "admins read the log" on public.admin_log;
create policy "admins read the log" on public.admin_log for select
  using (exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.is_admin));
revoke insert, update, delete on public.admin_log from anon, authenticated;
grant select on public.admin_log to authenticated;

create or replace function public.require_admin() returns uuid
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.is_admin) then raise exception 'Only admins can do that.'; end if;
  return auth.uid();
end $$;

create or replace function public.admin_find(p_username text) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare v uuid;
begin
  select pr.id into v from public.profiles pr where lower(pr.username) = lower(trim(leading '@' from trim(p_username)));
  if v is null then raise exception 'No player called %.', p_username; end if;
  return v;
end $$;

-- Ban: p_minutes null or <= 0 = forever. Admins can't be banned.
create or replace function public.admin_ban(p_username text, p_minutes int, p_reason text) returns json
language plpgsql security definer set search_path = public as $$
declare me uuid := public.require_admin(); v uuid := public.admin_find(p_username); v_until timestamptz;
begin
  if exists (select 1 from public.profiles pr where pr.id = v and pr.is_admin) then raise exception 'You can''t ban an admin.'; end if;
  v_until := case when coalesce(p_minutes, 0) <= 0 then 'infinity'::timestamptz else now() + make_interval(mins => p_minutes) end;
  update public.profiles pr set banned_until = v_until, ban_reason = left(coalesce(p_reason, ''), 200) where pr.id = v;
  insert into public.admin_log (admin_id, action, target, detail) values (me, 'ban', p_username, coalesce(p_minutes, 0) || ' min: ' || coalesce(p_reason, ''));
  return json_build_object('username', p_username, 'banned_until', v_until);
end $$;

create or replace function public.admin_unban(p_username text) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := public.require_admin(); v uuid := public.admin_find(p_username);
begin
  update public.profiles pr set banned_until = null, ban_reason = '' where pr.id = v;
  insert into public.admin_log (admin_id, action, target) values (me, 'unban', p_username);
end $$;

create or replace function public.admin_mute(p_username text, p_minutes int) returns json
language plpgsql security definer set search_path = public as $$
declare me uuid := public.require_admin(); v uuid := public.admin_find(p_username); v_until timestamptz;
begin
  v_until := case when coalesce(p_minutes, 0) <= 0 then 'infinity'::timestamptz else now() + make_interval(mins => p_minutes) end;
  update public.profiles pr set muted_until = v_until where pr.id = v;
  insert into public.admin_log (admin_id, action, target, detail) values (me, 'mute', p_username, coalesce(p_minutes, 0) || ' min');
  return json_build_object('username', p_username, 'muted_until', v_until);
end $$;

create or replace function public.admin_unmute(p_username text) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := public.require_admin(); v uuid := public.admin_find(p_username);
begin
  update public.profiles pr set muted_until = null where pr.id = v;
  insert into public.admin_log (admin_id, action, target) values (me, 'unmute', p_username);
end $$;

-- Give a shop item for free ('*' = everyone).
create or replace function public.admin_grant_item(p_username text, p_key text) returns int
language plpgsql security definer set search_path = public as $$
declare me uuid := public.require_admin(); n int;
begin
  if not exists (select 1 from public.shop_items si where si.key = p_key) then raise exception 'No item called %.', p_key; end if;
  if p_username = '*' then
    insert into public.owned_items (user_id, item_key, how) select pr.id, p_key, 'gift' from public.profiles pr on conflict do nothing;
  else
    insert into public.owned_items (user_id, item_key, how) values (public.admin_find(p_username), p_key, 'gift') on conflict do nothing;
  end if;
  get diagnostics n = row_count;
  insert into public.admin_log (admin_id, action, target, detail) values (me, 'grant', p_username, p_key);
  return n;
end $$;

create or replace function public.admin_take_item(p_username text, p_key text) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := public.require_admin();
begin
  delete from public.owned_items oi where oi.user_id = public.admin_find(p_username) and oi.item_key = p_key;
  insert into public.admin_log (admin_id, action, target, detail) values (me, 'take_item', p_username, p_key);
end $$;

create or replace function public.admin_announce(p_message text) returns bigint
language plpgsql security definer set search_path = public as $$
declare me uuid := public.require_admin(); v bigint;
begin
  insert into public.announcements (message, from_id) values (left(trim(p_message), 200), me) returning id into v;
  insert into public.admin_log (admin_id, action, detail) values (me, 'announce', left(p_message, 200));
  return v;
end $$;

-- Set or clear admin rights (admins only).
create or replace function public.admin_set_admin(p_username text, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := public.require_admin(); v uuid := public.admin_find(p_username);
begin
  if v = me and not p_on then raise exception 'You can''t remove your own admin rights.'; end if;
  update public.profiles pr set is_admin = p_on where pr.id = v;
  insert into public.admin_log (admin_id, action, target, detail) values (me, 'set_admin', p_username, p_on::text);
end $$;

-- Everything an admin needs to know about a player.
create or replace function public.admin_lookup(p_username text) returns json
language plpgsql stable security definer set search_path = public as $$
declare me uuid := public.require_admin(); v uuid := public.admin_find(p_username); r json;
begin
  select json_build_object('id', pr.id, 'username', pr.username, 'display_name', pr.display_name, 'level', pr.level, 'xp', pr.xp,
         'tokens', pr.tokens, 'is_admin', pr.is_admin, 'created_at', pr.created_at, 'banned_until', pr.banned_until,
         'ban_reason', pr.ban_reason, 'muted_until', pr.muted_until,
         'online', coalesce((select ps.updated_at > now() - interval '90 seconds' from public.presence ps where ps.user_id = pr.id), false),
         'room_name', (select ps.room_name from public.presence ps where ps.user_id = pr.id),
         'last_seen', (select ps.updated_at from public.presence ps where ps.user_id = pr.id),
         'rooms', (select count(*) from public.rooms rm where rm.owner_id = pr.id),
         'items', (select count(*) from public.owned_items oi where oi.user_id = pr.id),
         'friends', (select count(*) from public.friend_requests f where f.status = 'accepted' and pr.id in (f.from_id, f.to_id)))
    into r from public.profiles pr where pr.id = v;
  return r;
end $$;

create or replace function public.admin_recent_log(p_limit int default 50)
returns table(created_at timestamptz, admin text, action text, target text, detail text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_admin();
  return query select l.created_at, coalesce(pr.username::text, '?'), l.action, l.target, l.detail
    from public.admin_log l left join public.profiles pr on pr.id = l.admin_id
   order by l.created_at desc limit least(greatest(p_limit, 1), 200);
end $$;

revoke execute on function public.buy_item(text), public.require_admin(), public.admin_find(text), public.admin_ban(text, int, text),
  public.admin_unban(text), public.admin_mute(text, int), public.admin_unmute(text), public.admin_grant_item(text, text),
  public.admin_take_item(text, text), public.admin_announce(text), public.admin_set_admin(text, boolean), public.admin_lookup(text),
  public.admin_recent_log(int) from public, anon;
grant execute on function public.buy_item(text), public.require_admin(), public.admin_find(text), public.admin_ban(text, int, text),
  public.admin_unban(text), public.admin_mute(text, int), public.admin_unmute(text), public.admin_grant_item(text, text),
  public.admin_take_item(text, text), public.admin_announce(text), public.admin_set_admin(text, boolean), public.admin_lookup(text),
  public.admin_recent_log(int) to authenticated;

-- GENERATED by Tools/Blender/gen_wardrobe.py - the avatar shop's items and prices (Tokens).
-- Run in the Supabase SQL Editor after wardrobe-shop.sql's tables exist (it's also included in schema.sql).
insert into public.shop_items (key, name, slot, price) values
  ('top_hoodie', 'Hoodie', 'top', 0),
  ('top_tee', 'T-Shirt', 'top', 0),
  ('top_jacket', 'Jacket', 'top', 0),
  ('top_sweater', 'Sweater', 'top', 0),
  ('top_tank', 'Tank Top', 'top', 0),
  ('top_polo', 'Polo', 'top', 0),
  ('top_button', 'Button Shirt', 'top', 0),
  ('top_overalls', 'Overalls', 'top', 0),
  ('top_varsity', 'Varsity Jacket', 'top', 0),
  ('top_jersey', 'Sports Jersey', 'top', 0),
  ('top_raincoat', 'Raincoat', 'top', 0),
  ('top_puffer', 'Puffer Jacket', 'top', 60),
  ('top_suit', 'Suit & Tie', 'top', 120),
  ('top_tux', 'Tuxedo', 'top', 200),
  ('top_space', 'Space Suit', 'top', 300),
  ('top_armor', 'Knight Armor', 'top', 350),
  ('hair_none', 'Bald', 'hair', 0),
  ('hair_short', 'Short', 'hair', 0),
  ('hair_spiky', 'Spiky', 'hair', 0),
  ('hair_long', 'Long', 'hair', 0),
  ('hair_bun', 'Bun', 'hair', 0),
  ('hair_curly', 'Curly', 'hair', 0),
  ('hair_buzz', 'Buzz Cut', 'hair', 0),
  ('hair_mohawk', 'Mohawk', 'hair', 0),
  ('hair_ponytail', 'Ponytail', 'hair', 0),
  ('hair_pigtails', 'Pigtails', 'hair', 0),
  ('hair_afro', 'Afro', 'hair', 0),
  ('hair_bob', 'Bob', 'hair', 0),
  ('hair_swoop', 'Side Swoop', 'hair', 0),
  ('hair_messy', 'Messy', 'hair', 0),
  ('hair_braids', 'Braids', 'hair', 0),
  ('hair_mullet', 'Mullet', 'hair', 0),
  ('hair_anime', 'Anime Spikes', 'hair', 80),
  ('hat_none', 'None', 'hat', 0),
  ('hat_cap', 'Cap', 'hat', 0),
  ('hat_beanie', 'Beanie', 'hat', 0),
  ('hat_crown', 'Crown', 'hat', 300),
  ('hat_tophat', 'Top Hat', 'hat', 0),
  ('hat_headphones', 'Headphones', 'hat', 0),
  ('hat_party', 'Party Hat', 'hat', 0),
  ('hat_cowboy', 'Cowboy Hat', 'hat', 0),
  ('hat_halo', 'Halo', 'hat', 400),
  ('hat_beret', 'Beret', 'hat', 0),
  ('hat_bucket', 'Bucket Hat', 'hat', 0),
  ('hat_fedora', 'Fedora', 'hat', 0),
  ('hat_bandana', 'Bandana', 'hat', 0),
  ('hat_chef', 'Chef Hat', 'hat', 0),
  ('hat_santa', 'Santa Hat', 'hat', 0),
  ('hat_bunny', 'Bunny Ears', 'hat', 0),
  ('hat_cat', 'Cat Ears', 'hat', 0),
  ('hat_antenna', 'Antennae', 'hat', 0),
  ('hat_pirate', 'Pirate Hat', 'hat', 60),
  ('hat_witch', 'Witch Hat', 'hat', 80),
  ('hat_propeller', 'Propeller Cap', 'hat', 120),
  ('hat_flowers', 'Flower Crown', 'hat', 120),
  ('hat_mushroom', 'Mushroom Cap', 'hat', 120),
  ('hat_frog', 'Frog Hat', 'hat', 120),
  ('hat_viking', 'Viking Helmet', 'hat', 150),
  ('hat_wizard', 'Wizard Hat', 'hat', 200),
  ('hat_knight', 'Knight Helmet', 'hat', 250),
  ('hat_astro', 'Space Helmet', 'hat', 300),
  ('hat_grad', 'Graduation Cap', 'hat', 0),
  ('glasses_none', 'None', 'glasses', 0),
  ('glasses_sun', 'Shades', 'glasses', 0),
  ('glasses_round', 'Round', 'glasses', 0),
  ('glasses_visor', 'Cyber Visor', 'glasses', 150),
  ('glasses_nerd', 'Square', 'glasses', 0),
  ('glasses_aviator', 'Aviators', 'glasses', 0),
  ('glasses_3d', '3D Glasses', 'glasses', 0),
  ('glasses_goggles', 'Ski Goggles', 'glasses', 0),
  ('glasses_monocle', 'Monocle', 'glasses', 60),
  ('glasses_heart', 'Heart Shades', 'glasses', 100),
  ('glasses_star', 'Star Shades', 'glasses', 100),
  ('beard_none', 'None', 'beard', 0),
  ('beard_mustache', 'Mustache', 'beard', 0),
  ('beard_goatee', 'Goatee', 'beard', 0),
  ('beard_full', 'Full Beard', 'beard', 0),
  ('beard_handlebar', 'Handlebar', 'beard', 0),
  ('beard_chinstrap', 'Chin Strap', 'beard', 0),
  ('beard_stubble', 'Stubble', 'beard', 0),
  ('beard_wizard', 'Wizard Beard', 'beard', 100),
  ('face_none', 'None', 'face', 0),
  ('face_blush', 'Blush', 'face', 0),
  ('face_freckles', 'Freckles', 'face', 0),
  ('face_patch', 'Eye Patch', 'face', 0),
  ('face_mask', 'Face Mask', 'face', 0),
  ('face_clown', 'Clown Nose', 'face', 0),
  ('face_whiskers', 'Whiskers', 'face', 0),
  ('face_warpaint', 'Face Paint', 'face', 60),
  ('face_bandaid', 'Bandage', 'face', 0),
  ('neck_none', 'None', 'neck', 0),
  ('neck_scarf', 'Scarf', 'neck', 0),
  ('neck_bowtie', 'Bow Tie', 'neck', 0),
  ('neck_tie', 'Tie', 'neck', 0),
  ('neck_bandana', 'Neck Bandana', 'neck', 0),
  ('neck_lei', 'Flower Lei', 'neck', 0),
  ('neck_headphones', 'Neck Headphones', 'neck', 0),
  ('neck_chain', 'Gold Chain', 'neck', 150),
  ('neck_medal', 'Gold Medal', 'neck', 100),
  ('back_none', 'None', 'back', 0),
  ('back_backpack', 'Backpack', 'back', 0),
  ('back_guitar', 'Guitar', 'back', 150),
  ('back_cape', 'Hero Cape', 'back', 200),
  ('back_sword', 'Sword', 'back', 200),
  ('back_shell', 'Turtle Shell', 'back', 120),
  ('back_batwings', 'Bat Wings', 'back', 250),
  ('back_butterfly', 'Butterfly Wings', 'back', 300),
  ('back_jetpack', 'Jetpack', 'back', 350),
  ('back_wings', 'Angel Wings', 'back', 400),
  ('back_dragon', 'Dragon Wings', 'back', 500)
on conflict (key) do update set name = excluded.name, slot = excluded.slot, price = excluded.price, active = true;

-- ============ BADGES: admins make badges and give them to players; players pick one to show above their head ============
create table if not exists public.badges (
  id          bigint generated always as identity primary key,
  name        text not null check (char_length(name) between 1 and 24),
  description text not null default '' check (char_length(description) <= 140),
  color       text not null default '#FFD84D' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  icon        text not null default 'star' check (icon ~ '^[a-z]{2,16}$'),
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
alter table public.badges enable row level security;
drop policy if exists "anyone sees badges" on public.badges;
create policy "anyone sees badges" on public.badges for select using (true);
revoke insert, update, delete on public.badges from anon, authenticated;
grant select on public.badges to anon, authenticated;

create table if not exists public.user_badges (
  user_id  uuid not null references public.profiles(id) on delete cascade,
  badge_id bigint not null references public.badges(id) on delete cascade,
  given_by uuid references public.profiles(id) on delete set null,
  given_at timestamptz not null default now(),
  primary key (user_id, badge_id)
);
alter table public.user_badges enable row level security;
drop policy if exists "anyone sees who has badges" on public.user_badges;
create policy "anyone sees who has badges" on public.user_badges for select using (true);
revoke insert, update, delete on public.user_badges from anon, authenticated;
grant select on public.user_badges to anon, authenticated;

-- the badge shown above your head (must be one you own - set through equip_badge)
alter table public.profiles add column if not exists equipped_badge bigint references public.badges(id) on delete set null;

create or replace function public.equip_badge(p_badge bigint) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Log in first.'; end if;
  if p_badge is not null and not exists (select 1 from public.user_badges ub where ub.user_id = me and ub.badge_id = p_badge) then
    raise exception 'You don''t have that badge.';
  end if;
  update public.profiles pr set equipped_badge = p_badge where pr.id = me;
end $$;

create or replace function public.admin_create_badge(p_name text, p_description text, p_color text, p_icon text) returns bigint
language plpgsql security definer set search_path = public as $$
declare me uuid := public.require_admin(); v bigint;
begin
  insert into public.badges (name, description, color, icon, created_by)
  values (trim(p_name), coalesce(trim(p_description), ''), upper(coalesce(p_color, '#FFD84D')), lower(coalesce(p_icon, 'star')), me) returning id into v;
  insert into public.admin_log (admin_id, action, target, detail) values (me, 'create_badge', p_name, p_color || ' ' || p_icon);
  return v;
end $$;

create or replace function public.admin_update_badge(p_badge bigint, p_name text, p_description text, p_color text, p_icon text) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := public.require_admin();
begin
  update public.badges b set name = trim(p_name), description = coalesce(trim(p_description), ''), color = upper(p_color), icon = lower(p_icon) where b.id = p_badge;
  if not found then raise exception 'No such badge.'; end if;
  insert into public.admin_log (admin_id, action, target, detail) values (me, 'edit_badge', p_name, '');
end $$;

create or replace function public.admin_delete_badge(p_badge bigint) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := public.require_admin(); v_name text;
begin
  delete from public.badges b where b.id = p_badge returning b.name into v_name;
  if v_name is null then raise exception 'No such badge.'; end if;
  insert into public.admin_log (admin_id, action, target) values (me, 'delete_badge', v_name);
end $$;

-- Give a badge ('*' = everyone). New owners who have nothing equipped get it equipped straight away.
create or replace function public.admin_give_badge(p_username text, p_badge bigint) returns int
language plpgsql security definer set search_path = public as $$
declare me uuid := public.require_admin(); n int; v_name text;
begin
  select b.name into v_name from public.badges b where b.id = p_badge;
  if v_name is null then raise exception 'No such badge.'; end if;
  if p_username = '*' then
    insert into public.user_badges (user_id, badge_id, given_by) select pr.id, p_badge, me from public.profiles pr on conflict do nothing;
    get diagnostics n = row_count;
    update public.profiles pr set equipped_badge = p_badge where pr.equipped_badge is null;
  else
    insert into public.user_badges (user_id, badge_id, given_by) values (public.admin_find(p_username), p_badge, me) on conflict do nothing;
    get diagnostics n = row_count;
    update public.profiles pr set equipped_badge = p_badge where pr.id = public.admin_find(p_username) and pr.equipped_badge is null;
  end if;
  insert into public.admin_log (admin_id, action, target, detail) values (me, 'give_badge', p_username, v_name);
  return n;
end $$;

create or replace function public.admin_take_badge(p_username text, p_badge bigint) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := public.require_admin(); v uuid := public.admin_find(p_username); v_name text;
begin
  select b.name into v_name from public.badges b where b.id = p_badge;
  delete from public.user_badges ub where ub.user_id = v and ub.badge_id = p_badge;
  update public.profiles pr set equipped_badge = null where pr.id = v and pr.equipped_badge = p_badge;
  insert into public.admin_log (admin_id, action, target, detail) values (me, 'take_badge', p_username, coalesce(v_name, p_badge::text));
end $$;

revoke execute on function public.equip_badge(bigint), public.admin_create_badge(text, text, text, text), public.admin_update_badge(bigint, text, text, text, text),
  public.admin_delete_badge(bigint), public.admin_give_badge(text, bigint), public.admin_take_badge(text, bigint) from public, anon;
grant execute on function public.equip_badge(bigint), public.admin_create_badge(text, text, text, text), public.admin_update_badge(bigint, text, text, text, text),
  public.admin_delete_badge(bigint), public.admin_give_badge(text, bigint), public.admin_take_badge(text, bigint) to authenticated;

-- ============ GAME STATUS: admins can close the game (now or at a set time) with a reason, and set when it opens again ============
create table if not exists public.game_status (
  id         int primary key default 1 check (id = 1),
  closed     boolean not null default false,        -- closed right now (until opens_at, if set)
  reason     text not null default '' check (char_length(reason) <= 300),
  closes_at  timestamptz,                           -- closes automatically at this time (countdown in the game)
  opens_at   timestamptz,                           -- opens again automatically at this time (countdown on the login screen)
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.game_status (id) values (1) on conflict do nothing;
alter table public.game_status enable row level security;
drop policy if exists "anyone reads the game status" on public.game_status;
create policy "anyone reads the game status" on public.game_status for select using (true);
revoke insert, update, delete on public.game_status from anon, authenticated;
grant select on public.game_status to anon, authenticated;

-- Is the game closed to players right now?
create or replace function public.game_is_closed() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select (s.opens_at is null or now() < s.opens_at)
                          and (s.closed or (s.closes_at is not null and now() >= s.closes_at))
                     from public.game_status s where s.id = 1), false);
$$;

create or replace function public.get_game_status() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('open', not public.game_is_closed(), 'closed_flag', s.closed, 'reason', s.reason,
         'closes_at', s.closes_at, 'opens_at', s.opens_at, 'server_time', now(), 'updated_at', s.updated_at)
    from public.game_status s where s.id = 1;
$$;

-- p_closed: close now (true) or open now (false). p_closes_at: schedule a closing (only used when p_closed is false).
-- p_opens_at: when it opens again (null = until an admin opens it).
create or replace function public.admin_set_game_status(p_closed boolean, p_reason text, p_closes_at timestamptz, p_opens_at timestamptz) returns json
language plpgsql security definer set search_path = public as $$
declare me uuid := public.require_admin();
begin
  if p_opens_at is not null and p_opens_at <= now() then raise exception 'The opening time is in the past.'; end if;
  if p_closes_at is not null and p_closes_at <= now() then raise exception 'The closing time is in the past.'; end if;
  if p_closes_at is not null and p_opens_at is not null and p_opens_at <= p_closes_at then raise exception 'The game has to open again after it closes.'; end if;
  update public.game_status s set closed = p_closed, reason = left(coalesce(trim(p_reason), ''), 300),
         closes_at = case when p_closed then null else p_closes_at end,
         opens_at = case when p_closed or p_closes_at is not null then p_opens_at else null end,
         updated_by = me, updated_at = now()
   where s.id = 1;
  insert into public.admin_log (admin_id, action, detail)
  values (me, case when p_closed then 'close_game' when p_closes_at is not null then 'schedule_close' else 'open_game' end,
          left(coalesce(p_reason, ''), 120) || coalesce(' | closes ' || p_closes_at::text, '') || coalesce(' | opens ' || p_opens_at::text, ''));
  return public.get_game_status();
end $$;

revoke execute on function public.admin_set_game_status(boolean, text, timestamptz, timestamptz) from public, anon;
grant execute on function public.game_is_closed(), public.get_game_status() to anon, authenticated;
grant execute on function public.admin_set_game_status(boolean, text, timestamptz, timestamptz) to authenticated;

-- ============ ROOM TEAM: who made a room and its co-owners (shown at the bottom of room pages) ============
create or replace function public.room_team(p_room uuid) returns table(user_id uuid, username text, display_name text, level int,
  avatar_color text, shirt_color text, role text, badge_name text, badge_color text, badge_icon text)
language sql stable security definer set search_path = public as $$
  with r as (select rm.id, rm.owner_id from public.rooms rm
             where rm.id = p_room and (rm.is_public or rm.owner_id = auth.uid() or public.is_room_coowner(rm.id, auth.uid())))
  select pr.id, pr.username::text, pr.display_name, pr.level, pr.avatar_color, pr.shirt_color, 'creator', b.name, b.color, b.icon
    from r join public.profiles pr on pr.id = r.owner_id left join public.badges b on b.id = pr.equipped_badge
  union all
  select pr.id, pr.username::text, pr.display_name, pr.level, pr.avatar_color, pr.shirt_color, 'coowner', b.name, b.color, b.icon
    from r join public.room_coowners c on c.room_id = r.id join public.profiles pr on pr.id = c.user_id
    left join public.badges b on b.id = pr.equipped_badge
$$;

-- ============ MAKER ROOM VARIABLES + LEADERBOARDS (Configure tool) ============
-- Local + Save variables: each player's own client stores their values here (one row per player per room).
create table if not exists public.room_player_vars (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
alter table public.room_player_vars enable row level security;
drop policy if exists "players read their own room variables" on public.room_player_vars;
create policy "players read their own room variables" on public.room_player_vars for select using (user_id = auth.uid());
revoke insert, update, delete on public.room_player_vars from anon, authenticated;
grant select on public.room_player_vars to authenticated;

create or replace function public.save_room_player_vars(p_room uuid, p_data jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Please log in first.'; end if;
  if not exists (select 1 from public.rooms r where r.id = p_room) then raise exception 'Room not found.'; end if;
  if pg_column_size(coalesce(p_data, '{}'::jsonb)) > 8000 then raise exception 'Too much saved data.'; end if;
  insert into public.room_player_vars (room_id, user_id, data, updated_at)
  values (p_room, auth.uid(), coalesce(p_data, '{}'::jsonb), now())
  on conflict (room_id, user_id) do update set data = excluded.data, updated_at = now();
end $$;

-- All-time Leaderboard scores: the best (or latest) score of each player on each board of a room.
create table if not exists public.room_scores (
  room_id uuid not null references public.rooms(id) on delete cascade,
  board int not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  score double precision not null,
  updated_at timestamptz not null default now(),
  primary key (room_id, board, user_id)
);
create index if not exists room_scores_board on public.room_scores (room_id, board, score);
alter table public.room_scores enable row level security;
revoke all on public.room_scores from anon, authenticated;

create or replace function public.submit_room_score(p_room uuid, p_board int, p_score double precision, p_low boolean, p_set boolean default false)
returns double precision language plpgsql security definer set search_path = public as $$
declare v double precision;
begin
  if auth.uid() is null then raise exception 'Please log in first.'; end if;
  if p_score is null or p_score <> p_score or abs(p_score) > 1e12 then raise exception 'Bad score.'; end if;
  if not exists (select 1 from public.rooms r where r.id = p_room) then raise exception 'Room not found.'; end if;
  insert into public.room_scores as s (room_id, board, user_id, score, updated_at)
  values (p_room, p_board, auth.uid(), p_score, now())
  on conflict (room_id, board, user_id) do update set
    score = case when p_set then excluded.score when p_low then least(s.score, excluded.score) else greatest(s.score, excluded.score) end,
    updated_at = now()
  returning s.score into v;
  return v;
end $$;

create or replace function public.room_top_scores(p_room uuid, p_board int, p_low boolean, p_limit int default 10)
returns table(user_id uuid, username text, display_name text, score double precision)
language sql stable security definer set search_path = public as $$
  select s.user_id, pr.username::text, pr.display_name, s.score
  from public.room_scores s
  join public.rooms rm on rm.id = s.room_id
  join public.profiles pr on pr.id = s.user_id
  where s.room_id = p_room and s.board = p_board
    and (rm.is_public or auth.uid() is not null)
    and (pr.banned_until is null or pr.banned_until < now())
  order by case when p_low then s.score end asc, case when not p_low then s.score end desc, s.updated_at asc
  limit greatest(1, least(coalesce(p_limit, 10), 50))
$$;

create or replace function public.clear_room_scores(p_room uuid, p_board int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.rooms r where r.id = p_room and (r.owner_id = auth.uid() or public.is_room_coowner(r.id, auth.uid()))) then
    raise exception 'Only the room creator and co-owners can clear saved scores.';
  end if;
  delete from public.room_scores s where s.room_id = p_room and s.board = p_board;
end $$;

-- ============ CUSTOM COSMETICS (Unity: Pickscraft > Make Cosmetic) ============
-- Admins add or change a shop item (the game does this by itself when an admin signs in).
create or replace function public.admin_set_shop_item(p_key text, p_name text, p_slot text, p_price int) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := public.require_admin();
begin
  if p_slot not in ('top', 'hair', 'hat', 'glasses', 'beard', 'face', 'neck', 'back') then raise exception 'Unknown slot %.', p_slot; end if;
  insert into public.shop_items (key, name, slot, price, active) values (p_key, left(p_name, 40), p_slot, greatest(0, p_price), true)
  on conflict (key) do update set name = excluded.name, slot = excluded.slot, price = excluded.price, active = true;
  insert into public.admin_log (admin_id, action, target, detail) values (me, 'shop_item', p_key, p_slot || ' ' || greatest(0, p_price));
end $$;

-- ============ FUNCTION PERMISSIONS ============
revoke execute on all functions in schema public from public, anon;
-- citext (used for usernames) keeps working for everyone: the line above must not lock its built-in functions.
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_depend d on d.objid = p.oid and d.deptype = 'e'
           join pg_extension e on e.oid = d.refobjid where e.extname = 'citext'
  loop execute format('grant execute on function %s to public', f.sig); end loop;
end $$;
grant execute on function public.handle_new_user() to supabase_auth_admin;
grant execute on function public.username_available(text), public.public_stats(), public.record_room_visit(uuid) to anon, authenticated;
grant execute on function public.award_game_xp(int), public.are_friends(uuid, uuid), public.send_friend_request(text),
  public.respond_friend_request(bigint, boolean), public.remove_friend(uuid), public.heartbeat(text, text, text, text, boolean, uuid, uuid),
  public.go_offline(), public.get_friends(), public.get_friend_requests(),
  public.creator_stats(), public.creator_daily(int, uuid), public.creator_totals(),
  public.admin_give_tokens(text, int, text), public.my_gifts(), public.open_gift(bigint), public.admin_gift_log(int),
  public.vote_room(uuid, int) to authenticated;
grant execute on function public.room_owner_of(uuid), public.is_room_coowner(uuid, uuid) to anon, authenticated;
grant execute on function public.add_room_coowner(uuid, text), public.remove_room_coowner(uuid, uuid) to authenticated;
grant execute on function public.send_room_invites(uuid[], text, text, text, uuid, uuid), public.my_room_invites() to authenticated;
grant execute on function public.buy_item(text), public.require_admin(), public.admin_find(text), public.admin_ban(text, int, text),
  public.admin_unban(text), public.admin_mute(text, int), public.admin_unmute(text), public.admin_grant_item(text, text),
  public.admin_take_item(text, text), public.admin_announce(text), public.admin_set_admin(text, boolean), public.admin_lookup(text),
  public.admin_recent_log(int) to authenticated;
grant update (display_name, bio, avatar_color, shirt_color, look) on public.profiles to authenticated;
grant execute on function public.equip_badge(bigint), public.admin_create_badge(text, text, text, text), public.admin_update_badge(bigint, text, text, text, text),
  public.admin_delete_badge(bigint), public.admin_give_badge(text, bigint), public.admin_take_badge(text, bigint) to authenticated;
grant execute on function public.game_is_closed(), public.get_game_status() to anon, authenticated;
grant execute on function public.admin_set_game_status(boolean, text, timestamptz, timestamptz) to authenticated;
grant execute on function public.room_team(uuid), public.room_top_scores(uuid, int, boolean, int) to anon, authenticated;
grant execute on function public.save_room_player_vars(uuid, jsonb), public.submit_room_score(uuid, int, double precision, boolean, boolean),
  public.clear_room_scores(uuid, int) to authenticated;
grant execute on function public.admin_set_shop_item(text, text, text, int) to authenticated;
