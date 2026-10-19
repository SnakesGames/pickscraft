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

-- ============ FUNCTION PERMISSIONS ============
revoke execute on all functions in schema public from public, anon;
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
