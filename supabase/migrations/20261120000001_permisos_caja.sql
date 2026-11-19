-- =============================================================================
-- Fase 11: permisos configurables por rol, comisiones por forma de pago y
-- validación de transferencias SPEI con el CEP de Banxico.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Permisos por rol. El administrador siempre tiene todo; para recepción y
--    odontólogos el admin decide qué módulos ven. Por defecto queda lo de siempre.
-- -----------------------------------------------------------------------------
create table public.role_permissions (
  role        public.app_role not null check (role <> 'admin'),
  permission  text not null check (permission in (
                'expediente', 'caja', 'whatsapp', 'inventario', 'laboratorio',
                'tablet', 'comisiones', 'reportes', 'finanzas')),
  allowed     boolean not null default false,
  updated_at  timestamptz not null default now(),
  primary key (role, permission)
);
create trigger role_permissions_updated_at before update on public.role_permissions
  for each row execute function public.set_updated_at();
create trigger role_permissions_audit after insert or update or delete on public.role_permissions
  for each row execute function public.audit_trigger('permission');

insert into public.role_permissions (role, permission, allowed) values
  ('reception', 'expediente', false), ('reception', 'caja', true), ('reception', 'whatsapp', true),
  ('reception', 'inventario', true), ('reception', 'laboratorio', true), ('reception', 'tablet', true),
  ('reception', 'comisiones', false), ('reception', 'reportes', false), ('reception', 'finanzas', false),
  ('dentist', 'expediente', false), ('dentist', 'caja', false), ('dentist', 'whatsapp', false),
  ('dentist', 'inventario', true), ('dentist', 'laboratorio', true), ('dentist', 'tablet', true),
  ('dentist', 'comisiones', true), ('dentist', 'reportes', false), ('dentist', 'finanzas', false);

alter table public.role_permissions enable row level security;
create policy role_permissions_select on public.role_permissions for select to authenticated using (public.is_staff());
create policy role_permissions_admin on public.role_permissions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
revoke all on public.role_permissions from anon;

create or replace function public.has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case public.current_app_role()
    when 'admin' then true
    else coalesce((
      select allowed from public.role_permissions
      where role = public.current_app_role() and permission = p_permission
    ), false)
  end
$$;
revoke all on function public.has_permission(text) from public, anon;
grant execute on function public.has_permission(text) to authenticated;

-- Expediente clínico: el odontólogo ve a sus pacientes; con el permiso
-- "expediente" ve a todos. Recepción sólo con el permiso (consulta e historia
-- clínica; odontograma y notas siguen siendo del odontólogo: can_write_clinical).
create or replace function public.can_access_clinical(p_patient_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case public.current_app_role()
    when 'admin' then true
    when 'dentist' then public.has_permission('expediente') or exists (
      select 1 from public.patient_care_team
      where patient_id = p_patient_id and dentist_id = auth.uid()
    )
    when 'reception' then public.has_permission('expediente')
    else false
  end
$$;

-- Caja: además de admin y recepción, quien tenga el permiso.
create policy payments_select_perm on public.payments for select to authenticated
  using (public.has_permission('caja') or public.has_permission('reportes') or public.has_permission('finanzas'));
create policy payments_insert_perm on public.payments for insert to authenticated
  with check (public.has_permission('caja') and received_by = auth.uid());
create policy payments_update_perm on public.payments for update to authenticated
  using (public.has_permission('caja')) with check (public.has_permission('caja'));

create policy cash_expenses_select_perm on public.cash_expenses for select to authenticated
  using (public.has_permission('caja') or public.has_permission('reportes') or public.has_permission('finanzas'));
create policy cash_expenses_insert_perm on public.cash_expenses for insert to authenticated
  with check (public.has_permission('caja') and created_by = auth.uid());
create policy cash_expenses_update_perm on public.cash_expenses for update to authenticated
  using (public.has_permission('caja')) with check (public.has_permission('caja'));

create policy cash_closures_select_perm on public.cash_closures for select to authenticated
  using (public.has_permission('caja'));
create policy cash_closures_insert_perm on public.cash_closures for insert to authenticated
  with check (public.has_permission('caja') and closed_by = auth.uid());

-- Reportes y finanzas (sólo lectura para quien no es admin).
create policy plans_select_perm on public.treatment_plans for select to authenticated
  using (public.has_permission('reportes') or public.has_permission('finanzas'));
create policy plan_items_select_perm on public.treatment_plan_items for select to authenticated
  using (public.has_permission('reportes') or public.has_permission('finanzas'));
create policy op_expenses_select_perm on public.expenses for select to authenticated
  using (public.has_permission('finanzas'));
create policy recurring_expenses_select_perm on public.recurring_expenses for select to authenticated
  using (public.has_permission('finanzas'));
create policy lab_order_costs_select_perm on public.lab_order_costs for select to authenticated
  using (public.has_permission('finanzas'));
create policy inventory_lot_costs_select_perm on public.inventory_lot_costs for select to authenticated
  using (public.has_permission('finanzas'));

-- Comisiones: el odontólogo ve las suyas; recepción con permiso y quien tenga
-- "finanzas" ven todas. Costo de laboratorio y porcentaje, sólo el admin.
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
      and (
        public.is_admin()
        or public.has_permission('finanzas')
        or (public.current_app_role() = 'reception' and public.has_permission('comisiones'))
        or (public.current_app_role() = 'dentist' and i.completed_by = auth.uid())
      )
  )
  select id, completed_by, completed_at, patient_id, patient_name, description, tooth, line_total,
         case when public.is_admin() then lab_cost end,
         case when public.is_admin() then pct end,
         round(greatest(0, line_total - lab_cost) * pct / 100, 2)
  from base
  order by completed_at
