-- =============================================================================
-- Fase 4: agenda y citas
-- Tipos de cita con duración, citas por odontólogo y sillón (sin empalmes),
-- bloqueos de horario y lista de espera.
-- =============================================================================

create extension if not exists btree_gist;

create type public.appointment_status as enum (
  'programada', 'confirmada', 'en_sala', 'en_atencion', 'completada', 'cancelada', 'no_asistio'
);

create table public.appointment_types (
  id                uuid primary key default gen_random_uuid(),
  name              text not null unique,
  duration_minutes  integer not null check (duration_minutes between 5 and 480),
  color             text not null default '#A0449A',
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table public.appointments (
  id                uuid primary key default gen_random_uuid(),
  patient_id        uuid not null references public.patients (id) on delete restrict,
  dentist_id        uuid not null references public.profiles (id) on delete restrict,
  chair_id          uuid not null references public.chairs (id) on delete restrict,
  type_id           uuid references public.appointment_types (id) on delete set null,
  starts_at         timestamptz not null,
  ends_at           timestamptz not null,
  status            public.appointment_status not null default 'programada',
  reason            text,          -- motivo / procedimiento planeado
  notes             text,          -- notas para recepción
  cancel_reason     text,
  confirmed_at      timestamptz,
  arrived_at        timestamptz,
  created_by        uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (ends_at > starts_at),
  check (ends_at - starts_at <= interval '8 hours'),
  -- Un sillón y un odontólogo no pueden tener dos citas activas al mismo tiempo.
  constraint appointments_no_chair_overlap exclude using gist (
    chair_id with =, tstzrange(starts_at, ends_at) with &&
  ) where (status not in ('cancelada', 'no_asistio')),
  constraint appointments_no_dentist_overlap exclude using gist (
    dentist_id with =, tstzrange(starts_at, ends_at) with &&
  ) where (status not in ('cancelada', 'no_asistio'))
);

create index appointments_starts_idx on public.appointments (starts_at);
create index appointments_patient_idx on public.appointments (patient_id, starts_at desc);

-- Bloqueos: vacaciones, comidas, mantenimiento de sillón, etc.
create table public.schedule_blocks (
  id          uuid primary key default gen_random_uuid(),
  dentist_id  uuid references public.profiles (id) on delete cascade,
  chair_id    uuid references public.chairs (id) on delete cascade,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  reason      text not null,
  created_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  check (ends_at > starts_at),
  check (dentist_id is not null or chair_id is not null)
);

create index schedule_blocks_range_idx on public.schedule_blocks (starts_at, ends_at);

create type public.waitlist_status as enum ('activa', 'agendada', 'descartada');

create table public.waitlist (
  id              uuid primary key default gen_random_uuid(),
  patient_id      uuid not null references public.patients (id) on delete cascade,
  type_id         uuid references public.appointment_types (id) on delete set null,
  dentist_id      uuid references public.profiles (id) on delete set null,
  preferred_time  text not null default 'cualquiera' check (preferred_time in ('manana', 'tarde', 'cualquiera')),
  preferred_days  smallint[] not null default '{1,2,3,4,5,6}',  -- 0 = domingo … 6 = sábado
  short_notice    boolean not null default true,  -- puede venir con aviso de pocas horas
  priority        smallint not null default 2 check (priority between 1 and 3),
  notes           text,
  status          public.waitlist_status not null default 'activa',
  appointment_id  uuid references public.appointments (id) on delete set null,
  created_by      uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index waitlist_active_idx on public.waitlist (status, priority, created_at);

-- -----------------------------------------------------------------------------
-- Triggers
-- -----------------------------------------------------------------------------
create trigger appointment_types_updated_at before update on public.appointment_types
  for each row execute function public.set_updated_at();
create trigger appointments_updated_at before update on public.appointments
  for each row execute function public.set_updated_at();
create trigger waitlist_updated_at before update on public.waitlist
  for each row execute function public.set_updated_at();

create trigger appointment_types_audit after insert or update or delete on public.appointment_types
  for each row execute function public.audit_trigger();
create trigger appointments_audit after insert or update or delete on public.appointments
  for each row execute function public.audit_trigger();
create trigger schedule_blocks_audit after insert or update or delete on public.schedule_blocks
  for each row execute function public.audit_trigger();
create trigger waitlist_audit after insert or update or delete on public.waitlist
  for each row execute function public.audit_trigger();

-- El odontólogo de la cita entra al equipo de atención del paciente
-- (así puede abrir su expediente el día de la consulta).
create or replace function public.appointment_care_team()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.patient_care_team (patient_id, dentist_id)
  select new.patient_id, new.dentist_id
  where exists (select 1 from public.profiles where id = new.dentist_id and role = 'dentist')
  on conflict do nothing;
  return new;
end;
$$;

create trigger appointments_care_team
  after insert or update of dentist_id on public.appointments
  for each row execute function public.appointment_care_team();

-- Marcas de tiempo automáticas por estado.
create or replace function public.appointment_status_times()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'confirmada' and old.status is distinct from 'confirmada' then
    new.confirmed_at := coalesce(new.confirmed_at, now());
  end if;
  if new.status = 'en_sala' and old.status is distinct from 'en_sala' then
    new.arrived_at := coalesce(new.arrived_at, now());
  end if;
  return new;
end;
$$;

create trigger appointments_status_times before update on public.appointments
  for each row execute function public.appointment_status_times();

-- -----------------------------------------------------------------------------
-- RLS
-- La agenda la ve todo el personal. El odontólogo ve las citas de otros
-- como "ocupado": el nombre del paciente sólo aparece si tiene acceso a él
-- (la RLS de patients filtra el join).
-- -----------------------------------------------------------------------------
alter table public.appointment_types enable row level security;
alter table public.appointments      enable row level security;
alter table public.schedule_blocks   enable row level security;
alter table public.waitlist          enable row level security;

create policy appointment_types_select on public.appointment_types for select to authenticated using (public.is_staff());
create policy appointment_types_admin on public.appointment_types for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy appointments_select on public.appointments for select to authenticated using (public.is_staff());
create policy appointments_insert on public.appointments for insert to authenticated
  with check (
    public.current_app_role() in ('admin', 'reception')
    or (public.current_app_role() = 'dentist' and dentist_id = auth.uid())
  );
create policy appointments_update on public.appointments for update to authenticated
  using (
    public.current_app_role() in ('admin', 'reception')
    or (public.current_app_role() = 'dentist' and dentist_id = auth.uid())
  )
  with check (
    public.current_app_role() in ('admin', 'reception')
    or (public.current_app_role() = 'dentist' and dentist_id = auth.uid())
  );
-- Sin DELETE: las citas se cancelan para conservar el historial (ausentismo).

create policy blocks_select on public.schedule_blocks for select to authenticated using (public.is_staff());
create policy blocks_write on public.schedule_blocks for all to authenticated
  using (public.current_app_role() in ('admin', 'reception') or dentist_id = auth.uid())
  with check (public.current_app_role() in ('admin', 'reception') or (dentist_id = auth.uid() and chair_id is null));

create policy waitlist_select on public.waitlist for select to authenticated using (public.is_staff());
create policy waitlist_write on public.waitlist for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

revoke all on public.appointment_types, public.appointments, public.schedule_blocks, public.waitlist from anon;

-- Tiempo real para que recepción y consultorios vean los cambios al instante.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.appointments, public.waitlist;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Tipos de cita iniciales (editables en Configuración)
-- -----------------------------------------------------------------------------
insert into public.appointment_types (name, duration_minutes, color) values
  ('Valoración / primera vez', 30, '#A0449A'),
  ('Limpieza', 30, '#0EA5E9'),
  ('Resina', 45, '#10B981'),
  ('Endodoncia', 90, '#C2187A'),
  ('Extracción', 45, '#EF4444'),
  ('Cirugía de terceros molares', 90, '#B91C1C'),
  ('Prótesis / corona', 60, '#F59E0B'),
  ('Ortodoncia (control)', 20, '#6366F1'),
  ('Implante', 120, '#7C3AED'),
  ('Urgencia', 30, '#DC2626');
