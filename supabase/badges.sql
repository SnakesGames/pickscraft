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
