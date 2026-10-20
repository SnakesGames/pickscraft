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

-- citext (used for usernames) keeps working for everyone: the line above must not lock its built-in functions.
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_depend d on d.objid = p.oid and d.deptype = 'e'
           join pg_extension e on e.oid = d.refobjid where e.extname = 'citext'
  loop execute format('grant execute on function %s to public', f.sig); end loop;
end $$;
