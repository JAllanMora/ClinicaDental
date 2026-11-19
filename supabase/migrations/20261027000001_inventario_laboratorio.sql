-- =============================================================================
-- Fase 7: inventario (lotes, caducidades, stock mínimo) y órdenes de laboratorio.
-- Las existencias sólo cambian por las funciones de entrada/salida, que dejan
-- un movimiento por lote (primero caduca, primero sale).
-- =============================================================================

create type public.inventory_move as enum ('entrada', 'salida', 'ajuste', 'merma');
create type public.lab_status as enum (
  'por_enviar', 'enviado', 'en_proceso', 'recibido', 'en_prueba', 'ajuste', 'entregado', 'cancelado'
);

-- -----------------------------------------------------------------------------
-- Inventario
-- -----------------------------------------------------------------------------
create table public.inventory_items (
  id          uuid primary key default gen_random_uuid(),
  branch_id   uuid not null references public.branches (id) on delete restrict,
  name        text not null,
  category    text not null default 'Consumibles',
  unit        text not null default 'pieza',
  sku         text,
  supplier    text,
  min_stock   numeric(12,2) not null default 0 check (min_stock >= 0),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (branch_id, name)
);

create table public.inventory_lots (
  id            uuid primary key default gen_random_uuid(),
  item_id       uuid not null references public.inventory_items (id) on delete restrict,
  lot_code      text,
  expires_on    date,
  received_qty  numeric(12,2) not null check (received_qty > 0),
  remaining     numeric(12,2) not null check (remaining >= 0),
  unit_cost     numeric(12,2) check (unit_cost >= 0),
  received_at   timestamptz not null default now(),
  created_by    uuid references public.profiles (id) on delete set null default auth.uid()
);
create index inventory_lots_item_idx on public.inventory_lots (item_id, expires_on nulls last) where remaining > 0;

create table public.inventory_movements (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references public.inventory_items (id) on delete restrict,
  lot_id      uuid references public.inventory_lots (id) on delete restrict,
  kind        public.inventory_move not null,
  quantity    numeric(12,2) not null check (quantity > 0),
  reason      text,
  patient_id  uuid references public.patients (id) on delete set null,
  created_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now()
);
create index inventory_movements_item_idx on public.inventory_movements (item_id, created_at desc);

create or replace view public.inventory_stock
with (security_invoker = true)
as
select
  i.id as item_id,
  coalesce(sum(l.remaining), 0)::numeric(12,2) as stock,
  min(l.expires_on) filter (where l.remaining > 0) as next_expiry,
  coalesce(sum(l.remaining) filter (where l.expires_on < current_date), 0)::numeric(12,2) as expired_qty
from public.inventory_items i
left join public.inventory_lots l on l.item_id = i.id
group by i.id;

