-- =============================================================================
-- WhatsApp: botón «Conectar» en la app.
--  * bot_seen_at: latido del programa del bot (aunque WhatsApp no esté vinculado).
--    Si lleva más de ~2 minutos sin latir, la computadora del bot está apagada.
--  * connect_requested_at: la app pide al bot que se conecte (o muestre el QR).
-- =============================================================================

alter table public.whatsapp_status
  add column bot_seen_at timestamptz,
  add column connect_requested_at timestamptz;

create or replace function public.request_whatsapp_connect()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.is_staff() and public.has_permission('whatsapp')) then
    raise exception 'Sin permiso para conectar WhatsApp';
  end if;
  update public.whatsapp_status set connect_requested_at = now(), updated_at = now() where id;
end;
$$;
revoke all on function public.request_whatsapp_connect() from public, anon;
grant execute on function public.request_whatsapp_connect() to authenticated;
