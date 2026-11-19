-- =============================================================================
-- Seguimientos (recall): al cerrar una consulta, el odontólogo deja programado
-- que el bot le recuerde al paciente regresar (p. ej. limpieza en 6 meses) y le
-- ofrezca agendar. Nada se borra: se cancela con motivo.
-- =============================================================================

create table public.patient_recalls (
  id                    uuid primary key default gen_random_uuid(),
  patient_id            uuid not null references public.patients (id) on delete cascade,
  dentist_id            uuid references public.profiles (id) on delete set null,
  note_id               uuid references public.clinical_notes (id) on delete set null,
  due_on                date not null,
  reason                text not null check (length(trim(reason)) between 2 and 200),
  appointment_type_id   uuid references public.appointment_types (id) on delete set null,
  status                text not null default 'pendiente'
                        check (status in ('pendiente', 'enviado', 'agendado', 'declinado', 'cancelado')),
  sent_count            smallint not null default 0 check (sent_count between 0 and 2),
  sent_at               timestamptz,
  responded_at          timestamptz,
  booked_appointment_id uuid references public.appointments (id) on delete set null,
  cancel_reason         text,
  created_by            uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (status <> 'cancelado' or cancel_reason is not null)
);
create index patient_recalls_due_idx on public.patient_recalls (status, due_on);
create index patient_recalls_patient_idx on public.patient_recalls (patient_id, due_on);

create trigger patient_recalls_updated_at before update on public.patient_recalls
  for each row execute function public.set_updated_at();
create trigger patient_recalls_audit after insert or update or delete on public.patient_recalls
  for each row execute function public.audit_trigger('patient_id');

-- Lo que no cambia una vez creado.
create or replace function public.protect_patient_recall()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.patient_id <> old.patient_id or new.note_id is distinct from old.note_id
     or new.created_by is distinct from old.created_by or new.created_at <> old.created_at then
    raise exception 'No se puede cambiar el paciente, la nota ni el autor de un seguimiento';
  end if;
  return new;
end;
$$;
create trigger patient_recalls_protect before update on public.patient_recalls
  for each row execute function public.protect_patient_recall();

alter table public.patient_recalls enable row level security;

-- Todo el personal ve los seguimientos (recepción les da seguimiento).
create policy patient_recalls_select on public.patient_recalls for select to authenticated
  using (public.is_staff());
-- Los crea quien puede escribir en el expediente, a su nombre.
create policy patient_recalls_insert on public.patient_recalls for insert to authenticated
  with check (public.can_write_clinical(patient_id) and created_by = auth.uid());
-- Cambiar fecha o cancelar: quien escribe en el expediente, el admin o recepción (lleva la agenda).
create policy patient_recalls_update on public.patient_recalls for update to authenticated
  using (public.can_write_clinical(patient_id) or public.current_app_role() in ('admin', 'reception'))
  with check (public.can_write_clinical(patient_id) or public.current_app_role() in ('admin', 'reception'));
-- Sin DELETE.
revoke all on public.patient_recalls from anon;
