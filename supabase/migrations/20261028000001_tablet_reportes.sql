-- =============================================================================
-- Fase 8: cuestionario de salud que llena el paciente en la tablet.
-- Lo declarado por el paciente queda aparte y el odontólogo lo revisa antes de
-- pasarlo a la historia clínica (NOM-004: la historia la valida el profesional).
-- =============================================================================

create table public.patient_questionnaires (
  id            uuid primary key default gen_random_uuid(),
  patient_id    uuid not null references public.patients (id) on delete cascade,
  answers       jsonb not null,
  signer_name   text not null,
  signature     text not null check (signature like 'data:image/png;base64,%'),
  submitted_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  submitted_at  timestamptz not null default now(),
  reviewed_by   uuid references public.profiles (id) on delete set null,
  reviewed_at   timestamptz
);
create index patient_questionnaires_patient_idx on public.patient_questionnaires (patient_id, submitted_at desc);

-- Una vez enviado, sólo se puede marcar como revisado.
create or replace function public.protect_questionnaire()
returns trigger
language plpgsql
as $$
begin
  if (new.patient_id, new.answers, new.signer_name, new.signature, new.submitted_by, new.submitted_at)
     is distinct from (old.patient_id, old.answers, old.signer_name, old.signature, old.submitted_by, old.submitted_at) then
    raise exception 'El cuestionario firmado no se modifica';
  end if;
  if old.reviewed_at is not null then
    raise exception 'El cuestionario ya fue revisado';
  end if;
  new.reviewed_by := auth.uid();
  new.reviewed_at := now();
  return new;
end;
$$;

create trigger patient_questionnaires_protect before update on public.patient_questionnaires
  for each row execute function public.protect_questionnaire();
create trigger patient_questionnaires_audit after insert or update on public.patient_questionnaires
  for each row execute function public.audit_trigger();

alter table public.patient_questionnaires enable row level security;

-- Cualquier miembro del personal entrega la tablet; sólo quien ve el expediente lo lee.
create policy questionnaires_insert on public.patient_questionnaires for insert to authenticated
  with check (public.is_staff() and submitted_by = auth.uid());
create policy questionnaires_select on public.patient_questionnaires for select to authenticated
  using (public.can_access_clinical(patient_id));
create policy questionnaires_review on public.patient_questionnaires for update to authenticated
  using (public.can_write_clinical(patient_id)) with check (public.can_write_clinical(patient_id));
