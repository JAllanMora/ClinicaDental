-- =============================================================================
-- Clínica Dental Villa San Juan — Fase 1: base del sistema
-- Roles, sucursales, sillones, perfiles, pacientes, anamnesis y bitácora.
-- =============================================================================

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- -----------------------------------------------------------------------------
-- Tipos
-- -----------------------------------------------------------------------------
create type public.app_role as enum ('admin', 'dentist', 'reception');
create type public.sex as enum ('F', 'M', 'X');

-- -----------------------------------------------------------------------------
-- Utilidades
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Sucursales y sillones
-- -----------------------------------------------------------------------------
create table public.branches (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  address     text,
  phone       text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.chairs (
  id          uuid primary key default gen_random_uuid(),
  branch_id   uuid not null references public.branches (id) on delete restrict,
  name        text not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (branch_id, name)
);

-- -----------------------------------------------------------------------------
-- Perfiles de usuario (1:1 con auth.users)
-- -----------------------------------------------------------------------------
create table public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  full_name         text not null default '',
  email             text,
  role              public.app_role not null default 'reception',
  specialty         text,
  professional_id   text,            -- cédula profesional (NOM-004)
  phone             text,
  color             text not null default '#A0449A',  -- color en la agenda
  branch_id         uuid references public.branches (id) on delete set null,
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Funciones de autorización (security definer para evitar recursión en RLS)
-- -----------------------------------------------------------------------------
create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and active
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_app_role() = 'admin', false)
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_app_role() is not null
$$;

-- -----------------------------------------------------------------------------
-- Pacientes
-- -----------------------------------------------------------------------------
create table public.patients (
  id                      uuid primary key default gen_random_uuid(),
  record_number           bigint generated always as identity unique,  -- núm. de expediente
  first_name              text not null,
  last_name               text not null,
  second_last_name        text,
  birth_date              date,
  sex                     public.sex,
  curp                    text,
  phone                   text,
  email                   text,
  address                 text,
  occupation              text,
  emergency_contact_name  text,
  emergency_contact_phone text,
  guardian_name           text,      -- tutor para menores de edad
  referred_by             text,
  notes                   text,      -- notas administrativas (no clínicas)
  primary_dentist_id      uuid references public.profiles (id) on delete set null,
  branch_id               uuid references public.branches (id) on delete set null,
  active                  boolean not null default true,  -- el expediente no se borra (NOM-004)
  created_by              uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  -- Texto normalizado (minúsculas, sin acentos) para la búsqueda rápida
  search                  text generated always as (
    translate(
      lower(
        first_name || ' ' || last_name || ' ' || coalesce(second_last_name, '') || ' ' ||
        coalesce(phone, '') || ' ' || coalesce(email, '') || ' ' || coalesce(curp, '')
      ),
      'áéíóúüñ', 'aeiouun'
    )
  ) stored
);

create index patients_search_idx on public.patients using gin (search gin_trgm_ops);
create index patients_last_name_idx on public.patients (last_name, first_name);

-- Equipo de atención: qué odontólogos atienden a qué paciente.
-- Un odontólogo sólo ve el expediente clínico de sus pacientes.
create table public.patient_care_team (
  patient_id  uuid not null references public.patients (id) on delete cascade,
  dentist_id  uuid not null references public.profiles (id) on delete cascade,
  added_at    timestamptz not null default now(),
  added_by    uuid references public.profiles (id) on delete set null default auth.uid(),
  primary key (patient_id, dentist_id)
);

create index patient_care_team_dentist_idx on public.patient_care_team (dentist_id);