create or replace function public.inventory_in(
  p_item uuid, p_qty numeric, p_lot text default null, p_expires date default null, p_cost numeric default null, p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lot uuid;
begin
  if not public.is_staff() then
    raise exception 'Sin permiso';
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'La cantidad debe ser mayor a cero';
  end if;
  if not exists (select 1 from public.inventory_items where id = p_item and active) then
    raise exception 'Artículo no encontrado';
  end if;
  insert into public.inventory_lots (item_id, lot_code, expires_on, received_qty, remaining, unit_cost, created_by)
  values (p_item, nullif(trim(p_lot), ''), p_expires, p_qty, p_qty, p_cost, auth.uid())
  returning id into v_lot;
  insert into public.inventory_movements (item_id, lot_id, kind, quantity, reason, created_by)
  values (p_item, v_lot, 'entrada', p_qty, p_reason, auth.uid());
  return v_lot;
end;
$$;

-- Salida, merma o ajuste negativo: descuenta primero de los lotes que caducan antes.
create or replace function public.inventory_out(
  p_item uuid, p_qty numeric, p_kind public.inventory_move default 'salida', p_reason text default null, p_patient uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_left numeric := p_qty;
  v_take numeric;
  r record;
begin
  if not public.is_staff() then
    raise exception 'Sin permiso';
  end if;
  if p_kind = 'entrada' then
    raise exception 'Usa inventory_in para entradas';
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'La cantidad debe ser mayor a cero';
  end if;
  if (select coalesce(sum(remaining), 0) from public.inventory_lots where item_id = p_item) < p_qty then
    raise exception 'No hay existencias suficientes';
  end if;
  for r in
    select id, remaining from public.inventory_lots
    where item_id = p_item and remaining > 0
    order by expires_on nulls last, received_at
    for update
  loop
    exit when v_left <= 0;
    v_take := least(r.remaining, v_left);
    update public.inventory_lots set remaining = remaining - v_take where id = r.id;
    insert into public.inventory_movements (item_id, lot_id, kind, quantity, reason, patient_id, created_by)
    values (p_item, r.id, p_kind, v_take, p_reason, p_patient, auth.uid());
    v_left := v_left - v_take;
  end loop;
end;
$$;

revoke all on function public.inventory_in(uuid, numeric, text, date, numeric, text) from public;
revoke all on function public.inventory_out(uuid, numeric, public.inventory_move, text, uuid) from public;
grant execute on function public.inventory_in(uuid, numeric, text, date, numeric, text) to authenticated;
grant execute on function public.inventory_out(uuid, numeric, public.inventory_move, text, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Laboratorio
-- -----------------------------------------------------------------------------
create table public.labs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  contact     text,
  phone       text,
  email       text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.lab_orders (
  id            uuid primary key default gen_random_uuid(),
  folio         integer generated always as identity unique,
  patient_id    uuid not null references public.patients (id) on delete restrict,
  dentist_id    uuid not null references public.profiles (id) on delete restrict,
  lab_id        uuid references public.labs (id) on delete set null,
  plan_item_id  uuid references public.treatment_plan_items (id) on delete set null,
  work_type     text not null,
  teeth         text,
  shade         text,
  instructions  text,
  status        public.lab_status not null default 'por_enviar',
  due_date      date,
  sent_at       timestamptz,
  received_at   timestamptz,
  delivered_at  timestamptz,
  cost          numeric(12,2) check (cost >= 0),
  notes         text,
  created_by    uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index lab_orders_status_idx on public.lab_orders (status, due_date);
create index lab_orders_patient_idx on public.lab_orders (patient_id);

create table public.lab_order_events (
  id          bigint generated always as identity primary key,
  order_id    uuid not null references public.lab_orders (id) on delete cascade,
  status      public.lab_status not null,
  note        text,
  created_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now()
);
create index lab_order_events_order_idx on public.lab_order_events (order_id, created_at);

create or replace function public.lab_order_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;
  insert into public.lab_order_events (order_id, status, created_by) values (new.id, new.status, auth.uid());
  return new;
end;
$$;

create or replace function public.lab_order_stamp()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    if new.status = 'enviado' and new.sent_at is null then new.sent_at := now(); end if;
    if new.status = 'recibido' and new.received_at is null then new.received_at := now(); end if;
    if new.status = 'entregado' and new.delivered_at is null then new.delivered_at := now(); end if;
  end if;
  return new;
end;
$$;

create trigger lab_orders_stamp before insert or update on public.lab_orders
  for each row execute function public.lab_order_stamp();
create trigger lab_orders_events after insert or update of status on public.lab_orders
  for each row execute function public.lab_order_status();

create trigger inventory_items_updated_at before update on public.inventory_items
  for each row execute function public.set_updated_at();
create trigger labs_updated_at before update on public.labs
  for each row execute function public.set_updated_at();
create trigger lab_orders_updated_at before update on public.lab_orders
  for each row execute function public.set_updated_at();

create trigger inventory_items_audit after insert or update or delete on public.inventory_items
  for each row execute function public.audit_trigger();
create trigger inventory_movements_audit after insert on public.inventory_movements
  for each row execute function public.audit_trigger();
create trigger labs_audit after insert or update or delete on public.labs
  for each row execute function public.audit_trigger();
create trigger lab_orders_audit after insert or update or delete on public.lab_orders
  for each row execute function public.audit_trigger();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.inventory_items enable row level security;
alter table public.inventory_lots enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.labs enable row level security;
alter table public.lab_orders enable row level security;
alter table public.lab_order_events enable row level security;

create policy inventory_items_select on public.inventory_items for select to authenticated using (public.is_staff());
create policy inventory_items_write on public.inventory_items for all to authenticated
  using (public.current_app_role() in ('admin', 'reception'))
  with check (public.current_app_role() in ('admin', 'reception'));
create policy inventory_lots_select on public.inventory_lots for select to authenticated using (public.is_staff());
create policy inventory_movements_select on public.inventory_movements for select to authenticated using (public.is_staff());
-- Lotes y movimientos sólo se escriben con inventory_in / inventory_out.

create policy labs_select on public.labs for select to authenticated using (public.is_staff());
create policy labs_admin on public.labs for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy lab_orders_select on public.lab_orders for select to authenticated
  using (public.current_app_role() in ('admin', 'reception') or public.can_access_clinical(patient_id));
create policy lab_orders_insert on public.lab_orders for insert to authenticated
  with check (
    public.current_app_role() in ('admin', 'reception')
    or (public.current_app_role() = 'dentist' and dentist_id = auth.uid() and public.can_write_clinical(patient_id))
  );
create policy lab_orders_update on public.lab_orders for update to authenticated
  using (public.current_app_role() in ('admin', 'reception') or dentist_id = auth.uid())
  with check (public.current_app_role() in ('admin', 'reception') or dentist_id = auth.uid());

create policy lab_order_events_select on public.lab_order_events for select to authenticated
  using (exists (select 1 from public.lab_orders o where o.id = order_id));
create policy lab_order_events_insert on public.lab_order_events for insert to authenticated
  with check (created_by = auth.uid() and exists (select 1 from public.lab_orders o where o.id = order_id));
