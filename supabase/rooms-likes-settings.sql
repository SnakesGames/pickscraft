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
