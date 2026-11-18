-- =============================================================================
-- Fase 9: bot de WhatsApp (servicio aparte con Baileys, carpeta bot/).
-- Horarios libres según los turnos de cada odontólogo (working_hours), bitácora
-- de mensajes, estado de la conexión (QR) y citas agendadas por el paciente.
-- El bot usa la llave de servicio; el personal ve todo desde Agenda → WhatsApp.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Configuración del bot (una sola fila)
-- -----------------------------------------------------------------------------
create table public.whatsapp_settings (
  id                  boolean primary key default true check (id),
  enabled             boolean not null default true,
  bookable_type_ids   uuid[] not null default '{}',
  days_ahead          smallint not null default 14 check (days_ahead between 1 and 60),
  min_notice_minutes  integer not null default 120 check (min_notice_minutes between 0 and 10080),
  welcome_message     text not null default
    'Hola{nombre}, soy el asistente de Clínica Dental Villa San Juan.',
  handoff_message     text not null default
    'Listo, le pasé tu mensaje a recepción. Te contestan en cuanto puedan dentro del horario de la clínica.',
  updated_at          timestamptz not null default now()
);

insert into public.whatsapp_settings (bookable_type_ids)
select coalesce(array_agg(id order by name), '{}')
from public.appointment_types
where name in ('Valoración / primera vez', 'Limpieza', 'Urgencia', 'Ortodoncia (control)');

-- Estado de la conexión que reporta el bot (una sola fila).
create table public.whatsapp_status (
  id          boolean primary key default true check (id),
  state       text not null default 'desconectado' check (state in ('desconectado', 'esperando_qr', 'conectado')),
  qr          text,
  phone       text,
  last_seen   timestamptz,
  updated_at  timestamptz not null default now()
);
insert into public.whatsapp_status default values;

-- Bitácora de la conversación.
create table public.whatsapp_messages (
  id               uuid primary key default gen_random_uuid(),
  phone            text not null,          -- 10 dígitos (México) o E.164 sin "+"
  patient_id       uuid references public.patients (id) on delete set null,
  direction        text not null check (direction in ('entrante', 'saliente')),
  body             text not null,
  needs_attention  boolean not null default false,  -- el paciente pidió hablar con recepción
  attended_by      uuid references public.profiles (id) on delete set null,
  attended_at      timestamptz,
  created_at       timestamptz not null default now()
);
create index whatsapp_messages_phone_idx on public.whatsapp_messages (phone, created_at desc);
create index whatsapp_messages_attention_idx on public.whatsapp_messages (created_at) where needs_attention;

alter table public.appointments
  add column booked_via text not null default 'sistema' check (booked_via in ('sistema', 'whatsapp'));

-- Los recordatorios por WhatsApp se pueden contestar con 1 o 2.
update public.reminder_settings
set whatsapp_template =
  'Hola {paciente}, te recordamos tu cita en Clínica Dental Villa San Juan el {fecha} a las {hora} con {doctor}. Responde 1 para confirmar o 2 si necesitas cambiarla. También puedes usar este enlace: {enlace}'
where whatsapp_template =
  'Hola {paciente}, te recordamos tu cita en Clínica Dental Villa San Juan el {fecha} a las {hora} con {doctor}. Confirma o pide un cambio aquí: {enlace}';
alter table public.reminder_settings alter column whatsapp_template set default
  'Hola {paciente}, te recordamos tu cita en Clínica Dental Villa San Juan el {fecha} a las {hora} con {doctor}. Responde 1 para confirmar o 2 si necesitas cambiarla. También puedes usar este enlace: {enlace}';

create trigger whatsapp_settings_updated_at before update on public.whatsapp_settings
  for each row execute function public.set_updated_at();
create trigger whatsapp_settings_audit after update on public.whatsapp_settings
  for each row execute function public.audit_trigger();

-- -----------------------------------------------------------------------------
-- Horarios libres: inicio de cita cada 15 minutos dentro de los turnos de cada
-- odontólogo (working_hours), con un sillón libre durante toda la duración,
-- sin citas activas ni bloqueos.
-- Devuelve un odontólogo y un sillón por hora, de preferencia p_prefer
-- (el odontólogo de cabecera del paciente).
-- -----------------------------------------------------------------------------
create or replace function public.available_slots(
  p_duration  integer,
  p_from      timestamptz,
  p_to        timestamptz,
  p_dentist   uuid default null,
  p_prefer    uuid default null
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

-- Busca al paciente por los últimos 10 dígitos del teléfono.
create or replace function public.patient_by_phone(p_phone text)
returns setof public.patients
language sql
stable
security definer
set search_path = public
as $$
  select * from public.patients
  where active
    and length(regexp_replace(p_phone, '\D', '', 'g')) >= 10
    and right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10) = right(regexp_replace(p_phone, '\D', '', 'g'), 10)
  order by created_at
$$;

-- Supabase da EXECUTE a anon y authenticated por omisión; se quita explícitamente.
revoke all on function public.available_slots(integer, timestamptz, timestamptz, uuid, uuid) from public, anon;
revoke all on function public.patient_by_phone(text) from public, anon, authenticated;
grant execute on function public.available_slots(integer, timestamptz, timestamptz, uuid, uuid) to authenticated, service_role;
grant execute on function public.patient_by_phone(text) to service_role;

-- -----------------------------------------------------------------------------
-- RLS. El bot escribe con la llave de servicio (sin RLS).
-- -----------------------------------------------------------------------------
alter table public.whatsapp_settings enable row level security;
alter table public.whatsapp_status enable row level security;
alter table public.whatsapp_messages enable row level security;

create policy whatsapp_settings_select on public.whatsapp_settings for select to authenticated using (public.is_staff());
create policy whatsapp_settings_update on public.whatsapp_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy whatsapp_status_select on public.whatsapp_status for select to authenticated using (public.is_staff());

create policy whatsapp_messages_select on public.whatsapp_messages for select to authenticated using (public.is_staff());
-- El personal sólo marca como atendido.
create policy whatsapp_messages_update on public.whatsapp_messages for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

create or replace function public.protect_whatsapp_message()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null and (
    new.phone is distinct from old.phone or new.body is distinct from old.body
    or new.direction is distinct from old.direction or new.created_at is distinct from old.created_at
    or new.patient_id is distinct from old.patient_id
  ) then
    raise exception 'Los mensajes de WhatsApp no se modifican';
  end if;
  return new;
end;
$$;

create trigger whatsapp_messages_protect before update on public.whatsapp_messages
  for each row execute function public.protect_whatsapp_message();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.whatsapp_messages, public.whatsapp_status;
  end if;
end;
$$;
