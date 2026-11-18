-- =============================================================================
-- Fase 10: doctores por tipo de cita, costos y comisiones sólo para el admin,
-- gastos de operación y estado de resultados.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Qué odontólogos atienden cada tipo de cita (sin filas = cualquiera).
-- -----------------------------------------------------------------------------
create table public.appointment_type_dentists (
  type_id    uuid not null references public.appointment_types (id) on delete cascade,
  dentist_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (type_id, dentist_id)
);
create index appointment_type_dentists_dentist_idx on public.appointment_type_dentists (dentist_id);

create trigger appointment_type_dentists_audit after insert or update or delete on public.appointment_type_dentists
  for each row execute function public.audit_trigger('type_id');

alter table public.appointment_type_dentists enable row level security;
create policy appointment_type_dentists_select on public.appointment_type_dentists for select to authenticated using (public.is_staff());
create policy appointment_type_dentists_admin on public.appointment_type_dentists for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- El bot pregunta con qué doctor cuando hay más de uno para ese tipo de cita.
alter table public.whatsapp_settings add column ask_dentist boolean not null default true;

-- Horarios libres: ahora también filtra por los doctores del tipo de cita.
drop function public.available_slots(integer, timestamptz, timestamptz, uuid, uuid);
create function public.available_slots(
  p_duration  integer,
  p_from      timestamptz,
  p_to        timestamptz,
  p_dentist   uuid default null,
  p_prefer    uuid default null,
  p_type      uuid default null
)
returns table (starts_at timestamptz, ends_at timestamptz, dentist_id uuid, dentist_name text, chair_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  with days as (
    select d::date as day
    from generate_series((p_from at time zone 'America/Mexico_City')::date,
                         (p_to at time zone 'America/Mexico_City')::date, interval '1 day') d
  ),
  ranges as (
    select d.id as dentist_id, d.full_name as dentist_name, c.id as chair_id,
      ((days.day + w.starts)::text || '-06')::timestamptz as open_at,
      ((days.day + w.ends)::text || '-06')::timestamptz as close_at
    from days
    join public.working_hours w on w.weekday = extract(dow from days.day)
    join public.profiles d on d.id = w.dentist_id
    cross join public.chairs c
    join public.branches b on b.id = c.branch_id
    where d.role = 'dentist' and d.active and c.active and b.active
      and (p_dentist is null or d.id = p_dentist)
      and (d.branch_id is null or d.branch_id = c.branch_id)
      and (
        p_type is null
        or not exists (select 1 from public.appointment_type_dentists x where x.type_id = p_type)
        or exists (select 1 from public.appointment_type_dentists x where x.type_id = p_type and x.dentist_id = d.id)
      )
  ),
  candidates as (
    select s as starts_at, s + make_interval(mins => p_duration) as ends_at,
           ranges.dentist_id, ranges.dentist_name, ranges.chair_id
    from ranges,
         generate_series(ranges.open_at, ranges.close_at - make_interval(mins => p_duration), interval '15 minutes') s
    where s >= p_from and s < p_to
  )
  select distinct on (c.starts_at) c.starts_at, c.ends_at, c.dentist_id, c.dentist_name, c.chair_id
  from candidates c
  where not exists (
      select 1 from public.appointments a
      where a.status not in ('cancelada', 'no_asistio')
        and (a.dentist_id = c.dentist_id or a.chair_id = c.chair_id)
        and tstzrange(a.starts_at, a.ends_at) && tstzrange(c.starts_at, c.ends_at)
    )
    and not exists (
      select 1 from public.schedule_blocks b
      where (b.dentist_id = c.dentist_id or b.chair_id = c.chair_id)
        and tstzrange(b.starts_at, b.ends_at) && tstzrange(c.starts_at, c.ends_at)
    )
  order by c.starts_at, (c.dentist_id = p_prefer) desc nulls last, c.dentist_name, c.chair_id
$$;
revoke all on function public.available_slots(integer, timestamptz, timestamptz, uuid, uuid, uuid) from public, anon;
grant execute on function public.available_slots(integer, timestamptz, timestamptz, uuid, uuid, uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. Comisiones: reglas que sólo ve y edita el administrador.
--    Prioridad: odontólogo + tratamiento > tratamiento > odontólogo.
-- -----------------------------------------------------------------------------
create table public.commission_rates (
  id           uuid primary key default gen_random_uuid(),
  dentist_id   uuid references public.profiles (id) on delete cascade,
  treatment_id uuid references public.treatments (id) on delete cascade,
  pct          numeric(5,2) not null check (pct between 0 and 100),
  updated_at   timestamptz not null default now(),
  check (dentist_id is not null or treatment_id is not null),
  unique nulls not distinct (dentist_id, treatment_id)
);
create trigger commission_rates_updated_at before update on public.commission_rates
  for each row execute function public.set_updated_at();
create trigger commission_rates_audit after insert or update or delete on public.commission_rates
  for each row execute function public.audit_trigger();
alter table public.commission_rates enable row level security;
create policy commission_rates_admin on public.commission_rates for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

insert into public.commission_rates (dentist_id, pct)
  select id, commission_pct from public.profiles where role = 'dentist' and commission_pct > 0;
insert into public.commission_rates (treatment_id, pct)
  select id, commission_pct from public.treatments where commission_pct is not null;

-- El trigger de perfiles ya no revisa la comisión (la columna se va).
create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.role is distinct from old.role
       or new.active is distinct from old.active
       or new.email is distinct from old.email then
      raise exception 'Sólo un administrador puede cambiar rol, estado o correo';
    end if;
  end if;
  return new;
end;
$$;
alter table public.profiles drop column commission_pct;
alter table public.treatments drop column commission_pct;

create or replace function public.commission_pct_for(p_dentist uuid, p_treatment uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select pct from public.commission_rates where dentist_id = p_dentist and treatment_id = p_treatment),
    (select pct from public.commission_rates where dentist_id is null and treatment_id = p_treatment),
    (select pct from public.commission_rates where dentist_id = p_dentist and treatment_id is null),
    0
  )
$$;
revoke all on function public.commission_pct_for(uuid, uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Costos reales: sólo el administrador los ve y los captura.
-- -----------------------------------------------------------------------------
create table public.lab_order_costs (
  order_id   uuid primary key references public.lab_orders (id) on delete cascade,
  cost       numeric(12,2) not null check (cost >= 0),
  updated_at timestamptz not null default now()
);
create trigger lab_order_costs_updated_at before update on public.lab_order_costs
  for each row execute function public.set_updated_at();
create trigger lab_order_costs_audit after insert or update or delete on public.lab_order_costs
  for each row execute function public.audit_trigger('order_id');
alter table public.lab_order_costs enable row level security;
create policy lab_order_costs_admin on public.lab_order_costs for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
insert into public.lab_order_costs (order_id, cost) select id, cost from public.lab_orders where cost is not null;
alter table public.lab_orders drop column cost;

create table public.inventory_lot_costs (
  lot_id     uuid primary key references public.inventory_lots (id) on delete cascade,
  unit_cost  numeric(12,2) not null check (unit_cost >= 0),
  updated_at timestamptz not null default now()
);
create trigger inventory_lot_costs_updated_at before update on public.inventory_lot_costs
  for each row execute function public.set_updated_at();
create trigger inventory_lot_costs_audit after insert or update or delete on public.inventory_lot_costs
  for each row execute function public.audit_trigger('lot_id');
alter table public.inventory_lot_costs enable row level security;
create policy inventory_lot_costs_admin on public.inventory_lot_costs for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
insert into public.inventory_lot_costs (lot_id, unit_cost) select id, unit_cost from public.inventory_lots where unit_cost is not null;
alter table public.inventory_lots drop column unit_cost;

-- Entrada de inventario: el costo sólo se guarda si lo captura un administrador.
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
  insert into public.inventory_lots (item_id, lot_code, expires_on, received_qty, remaining, created_by)
  values (p_item, nullif(trim(p_lot), ''), p_expires, p_qty, p_qty, auth.uid())
  returning id into v_lot;
  if p_cost is not null and public.is_admin() then
    insert into public.inventory_lot_costs (lot_id, unit_cost) values (v_lot, p_cost);
  end if;
  insert into public.inventory_movements (item_id, lot_id, kind, quantity, reason, created_by)
  values (p_item, v_lot, 'entrada', p_qty, p_reason, auth.uid());
  return v_lot;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Reporte de comisiones. El admin ve todo (costo de laboratorio y %);
--    el odontólogo sólo sus tratamientos y cuánto le toca.
-- -----------------------------------------------------------------------------
create or replace function public.commission_report(p_from timestamptz, p_to timestamptz)
returns table (
  item_id uuid, dentist_id uuid, completed_at timestamptz, patient_id uuid, patient_name text,
  description text, tooth text, line_total numeric, lab_cost numeric, pct numeric, commission numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select i.id, i.completed_by, i.completed_at, p.id as patient_id,
           concat_ws(' ', p.first_name, p.last_name, p.second_last_name) as patient_name,
           i.description, i.tooth::text as tooth, i.line_total,
           coalesce((select sum(c.cost) from public.lab_orders o join public.lab_order_costs c on c.order_id = o.id
                     where o.plan_item_id = i.id and o.status <> 'cancelado'), 0) as lab_cost,
           public.commission_pct_for(i.completed_by, i.treatment_id) as pct
    from public.treatment_plan_items i
    join public.treatment_plans pl on pl.id = i.plan_id
    join public.patients p on p.id = pl.patient_id
    where i.status = 'realizado' and i.completed_at >= p_from and i.completed_at < p_to
      and (public.is_admin() or (public.current_app_role() = 'dentist' and i.completed_by = auth.uid()))
  )
  select id, completed_by, completed_at, patient_id, patient_name, description, tooth, line_total,
         case when public.is_admin() then lab_cost end,
         case when public.is_admin() then pct end,
         round(greatest(0, line_total - lab_cost) * pct / 100, 2)
  from base
  order by completed_at
$$;
revoke all on function public.commission_report(timestamptz, timestamptz) from public, anon;
grant execute on function public.commission_report(timestamptz, timestamptz) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Gastos de operación (renta, servicios, nómina…) y gastos fijos mensuales.
-- -----------------------------------------------------------------------------
create table public.recurring_expenses (
  id           uuid primary key default gen_random_uuid(),
  category     text not null,
  concept      text not null check (length(trim(concept)) > 0),
  amount       numeric(12,2) not null check (amount > 0),
  day_of_month smallint not null default 1 check (day_of_month between 1 and 28),
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger recurring_expenses_updated_at before update on public.recurring_expenses
  for each row execute function public.set_updated_at();
create trigger recurring_expenses_audit after insert or update or delete on public.recurring_expenses
  for each row execute function public.audit_trigger();

create table public.expenses (
  id           uuid primary key default gen_random_uuid(),
  spent_on     date not null default public.clinic_day(now()),
  category     text not null,
  concept      text not null check (length(trim(concept)) > 0),
  amount       numeric(12,2) not null check (amount > 0),
  method       public.payment_method not null default 'transferencia',
  supplier     text,
  notes        text,
  recurring_id uuid references public.recurring_expenses (id) on delete set null,
  created_by   uuid references public.profiles (id) default auth.uid(),
  created_at   timestamptz not null default now(),
  voided       boolean not null default false,
  void_reason  text,
  check (not voided or length(trim(coalesce(void_reason, ''))) > 0)
);
create index expenses_spent_on_idx on public.expenses (spent_on);
create unique index expenses_recurring_month_idx on public.expenses (recurring_id, date_trunc('month', spent_on::timestamp))
  where recurring_id is not null and not voided;
create trigger expenses_audit after insert or update or delete on public.expenses
  for each row execute function public.audit_trigger();

-- Un gasto no se borra ni se edita: se anula con motivo.
create or replace function public.protect_operating_expense()
returns trigger
language plpgsql
as $$
begin
  if old.voided then
    raise exception 'El gasto ya está anulado';
  end if;
  if (to_jsonb(new) - 'voided' - 'void_reason') is distinct from (to_jsonb(old) - 'voided' - 'void_reason') then
    raise exception 'Un gasto no se edita; anúlalo y regístralo de nuevo';
  end if;
  return new;
end;
$$;
create trigger expenses_protect before update on public.expenses
  for each row execute function public.protect_operating_expense();

alter table public.recurring_expenses enable row level security;
alter table public.expenses enable row level security;
create policy recurring_expenses_admin on public.recurring_expenses for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy expenses_select on public.expenses for select to authenticated using (public.is_admin());
create policy expenses_insert on public.expenses for insert to authenticated with check (public.is_admin());
create policy expenses_update on public.expenses for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Registra los gastos fijos del mes que aún no estén capturados.
create or replace function public.apply_recurring_expenses(p_month date)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_count integer;
begin
  if not public.is_admin() then
    raise exception 'Sin permiso';
  end if;
  insert into public.expenses (spent_on, category, concept, amount, recurring_id)
  select (date_trunc('month', p_month) + make_interval(days => r.day_of_month - 1))::date, r.category, r.concept, r.amount, r.id
  from public.recurring_expenses r
  where r.active
    and not exists (
      select 1 from public.expenses e
      where e.recurring_id = r.id and not e.voided
        and date_trunc('month', e.spent_on::timestamp) = date_trunc('month', p_month::timestamp)
    );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.apply_recurring_expenses(date) from public, anon;
grant execute on function public.apply_recurring_expenses(date) to authenticated;
