-- =============================================================================
-- Fase 12: bot de WhatsApp.
--  * Doctor para pacientes de primera vez; los que ya tienen expediente siguen
--    con su doctor.
--  * Números de administrador: reciben alertas (stock, caducidades, laboratorio)
--    y pueden registrar entradas de inventario por WhatsApp.
-- =============================================================================

alter table public.whatsapp_settings
  add column first_visit_dentist_id uuid references public.profiles (id) on delete set null,
  add column keep_own_dentist boolean not null default true,
  add column admin_phones text[] not null default '{}',
  add column alerts_enabled boolean not null default true,
  add column alert_hour smallint not null default 9 check (alert_hour between 0 and 23);

alter table public.whatsapp_settings
  add constraint whatsapp_settings_admin_phones_check
  check (array_position(admin_phones, null) is null and cardinality(admin_phones) <= 5);

-- Alertas ya avisadas al administrador, para no repetirlas.
-- Cuando una alerta deja de existir (p. ej. se resurte el artículo) el bot borra
-- su renglón; si vuelve a aparecer se avisa de nuevo.
create table public.bot_admin_alerts (
  key           text primary key,          -- p. ej. "stock:<item_id>", "lab:<order_id>"
  message       text not null,
  first_sent_at timestamptz not null default now(),
  last_sent_at  timestamptz not null default now()
);
alter table public.bot_admin_alerts enable row level security;
create policy bot_admin_alerts_select on public.bot_admin_alerts for select to authenticated using (public.is_admin());
revoke all on public.bot_admin_alerts from anon;

-- Entrada de inventario hecha por el administrador desde WhatsApp. Sólo la llama
-- el bot (llave de servicio); queda a nombre del administrador cuyo teléfono escribió.
create or replace function public.bot_inventory_in(
  p_item uuid, p_qty numeric, p_actor uuid default null, p_lot text default null,
  p_expires date default null, p_cost numeric default null, p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lot uuid;
begin
  if p_qty is null or p_qty <= 0 then
    raise exception 'La cantidad debe ser mayor a cero';
  end if;
  if not exists (select 1 from public.inventory_items where id = p_item and active) then
    raise exception 'Artículo no encontrado';
  end if;
  if p_cost is not null and p_cost < 0 then
    raise exception 'Costo inválido';
  end if;
  insert into public.inventory_lots (item_id, lot_code, expires_on, received_qty, remaining, created_by)
  values (p_item, nullif(trim(p_lot), ''), p_expires, p_qty, p_qty, p_actor)
  returning id into v_lot;
  if p_cost is not null then
    insert into public.inventory_lot_costs (lot_id, unit_cost) values (v_lot, p_cost);
  end if;
  insert into public.inventory_movements (item_id, lot_id, kind, quantity, reason, created_by)
  values (p_item, v_lot, 'entrada', p_qty, coalesce(p_reason, 'Entrada por WhatsApp'), p_actor);
  return v_lot;
end;
$$;
revoke all on function public.bot_inventory_in(uuid, numeric, uuid, text, date, numeric, text) from public, anon, authenticated;
grant execute on function public.bot_inventory_in(uuid, numeric, uuid, text, date, numeric, text) to service_role;