create or replace function public.can_access_clinical(p_patient_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case public.current_app_role()
    when 'admin' then true
    when 'dentist' then exists (
      select 1 from public.patient_care_team
      where patient_id = p_patient_id and dentist_id = auth.uid()
    )
    else false
  end
$$;

-- Si un odontólogo da de alta a un paciente sin asignar cabecera, queda él.
create or replace function public.default_primary_dentist()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.primary_dentist_id is null and public.current_app_role() = 'dentist' then
    new.primary_dentist_id := auth.uid();
  end if;
  return new;
end;
$$;

create trigger patients_default_primary_dentist
  before insert on public.patients
  for each row execute function public.default_primary_dentist();

-- El odontólogo de cabecera entra automáticamente al equipo de atención.
create or replace function public.sync_primary_dentist()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.primary_dentist_id is not null then
    insert into public.patient_care_team (patient_id, dentist_id)
    values (new.id, new.primary_dentist_id)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger patients_sync_primary_dentist
  after insert or update of primary_dentist_id on public.patients
  for each row execute function public.sync_primary_dentist();

-- -----------------------------------------------------------------------------
-- Historia clínica / anamnesis (1:1 con paciente, auditada)
-- -----------------------------------------------------------------------------
create table public.medical_histories (
  patient_id                uuid primary key references public.patients (id) on delete cascade,
  -- Antecedentes personales patológicos: { "diabetes": true, "hipertension": false, ... }
  pathological_history      jsonb not null default '{}'::jsonb,
  pathological_notes        text,
  non_pathological_history  text,     -- tabaquismo, alcohol, higiene, hábitos
  family_history            text,
  allergies                 text[] not null default '{}',
  current_medications       text,
  surgeries                 text,
  pregnant                  boolean,
  breastfeeding             boolean,
  blood_pressure            text,
  chief_complaint           text,     -- motivo de consulta
  current_illness           text,     -- padecimiento actual
  dental_history            text,
  completed_by_patient      boolean not null default false,
  updated_by                uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Bitácora de auditoría (inmutable)
-- -----------------------------------------------------------------------------
create table public.audit_log (
  id          bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_id    uuid,
  actor_email text,
  table_name  text not null,
  record_id   text,
  action      text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_data    jsonb,
  new_data    jsonb,
  changed     text[]
);

create index audit_log_table_record_idx on public.audit_log (table_name, record_id);
create index audit_log_occurred_idx on public.audit_log (occurred_at desc);
create index audit_log_actor_idx on public.audit_log (actor_id);

create or replace function public.audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_record_id text;
  v_changed text[];
begin
  v_record_id := coalesce(v_new, v_old) ->> coalesce(tg_argv[0], 'id');

  if tg_op = 'UPDATE' then
    select array_agg(key order by key) into v_changed
    from jsonb_each(v_new) n
    where n.value is distinct from v_old -> n.key
      and n.key not in ('updated_at', 'search');
    if v_changed is null then
      return new;  -- nada relevante cambió
    end if;
  end if;

  insert into public.audit_log (actor_id, actor_email, table_name, record_id, action, old_data, new_data, changed)
  values (
    auth.uid(),
    (select email from public.profiles where id = auth.uid()),
    tg_table_name,
    v_record_id,
    tg_op,
    v_old,
    v_new,
    v_changed
  );

  return coalesce(new, old);
end;
$$;

create or replace function public.audit_log_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'La bitácora de auditoría es inmutable';
end;
$$;

create trigger audit_log_no_update
  before update or delete on public.audit_log
  for each row execute function public.audit_log_immutable();

create trigger audit_log_no_truncate
  before truncate on public.audit_log
  for each statement execute function public.audit_log_immutable();

-- -----------------------------------------------------------------------------
-- Triggers de updated_at y auditoría
-- -----------------------------------------------------------------------------
create trigger branches_updated_at before update on public.branches
  for each row execute function public.set_updated_at();
create trigger chairs_updated_at before update on public.chairs
  for each row execute function public.set_updated_at();
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger patients_updated_at before update on public.patients
  for each row execute function public.set_updated_at();
create trigger medical_histories_updated_at before update on public.medical_histories
  for each row execute function public.set_updated_at();

create trigger branches_audit after insert or update or delete on public.branches
  for each row execute function public.audit_trigger();
create trigger chairs_audit after insert or update or delete on public.chairs
  for each row execute function public.audit_trigger();
create trigger profiles_audit after insert or update or delete on public.profiles
  for each row execute function public.audit_trigger();
create trigger patients_audit after insert or update or delete on public.patients
  for each row execute function public.audit_trigger();
create trigger patient_care_team_audit after insert or update or delete on public.patient_care_team
  for each row execute function public.audit_trigger('patient_id');
create trigger medical_histories_audit after insert or update or delete on public.medical_histories
  for each row execute function public.audit_trigger('patient_id');

-- -----------------------------------------------------------------------------
-- Alta automática de perfil al crear un usuario en Supabase Auth.
-- El primer usuario del sistema es administrador. Los demás toman el rol de
-- app_metadata.role y quedan INACTIVOS hasta que un administrador los active
-- (la invitación desde Configuración los activa). Así, aunque alguien lograra
-- registrarse por su cuenta, no tendría acceso a ningún dato.
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.app_role;
  v_first boolean := not exists (select 1 from public.profiles);
begin
  if v_first then
    v_role := 'admin';
  else
    v_role := coalesce(
      nullif(new.raw_app_meta_data ->> 'role', '')::public.app_role,
      'reception'
    );
  end if;

  insert into public.profiles (id, email, full_name, role, active)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    v_role,
    v_first
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Un usuario no puede cambiar su propio rol ni reactivarse.
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

create trigger profiles_protect_fields before update on public.profiles
  for each row execute function public.protect_profile_fields();

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.branches          enable row level security;
alter table public.chairs            enable row level security;
alter table public.profiles          enable row level security;
alter table public.patients          enable row level security;
alter table public.patient_care_team enable row level security;
alter table public.medical_histories enable row level security;
alter table public.audit_log         enable row level security;

-- Sucursales y sillones: todo el personal lee; sólo admin escribe.
create policy branches_select on public.branches for select to authenticated using (public.is_staff());
create policy branches_admin  on public.branches for all    to authenticated using (public.is_admin()) with check (public.is_admin());
create policy chairs_select   on public.chairs   for select to authenticated using (public.is_staff());
create policy chairs_admin    on public.chairs   for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- Perfiles: el personal ve el directorio; cada quien edita sus datos; admin todo.
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_staff());
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_admin on public.profiles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Pacientes (datos demográficos): recepción y admin ven todo;
-- el odontólogo ve a sus pacientes.
create policy patients_select on public.patients for select to authenticated
  using (
    public.current_app_role() in ('admin', 'reception')
    or (public.current_app_role() = 'dentist' and public.can_access_clinical(id))
  );
create policy patients_insert on public.patients for insert to authenticated
  with check (public.is_staff());
create policy patients_update on public.patients for update to authenticated
  using (
    public.current_app_role() in ('admin', 'reception')
    or (public.current_app_role() = 'dentist' and public.can_access_clinical(id))
  )
  with check (public.is_staff());
-- No hay política de DELETE: el expediente se conserva (se desactiva).

-- Equipo de atención
create policy care_team_select on public.patient_care_team for select to authenticated
  using (public.current_app_role() in ('admin', 'reception') or dentist_id = auth.uid());
create policy care_team_insert on public.patient_care_team for insert to authenticated
  with check (public.current_app_role() in ('admin', 'reception'));
create policy care_team_delete on public.patient_care_team for delete to authenticated
  using (public.is_admin());

-- Anamnesis: sólo admin y odontólogos del equipo de atención.
create policy medical_histories_select on public.medical_histories for select to authenticated
  using (public.can_access_clinical(patient_id));
create policy medical_histories_insert on public.medical_histories for insert to authenticated
  with check (public.can_access_clinical(patient_id));
create policy medical_histories_update on public.medical_histories for update to authenticated
  using (public.can_access_clinical(patient_id)) with check (public.can_access_clinical(patient_id));

-- Bitácora: sólo lectura para admin. Las escrituras llegan vía trigger.
create policy audit_log_select on public.audit_log for select to authenticated
  using (public.is_admin());

revoke insert, update, delete, truncate on public.audit_log from anon, authenticated;
revoke all on public.audit_log from anon;
revoke all on public.patients, public.medical_histories, public.patient_care_team,
              public.profiles, public.branches, public.chairs from anon;
