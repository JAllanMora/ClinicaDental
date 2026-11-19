-- =============================================================================
-- Fase 5: recordatorios y confirmaciones
-- Preferencia de contacto del paciente, configuración de mensajes, bitácora de
-- envíos (WhatsApp, SMS, correo) y confirmación de la cita por enlace.
-- =============================================================================

create type public.contact_channel as enum ('whatsapp', 'sms', 'email', 'ninguno');
create type public.notification_status as enum ('pendiente', 'enviado', 'simulado', 'fallido');

alter table public.patients
  add column contact_preference public.contact_channel not null default 'whatsapp';

alter table public.appointments
  add column confirm_token        uuid not null default gen_random_uuid(),
  add column reminder_sent_at     timestamptz,
  add column patient_response     text check (patient_response in ('confirmada', 'cambio')),
  add column patient_responded_at timestamptz;

create unique index appointments_confirm_token_idx on public.appointments (confirm_token);

-- Configuración (una sola fila).
create table public.reminder_settings (
  id                boolean primary key default true check (id),
  enabled           boolean not null default true,
  days_before       smallint not null default 1 check (days_before between 0 and 7),
  clinic_phone      text,
  whatsapp_template text not null default
    'Hola {paciente}, te recordamos tu cita en Clínica Dental Villa San Juan el {fecha} a las {hora} con {doctor}. Confirma o pide un cambio aquí: {enlace}',
  sms_template      text not null default
    'Clinica Dental Villa San Juan: cita {fecha} {hora} con {doctor}. Confirma: {enlace}',
  email_subject     text not null default 'Recordatorio de tu cita · Clínica Dental Villa San Juan',
  email_template    text not null default
    E'Hola {paciente}:\n\nTe recordamos tu cita el {fecha} a las {hora} con {doctor}.\n\nPor favor confírmala o avísanos si necesitas cambiarla: {enlace}\n\nClínica Dental Villa San Juan',
  updated_at        timestamptz not null default now()
);
insert into public.reminder_settings default values;

-- Bitácora de mensajes enviados.
create table public.notifications (
  id              uuid primary key default gen_random_uuid(),
  appointment_id  uuid references public.appointments (id) on delete set null,
  patient_id      uuid not null references public.patients (id) on delete cascade,
  channel         public.contact_channel not null check (channel <> 'ninguno'),
  kind            text not null default 'recordatorio' check (kind in ('recordatorio', 'confirmacion', 'manual')),
  recipient       text not null,
  body            text not null,
  status          public.notification_status not null default 'pendiente',
  provider_id     text,
  error           text,
  sent_by         uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now(),
  sent_at         timestamptz
);

create index notifications_appointment_idx on public.notifications (appointment_id);
create index notifications_created_idx on public.notifications (created_at desc);

create trigger reminder_settings_updated_at before update on public.reminder_settings
  for each row execute function public.set_updated_at();
create trigger reminder_settings_audit after update on public.reminder_settings
  for each row execute function public.audit_trigger();

-- Al mover la cita de horario se vuelve a recordar y a pedir confirmación.
create or replace function public.appointment_reset_reminder()
returns trigger
language plpgsql
as $$
begin
  if new.starts_at is distinct from old.starts_at then
    new.reminder_sent_at := null;
    new.patient_response := null;
    new.patient_responded_at := null;
    if new.status = 'confirmada' and old.status = 'confirmada' then
      new.status := 'programada';
      new.confirmed_at := null;
    end if;
  end if;
  return new;
end;
$$;

create trigger appointments_reset_reminder before update on public.appointments
  for each row execute function public.appointment_reset_reminder();

-- -----------------------------------------------------------------------------
-- Respuesta del paciente por enlace (sin sesión). Funciones security definer
-- que sólo exponen lo indispensable de la cita dueña del token.
-- -----------------------------------------------------------------------------
create or replace function public.appointment_by_token(p_token uuid)
returns table (
  patient_first_name text,
  dentist_name text,
  starts_at timestamptz,
  ends_at timestamptz,
  status public.appointment_status,
  patient_response text,
  branch_name text,
  branch_address text,
  branch_phone text
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.first_name, d.full_name, a.starts_at, a.ends_at, a.status, a.patient_response,
         b.name, b.address, b.phone
  from public.appointments a
  join public.patients p on p.id = a.patient_id
  join public.profiles d on d.id = a.dentist_id
  join public.chairs c on c.id = a.chair_id
  join public.branches b on b.id = c.branch_id
  where a.confirm_token = p_token
$$;

create or replace function public.respond_appointment(p_token uuid, p_response text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_response not in ('confirmada', 'cambio') then
    raise exception 'respuesta inválida';
  end if;
  select id into v_id from public.appointments
  where confirm_token = p_token
    and status in ('programada', 'confirmada')
    and starts_at > now();
  if v_id is null then
    return false;
  end if;
  update public.appointments
  set patient_response = p_response,
      patient_responded_at = now(),
      status = case when p_response = 'confirmada' then 'confirmada'::public.appointment_status else status end
  where id = v_id;
  return true;
end;
$$;

revoke all on function public.appointment_by_token(uuid) from public;
revoke all on function public.respond_appointment(uuid, text) from public;
grant execute on function public.appointment_by_token(uuid) to anon, authenticated;
grant execute on function public.respond_appointment(uuid, text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.reminder_settings enable row level security;
alter table public.notifications enable row level security;

create policy reminder_settings_select on public.reminder_settings for select to authenticated using (public.is_staff());
create policy reminder_settings_update on public.reminder_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy notifications_select on public.notifications for select to authenticated using (public.is_staff());
create policy notifications_insert on public.notifications for insert to authenticated
  with check (public.is_staff() and sent_by = auth.uid());
create policy notifications_update on public.notifications for update to authenticated
  using (public.is_staff() and sent_by = auth.uid()) with check (public.is_staff() and sent_by = auth.uid());
-- Sin delete: la bitácora de mensajes se conserva.
