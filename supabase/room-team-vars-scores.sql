-- Pickscraft: room team (website room pages), configured variables + leaderboards (Configure tool).
-- Safe to run more than once.

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
revoke execute on function public.room_team(uuid) from public;
grant execute on function public.room_team(uuid) to anon, authenticated;

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

revoke execute on function public.save_room_player_vars(uuid, jsonb), public.submit_room_score(uuid, int, double precision, boolean, boolean),
  public.clear_room_scores(uuid, int), public.room_top_scores(uuid, int, boolean, int) from public, anon;
grant execute on function public.room_team(uuid), public.room_top_scores(uuid, int, boolean, int) to anon, authenticated;
grant execute on function public.save_room_player_vars(uuid, jsonb), public.submit_room_score(uuid, int, double precision, boolean, boolean),
  public.clear_room_scores(uuid, int) to authenticated;
