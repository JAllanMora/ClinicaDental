-- =============================================================================
-- Fase 6: presupuestos, pagos, saldos, corte de caja y comisiones (sin CFDI).
-- Los movimientos de dinero no se borran: se cancelan con motivo y quedan en
-- la bitácora. Un día con corte de caja cerrado ya no admite cambios.
-- =============================================================================

create type public.plan_status as enum ('borrador', 'presentado', 'aceptado', 'rechazado', 'terminado', 'cancelado');
create type public.plan_item_status as enum ('pendiente', 'realizado', 'cancelado');
create type public.payment_method as enum ('efectivo', 'tarjeta_debito', 'tarjeta_credito', 'transferencia', 'otro');

alter table public.profiles
  add column commission_pct numeric(5,2) not null default 0 check (commission_pct between 0 and 100);

-- Sólo un administrador cambia rol, estado, correo o comisión.
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
       or new.email is distinct from old.email
       or new.commission_pct is distinct from old.commission_pct then
      raise exception 'Sólo un administrador puede cambiar rol, estado, correo o comisión';
    end if;
  end if;
  return new;
end;
$$;

-- Día contable en hora de la clínica (centro de México, sin horario de verano).
create or replace function public.clinic_day(ts timestamptz)
returns date
language sql
immutable
as $$
  select (ts at time zone 'America/Mexico_City')::date
$$;