$$;

-- -----------------------------------------------------------------------------
-- 2. Comisión bancaria por forma de pago (terminal de tarjeta, etc.).
--    Se guarda en cada pago al registrarlo, así cambiar la tarifa no altera el pasado.
-- -----------------------------------------------------------------------------
create table public.payment_method_fees (
  method      public.payment_method primary key,
  pct         numeric(6,3) not null default 0 check (pct >= 0 and pct < 100),
  fixed_fee   numeric(10,2) not null default 0 check (fixed_fee >= 0),
  add_iva     boolean not null default true,   -- el banco cobra IVA (16 %) sobre la comisión
  updated_at  timestamptz not null default now()
);
create trigger payment_method_fees_updated_at before update on public.payment_method_fees
  for each row execute function public.set_updated_at();
create trigger payment_method_fees_audit after insert or update or delete on public.payment_method_fees
  for each row execute function public.audit_trigger('method');
insert into public.payment_method_fees (method, add_iva)
  select m, m in ('tarjeta_debito', 'tarjeta_credito') from unnest(enum_range(null::public.payment_method)) m;

alter table public.payment_method_fees enable row level security;
create policy payment_method_fees_select on public.payment_method_fees for select to authenticated using (public.is_staff());
create policy payment_method_fees_admin on public.payment_method_fees for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
revoke all on public.payment_method_fees from anon;

alter table public.payments add column fee numeric(12,2) not null default 0;

create or replace function public.payment_fee()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  f public.payment_method_fees;
begin
  if tg_op = 'UPDATE' then
    new.fee := old.fee;
    return new;
  end if;
  select * into f from public.payment_method_fees where method = new.method;
  if not found then
    new.fee := 0;
  else
    new.fee := round((new.amount * f.pct / 100 + f.fixed_fee) * case when f.add_iva then 1.16 else 1 end, 2);
  end if;
  return new;
end;
$$;
create trigger payments_fee before insert or update on public.payments
  for each row execute function public.payment_fee();

-- -----------------------------------------------------------------------------
-- 3. Transferencias SPEI: datos fijos de la cuenta receptora y bitácora de
--    validaciones contra el CEP de Banxico.
-- -----------------------------------------------------------------------------
create table public.spei_settings (
  id                 smallint primary key default 1 check (id = 1),
  receiver_bank_code text,      -- clave del banco receptor en el catálogo de Banxico
  receiver_bank_name text,
  clabe              text check (clabe is null or clabe ~ '^[0-9]{18}$'),
  holder             text,      -- titular de la cuenta (informativo)
  updated_at         timestamptz not null default now()
);
insert into public.spei_settings (id) values (1);
create trigger spei_settings_updated_at before update on public.spei_settings
  for each row execute function public.set_updated_at();
create trigger spei_settings_audit after insert or update or delete on public.spei_settings
  for each row execute function public.audit_trigger();

alter table public.spei_settings enable row level security;
create policy spei_settings_select on public.spei_settings for select to authenticated
  using (public.has_permission('caja') or public.current_app_role() = 'reception');
create policy spei_settings_update on public.spei_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
revoke all on public.spei_settings from anon;

create table public.spei_validations (
  id               uuid primary key default gen_random_uuid(),
  payment_id       uuid references public.payments (id) on delete set null,
  tracking_key     text not null check (length(trim(tracking_key)) > 0),
  operation_date   date not null,
  sender_bank_code text not null,
  sender_bank_name text,
  amount           numeric(12,2) not null check (amount > 0),
  receiver_bank_code text not null,
  clabe            text not null,
  found            boolean not null,
  valid            boolean not null,
  message          text not null,
  details          jsonb,
  validated_by     uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at       timestamptz not null default now()
);
create index spei_validations_payment_idx on public.spei_validations (payment_id, created_at desc);
create index spei_validations_created_idx on public.spei_validations (created_at desc);
create trigger spei_validations_audit after insert or update or delete on public.spei_validations
  for each row execute function public.audit_trigger();

alter table public.spei_validations enable row level security;
-- Bitácora inmutable: se consulta y se agrega, nunca se edita ni se borra.
create policy spei_validations_select on public.spei_validations for select to authenticated
  using (public.has_permission('caja') or public.current_app_role() = 'reception');
create policy spei_validations_insert on public.spei_validations for insert to authenticated
  with check ((public.has_permission('caja') or public.current_app_role() = 'reception') and validated_by = auth.uid());
revoke all on public.spei_validations from anon;
