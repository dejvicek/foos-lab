-- Migrace 33 (21. 11. 2026): profilová fotka hráče. Malý výřez (160 × 160, WebP / JPEG) jako data URL přímo
-- u hráče – jde se soupiskou (changes_since, uložený stav v zařízení, záloha). Zapisuje se jen přes set_avatar:
-- hráč sobě, admin komukoli (*rozhodnutí uživatele*). Starší verze appky sloupec ignorují a při úpravě hráče
-- ho neposílají, takže ho nepřepíšou. Dá se spustit opakovaně.

alter table public.players add column if not exists avatar text;

create or replace function public.set_avatar(p_player uuid, p_image text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_admin() or p_player = public.current_player()) then
    raise exception 'Fotku může změnit jen hráč sám nebo admin' using errcode = '42501';
  end if;
  if p_image is not null and (length(p_image) > 20000
      or not (p_image like 'data:image/webp;base64,%' or p_image like 'data:image/jpeg;base64,%')) then
    raise exception 'Fotka musí být malý obrázek WebP nebo JPEG' using errcode = '22023';
  end if;
  update public.players set avatar = p_image, updated_at = now() where id = p_player;
end $$;

revoke execute on function public.set_avatar(uuid, text) from public, anon;
grant execute on function public.set_avatar(uuid, text) to authenticated;