-- -----------------------------------------------------------------------------
-- Aranceles (lista de precios)
-- -----------------------------------------------------------------------------
create table public.treatments (
  id              uuid primary key default gen_random_uuid(),
  name            text not null unique,
  category        text not null default 'General',
  price           numeric(12,2) not null check (price >= 0),
  commission_pct  numeric(5,2) check (commission_pct between 0 and 100),  -- si es nulo se usa el del odontólogo
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Presupuestos / planes de tratamiento
-- -----------------------------------------------------------------------------
create table public.treatment_plans (
  id           uuid primary key default gen_random_uuid(),
  folio        integer generated always as identity unique,
  patient_id   uuid not null references public.patients (id) on delete restrict,
  dentist_id   uuid references public.profiles (id) on delete set null,
  title        text not null default 'Plan de tratamiento',
  status       public.plan_status not null default 'borrador',
  valid_until  date,
  notes        text,
  accepted_at  timestamptz,
  created_by   uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index treatment_plans_patient_idx on public.treatment_plans (patient_id, created_at desc);

create table public.treatment_plan_items (
  id             uuid primary key default gen_random_uuid(),
  plan_id        uuid not null references public.treatment_plans (id) on delete cascade,
  treatment_id   uuid references public.treatments (id) on delete set null,
  description    text not null,
  tooth          smallint check (tooth is null or tooth between 11 and 85),
  phase          smallint not null default 1 check (phase between 1 and 9),
  quantity       integer not null default 1 check (quantity between 1 and 99),
  unit_price     numeric(12,2) not null check (unit_price >= 0),
  discount_pct   numeric(5,2) not null default 0 check (discount_pct between 0 and 100),
  line_total     numeric(12,2) generated always as (round(quantity * unit_price * (1 - discount_pct / 100), 2)) stored,
  status         public.plan_item_status not null default 'pendiente',
  completed_at   timestamptz,
  completed_by   uuid references public.profiles (id) on delete set null,
  sort           integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index treatment_plan_items_plan_idx on public.treatment_plan_items (plan_id, sort);
create index treatment_plan_items_done_idx on public.treatment_plan_items (completed_by, completed_at) where status = 'realizado';

-- -----------------------------------------------------------------------------
-- Pagos (abonos) y egresos de caja
-- -----------------------------------------------------------------------------
create table public.payments (
  id           uuid primary key default gen_random_uuid(),
  folio        integer generated always as identity unique,
  patient_id   uuid not null references public.patients (id) on delete restrict,
  plan_id      uuid references public.treatment_plans (id) on delete set null,
  branch_id    uuid not null references public.branches (id) on delete restrict,
  amount       numeric(12,2) not null check (amount > 0),
  method       public.payment_method not null,
  reference    text,
  notes        text,
  received_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  received_at  timestamptz not null default now(),
  voided       boolean not null default false,
  void_reason  text,
  voided_by    uuid references public.profiles (id) on delete set null,
  voided_at    timestamptz,
  check (not voided or void_reason is not null)
);
create index payments_patient_idx on public.payments (patient_id, received_at desc);
create index payments_day_idx on public.payments (branch_id, public.clinic_day(received_at));

create table public.cash_expenses (
  id           uuid primary key default gen_random_uuid(),
  branch_id    uuid not null references public.branches (id) on delete restrict,
  amount       numeric(12,2) not null check (amount > 0),
  concept      text not null,
  method       public.payment_method not null default 'efectivo',
  created_by   uuid references public.profiles (id) on delete set null default auth.uid(),
  spent_at     timestamptz not null default now(),
  voided       boolean not null default false,
  void_reason  text,
  check (not voided or void_reason is not null)
);
create index cash_expenses_day_idx on public.cash_expenses (branch_id, public.clinic_day(spent_at));

-- Corte de caja: una vez cerrado el día queda fijo.
create table public.cash_closures (
  id                uuid primary key default gen_random_uuid(),
  branch_id         uuid not null references public.branches (id) on delete restrict,
  day               date not null,
  opening_cash      numeric(12,2) not null default 0 check (opening_cash >= 0),
  totals            jsonb not null,           -- totales por forma de pago al momento del corte
  expected_cash     numeric(12,2) not null,
  counted_cash      numeric(12,2) not null check (counted_cash >= 0),
  difference        numeric(12,2) generated always as (counted_cash - expected_cash) stored,
  notes             text,
  closed_by         uuid references public.profiles (id) on delete set null default auth.uid(),
  closed_at         timestamptz not null default now(),
  unique (branch_id, day)
);

-- -----------------------------------------------------------------------------
-- Funciones y triggers
-- -----------------------------------------------------------------------------
create or replace function public.day_is_closed(p_branch uuid, p_day date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.cash_closures where branch_id = p_branch and day = p_day)
$$;

-- Pagos: sólo se puede cancelar (con motivo) y nunca en un día ya cerrado.
create or replace function public.protect_payment()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if public.day_is_closed(new.branch_id, public.clinic_day(new.received_at)) then
      raise exception 'El corte de caja de ese día ya está cerrado';
    end if;
    new.voided := false;
    new.voided_by := null;
    new.voided_at := null;
    return new;
  end if;
  if old.voided then
    raise exception 'El pago ya está cancelado';
  end if;
  if public.day_is_closed(old.branch_id, public.clinic_day(old.received_at)) then
    raise exception 'El corte de caja de ese día ya está cerrado';
  end if;
  if (new.patient_id, new.plan_id, new.branch_id, new.amount, new.method, new.received_at, new.received_by)
     is distinct from (old.patient_id, old.plan_id, old.branch_id, old.amount, old.method, old.received_at, old.received_by) then
    raise exception 'Un pago no se modifica: cancélalo y registra uno nuevo';
  end if;
  if new.voided then
    new.voided_by := auth.uid();
    new.voided_at := now();
  end if;
  return new;
end;
$$;

create trigger payments_protect before insert or update on public.payments
  for each row execute function public.protect_payment();

create or replace function public.protect_expense()
returns trigger
language plpgsql
as $$
begin
  if public.day_is_closed(coalesce(new.branch_id, old.branch_id), public.clinic_day(coalesce(old.spent_at, new.spent_at))) then
    raise exception 'El corte de caja de ese día ya está cerrado';
  end if;
  if tg_op = 'UPDATE' and (old.voided or (new.amount, new.concept, new.method, new.spent_at, new.branch_id)
     is distinct from (old.amount, old.concept, old.method, old.spent_at, old.branch_id)) then
    raise exception 'Un egreso sólo se puede cancelar';
  end if;
  return new;
end;
$$;

create trigger cash_expenses_protect before insert or update on public.cash_expenses
  for each row execute function public.protect_expense();

-- Partidas: al marcarse realizadas registran quién y cuándo; ya realizadas no cambian de precio.
create or replace function public.plan_item_status_change()
returns trigger
language plpgsql
as $$
declare
  v_dentist uuid;
begin
  if tg_op = 'UPDATE' and old.status = 'realizado' then
    if new.status <> 'realizado' and public.current_app_role() <> 'admin' then
      raise exception 'Sólo un administrador puede revertir un tratamiento realizado';
    end if;
    if (new.quantity, new.unit_price, new.discount_pct) is distinct from (old.quantity, old.unit_price, old.discount_pct) then
      raise exception 'No se cambia el precio de un tratamiento realizado';
    end if;
  end if;
  if new.status = 'realizado' and (tg_op = 'INSERT' or old.status <> 'realizado') then
    if public.current_app_role() not in ('admin', 'dentist') then
      raise exception 'Sólo el odontólogo o el administrador marcan tratamientos realizados';
    end if;
    select dentist_id into v_dentist from public.treatment_plans where id = new.plan_id;
    new.completed_at := coalesce(new.completed_at, now());
    new.completed_by := case when public.current_app_role() = 'dentist' then auth.uid()
                             else coalesce(new.completed_by, v_dentist) end;
  elsif new.status <> 'realizado' then
    new.completed_at := null;
    new.completed_by := null;
  end if;
  return new;
end;
$$;

create trigger treatment_plan_items_status before insert or update on public.treatment_plan_items
  for each row execute function public.plan_item_status_change();

create or replace function public.plan_status_change()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'aceptado' and old.status is distinct from 'aceptado' then
    new.accepted_at := now();
  end if;
  return new;
end;
$$;

create trigger treatment_plans_status before update on public.treatment_plans
  for each row execute function public.plan_status_change();

-- El odontólogo del presupuesto entra al equipo de atención del paciente.
create or replace function public.plan_care_team()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.dentist_id is not null then
    insert into public.patient_care_team (patient_id, dentist_id)
    values (new.patient_id, new.dentist_id)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger treatment_plans_care_team after insert or update of dentist_id on public.treatment_plans
  for each row execute function public.plan_care_team();

create trigger treatments_updated_at before update on public.treatments
  for each row execute function public.set_updated_at();
create trigger treatment_plans_updated_at before update on public.treatment_plans
  for each row execute function public.set_updated_at();
create trigger treatment_plan_items_updated_at before update on public.treatment_plan_items
  for each row execute function public.set_updated_at();

create trigger treatments_audit after insert or update or delete on public.treatments
  for each row execute function public.audit_trigger();
create trigger treatment_plans_audit after insert or update or delete on public.treatment_plans
  for each row execute function public.audit_trigger();
create trigger treatment_plan_items_audit after insert or update or delete on public.treatment_plan_items
  for each row execute function public.audit_trigger();
create trigger payments_audit after insert or update or delete on public.payments
  for each row execute function public.audit_trigger();
create trigger cash_expenses_audit after insert or update or delete on public.cash_expenses
  for each row execute function public.audit_trigger();
create trigger cash_closures_audit after insert or update or delete on public.cash_closures
  for each row execute function public.audit_trigger();

-- -----------------------------------------------------------------------------
-- Saldos: cargos = tratamientos realizados; abonos = pagos no cancelados.
-- -----------------------------------------------------------------------------
create or replace view public.patient_balances
with (security_invoker = true)
as
select
  p.id as patient_id,
  coalesce(c.charged, 0)::numeric(12,2) as charged,
  coalesce(pay.paid, 0)::numeric(12,2) as paid,
  (coalesce(c.charged, 0) - coalesce(pay.paid, 0))::numeric(12,2) as balance,
  coalesce(q.pending, 0)::numeric(12,2) as pending_treatment
from public.patients p
left join (
  select tp.patient_id, sum(i.line_total) as charged
  from public.treatment_plan_items i
  join public.treatment_plans tp on tp.id = i.plan_id
  where i.status = 'realizado'
  group by tp.patient_id
) c on c.patient_id = p.id
left join (
  select tp.patient_id, sum(i.line_total) as pending
  from public.treatment_plan_items i
  join public.treatment_plans tp on tp.id = i.plan_id
  where i.status = 'pendiente' and tp.status = 'aceptado'
  group by tp.patient_id
) q on q.patient_id = p.id
left join (
  select patient_id, sum(amount) as paid from public.payments where not voided group by patient_id
) pay on pay.patient_id = p.id;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.treatments enable row level security;
alter table public.treatment_plans enable row level security;
alter table public.treatment_plan_items enable row level security;
alter table public.payments enable row level security;
alter table public.cash_expenses enable row level security;
alter table public.cash_closures enable row level security;

create policy treatments_select on public.treatments for select to authenticated using (public.is_staff());
create policy treatments_admin on public.treatments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Presupuestos: recepción y admin todos; el odontólogo, los de sus pacientes.
create or replace function public.can_manage_plan(p_patient_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_app_role() in ('admin', 'reception') or public.can_write_clinical(p_patient_id)
$$;

create policy plans_select on public.treatment_plans for select to authenticated
  using (public.can_manage_plan(patient_id));
create policy plans_insert on public.treatment_plans for insert to authenticated
  with check (public.can_manage_plan(patient_id));
create policy plans_update on public.treatment_plans for update to authenticated
  using (public.can_manage_plan(patient_id)) with check (public.can_manage_plan(patient_id));

create policy plan_items_select on public.treatment_plan_items for select to authenticated
  using (exists (select 1 from public.treatment_plans tp where tp.id = plan_id and public.can_manage_plan(tp.patient_id)));
create policy plan_items_insert on public.treatment_plan_items for insert to authenticated
  with check (exists (select 1 from public.treatment_plans tp where tp.id = plan_id and public.can_manage_plan(tp.patient_id)));
create policy plan_items_update on public.treatment_plan_items for update to authenticated
  using (exists (select 1 from public.treatment_plans tp where tp.id = plan_id and public.can_manage_plan(tp.patient_id)))
  with check (exists (select 1 from public.treatment_plans tp where tp.id = plan_id and public.can_manage_plan(tp.patient_id)));
-- Sólo se borran partidas pendientes de presupuestos en borrador.
create policy plan_items_delete on public.treatment_plan_items for delete to authenticated
  using (
    status = 'pendiente'
    and exists (
      select 1 from public.treatment_plans tp
      where tp.id = plan_id and tp.status = 'borrador' and public.can_manage_plan(tp.patient_id)
    )
  );

-- Dinero: lo manejan recepción y admin; el odontólogo ve los pagos de sus pacientes.
create policy payments_select on public.payments for select to authenticated
  using (public.current_app_role() in ('admin', 'reception') or public.can_access_clinical(patient_id));
create policy payments_insert on public.payments for insert to authenticated
  with check (public.current_app_role() in ('admin', 'reception') and received_by = auth.uid());
create policy payments_update on public.payments for update to authenticated
  using (public.current_app_role() in ('admin', 'reception'))
  with check (public.current_app_role() in ('admin', 'reception'));

create policy expenses_select on public.cash_expenses for select to authenticated
  using (public.current_app_role() in ('admin', 'reception'));
create policy expenses_insert on public.cash_expenses for insert to authenticated
  with check (public.current_app_role() in ('admin', 'reception') and created_by = auth.uid());
create policy expenses_update on public.cash_expenses for update to authenticated
  using (public.current_app_role() in ('admin', 'reception'))
  with check (public.current_app_role() in ('admin', 'reception'));

create policy closures_select on public.cash_closures for select to authenticated
  using (public.current_app_role() in ('admin', 'reception'));
create policy closures_insert on public.cash_closures for insert to authenticated
  with check (public.current_app_role() in ('admin', 'reception') and closed_by = auth.uid());

-- -----------------------------------------------------------------------------
-- Aranceles iniciales (precios de referencia en MXN; edítalos en Configuración)
-- -----------------------------------------------------------------------------
insert into public.treatments (name, category, price) values
  ('Consulta de valoración', 'Diagnóstico', 300),
  ('Radiografía periapical', 'Diagnóstico', 150),
  ('Radiografía panorámica', 'Diagnóstico', 450),
  ('Limpieza dental (profilaxis)', 'Prevención', 600),
  ('Aplicación de flúor', 'Prevención', 250),
  ('Sellador de fosetas y fisuras', 'Prevención', 350),
  ('Resina (1 superficie)', 'Operatoria', 800),
  ('Resina (2 o más superficies)', 'Operatoria', 1100),
  ('Incrustación', 'Operatoria', 3500),
  ('Endodoncia unirradicular', 'Endodoncia', 3200),
  ('Endodoncia birradicular', 'Endodoncia', 3800),
  ('Endodoncia multirradicular', 'Endodoncia', 4500),
  ('Raspado y alisado por cuadrante', 'Periodoncia', 1200),
  ('Extracción simple', 'Cirugía', 700),
  ('Extracción de tercer molar', 'Cirugía', 2500),
  ('Corona de zirconia', 'Prótesis', 6500),
  ('Corona metal-porcelana', 'Prótesis', 4500),
  ('Poste de fibra de vidrio', 'Prótesis', 1200),
  ('Prótesis total (por arcada)', 'Prótesis', 7000),
  ('Implante dental (fase quirúrgica)', 'Implantes', 14000),
  ('Pulpotomía (dentición temporal)', 'Odontopediatría', 900),
  ('Corona de acero (dentición temporal)', 'Odontopediatría', 1100),
  ('Blanqueamiento en consultorio', 'Estética', 3500),
  ('Control de ortodoncia (mensualidad)', 'Ortodoncia', 700);
