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
