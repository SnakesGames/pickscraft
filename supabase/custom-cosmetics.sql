-- Pickscraft: lets admins add cosmetics made in Unity (Pickscraft > Make Cosmetic) to the shop. Safe to run more than once.

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

revoke execute on function public.admin_set_shop_item(text, text, text, int) from public, anon;
grant execute on function public.admin_set_shop_item(text, text, text, int) to authenticated;
