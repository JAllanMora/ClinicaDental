-- =============================================================================
-- Fase 2: expediente clínico
-- Odontograma, periodontograma, notas de evolución y consentimientos.
-- Todos los datos clínicos son visibles sólo para admin y el equipo de atención.
-- Los registros clínicos no se borran: se anulan (voided_at) o se corrigen con adendas.
-- =============================================================================

-- Sólo admin u odontólogo del equipo de atención puede escribir datos clínicos.
create or replace function public.can_write_clinical(p_patient_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_app_role() in ('admin', 'dentist') and public.can_access_clinical(p_patient_id)
$$;

-- -----------------------------------------------------------------------------
-- Odontograma
-- -----------------------------------------------------------------------------
create type public.finding_layer as enum ('previo', 'patologia', 'propuesto', 'realizado');
create type public.tooth_surface as enum ('M', 'O', 'D', 'V', 'L');

create table public.dental_findings (
  id            uuid primary key default gen_random_uuid(),
  patient_id    uuid not null references public.patients (id) on delete cascade,
  -- Notación FDI: permanentes 11-48, temporales 51-85
  tooth         smallint not null check (
    (tooth / 10 between 1 and 4 and tooth % 10 between 1 and 8) or
    (tooth / 10 between 5 and 8 and tooth % 10 between 1 and 5)
  ),
  surface       public.tooth_surface,   -- null = toda la pieza
  condition     text not null,          -- código del catálogo (src/lib/odontogram.ts)
  layer         public.finding_layer not null,
  notes         text,
  recorded_by   uuid references public.profiles (id) on delete set null default auth.uid(),
  recorded_at   timestamptz not null default now(),
  completed_at  timestamptz,
  completed_by  uuid references public.profiles (id) on delete set null,
  voided_at     timestamptz,
  voided_by     uuid references public.profiles (id) on delete set null,
  void_reason   text,
  updated_at    timestamptz not null default now()
);

create index dental_findings_patient_idx on public.dental_findings (patient_id, tooth);

-- -----------------------------------------------------------------------------
-- Periodontograma (una evaluación por fecha; mediciones en jsonb por pieza)
-- data: { "16": { "mobility": 1, "furcation": 0, "implant": false, "missing": false,
--                 "sites": { "MV": { "pd": 3, "rec": 0, "bop": true, "sup": false }, ... } } }
-- Sitios: MV, V, DV (vestibular) y ML, L, DL (lingual/palatino)
-- -----------------------------------------------------------------------------
create table public.periodontal_exams (
  id           uuid primary key default gen_random_uuid(),
  patient_id   uuid not null references public.patients (id) on delete cascade,
  exam_date    date not null default current_date,
  examiner_id  uuid references public.profiles (id) on delete set null default auth.uid(),
  dentition    text not null default 'permanente' check (dentition in ('permanente', 'temporal')),
  data         jsonb not null default '{}'::jsonb,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index periodontal_exams_patient_idx on public.periodontal_exams (patient_id, exam_date desc);

-- -----------------------------------------------------------------------------
-- Notas de evolución (inmutables; correcciones mediante adenda)
-- -----------------------------------------------------------------------------
create table public.clinical_notes (
  id              uuid primary key default gen_random_uuid(),
  patient_id      uuid not null references public.patients (id) on delete cascade,
  note_date       date not null default current_date,
  teeth           smallint[] not null default '{}',
  procedure       text not null,
  materials       text,
  anesthesia      text,
  description     text,
  next_steps      text,
  dentist_id      uuid not null references public.profiles (id) on delete restrict default auth.uid(),
  amends_note_id  uuid references public.clinical_notes (id) on delete restrict,
  created_at      timestamptz not null default now()
);

create index clinical_notes_patient_idx on public.clinical_notes (patient_id, note_date desc, created_at desc);

-- -----------------------------------------------------------------------------
-- Consentimientos informados
-- -----------------------------------------------------------------------------
create table public.consent_templates (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  body        text not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.consents (
  id                 uuid primary key default gen_random_uuid(),
  patient_id         uuid not null references public.patients (id) on delete cascade,
  template_id        uuid references public.consent_templates (id) on delete set null,
  title              text not null,
  body               text not null,       -- texto exacto que se firmó
  signer_name        text not null,
  signer_relation    text,                -- paciente, madre, padre, tutor…
  signature          text not null check (signature like 'data:image/png;base64,%'),
  dentist_id         uuid references public.profiles (id) on delete set null default auth.uid(),
  dentist_signature  text check (dentist_signature is null or dentist_signature like 'data:image/png;base64,%'),
  signed_at          timestamptz not null default now(),
  revoked_at         timestamptz,
  revoked_reason     text,
  user_agent         text
);

create index consents_patient_idx on public.consents (patient_id, signed_at desc);

-- -----------------------------------------------------------------------------
-- Triggers
-- -----------------------------------------------------------------------------
create trigger dental_findings_updated_at before update on public.dental_findings
  for each row execute function public.set_updated_at();
create trigger periodontal_exams_updated_at before update on public.periodontal_exams
  for each row execute function public.set_updated_at();
create trigger consent_templates_updated_at before update on public.consent_templates
  for each row execute function public.set_updated_at();

create trigger dental_findings_audit after insert or update or delete on public.dental_findings
  for each row execute function public.audit_trigger();
create trigger periodontal_exams_audit after insert or update or delete on public.periodontal_exams
  for each row execute function public.audit_trigger();
create trigger clinical_notes_audit after insert or update or delete on public.clinical_notes
  for each row execute function public.audit_trigger();
create trigger consent_templates_audit after insert or update or delete on public.consent_templates
  for each row execute function public.audit_trigger();
create trigger consents_audit after insert or update or delete on public.consents
  for each row execute function public.audit_trigger();

-- En un hallazgo sólo se puede cambiar el estado (completar) o anularlo.
create or replace function public.protect_finding()
returns trigger
language plpgsql
as $$
begin
  if old.voided_at is not null then
    raise exception 'El hallazgo está anulado y no se puede modificar';
  end if;
  if new.patient_id <> old.patient_id or new.tooth <> old.tooth
     or new.surface is distinct from old.surface or new.condition <> old.condition
     or new.recorded_by is distinct from old.recorded_by or new.recorded_at <> old.recorded_at then
    raise exception 'Para corregir un hallazgo anúlalo y registra uno nuevo';
  end if;
  if new.layer = 'realizado' and old.layer <> 'realizado' then
    new.completed_at := coalesce(new.completed_at, now());
    new.completed_by := coalesce(new.completed_by, auth.uid());
  end if;
  if new.voided_at is not null then
    new.voided_by := coalesce(new.voided_by, auth.uid());
  end if;
  return new;
end;
$$;

create trigger dental_findings_protect before update on public.dental_findings
  for each row execute function public.protect_finding();

-- Un consentimiento firmado sólo puede revocarse; su contenido no cambia.
create or replace function public.protect_consent()
returns trigger
language plpgsql
as $$
begin
  if old.revoked_at is not null then
    raise exception 'El consentimiento ya fue revocado';
  end if;
  if (to_jsonb(new) - 'revoked_at' - 'revoked_reason') <> (to_jsonb(old) - 'revoked_at' - 'revoked_reason') then
    raise exception 'Un consentimiento firmado no se puede modificar, sólo revocar';
  end if;
  return new;
end;
$$;

create trigger consents_protect before update on public.consents
  for each row execute function public.protect_consent();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.dental_findings   enable row level security;
alter table public.periodontal_exams enable row level security;
alter table public.clinical_notes    enable row level security;
alter table public.consent_templates enable row level security;
alter table public.consents          enable row level security;

create policy findings_select on public.dental_findings for select to authenticated
  using (public.can_access_clinical(patient_id));
create policy findings_insert on public.dental_findings for insert to authenticated
  with check (public.can_write_clinical(patient_id) and recorded_by = auth.uid());
create policy findings_update on public.dental_findings for update to authenticated
  using (public.can_write_clinical(patient_id)) with check (public.can_write_clinical(patient_id));

create policy perio_select on public.periodontal_exams for select to authenticated
  using (public.can_access_clinical(patient_id));
create policy perio_insert on public.periodontal_exams for insert to authenticated
  with check (public.can_write_clinical(patient_id));
create policy perio_update on public.periodontal_exams for update to authenticated
  using (public.can_write_clinical(patient_id)) with check (public.can_write_clinical(patient_id));

create policy notes_select on public.clinical_notes for select to authenticated
  using (public.can_access_clinical(patient_id));
create policy notes_insert on public.clinical_notes for insert to authenticated
  with check (public.can_write_clinical(patient_id) and dentist_id = auth.uid());
-- Sin UPDATE ni DELETE: las notas son inmutables (NOM-004).

create policy consent_templates_select on public.consent_templates for select to authenticated
  using (public.is_staff());
create policy consent_templates_admin on public.consent_templates for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy consents_select on public.consents for select to authenticated
  using (public.can_access_clinical(patient_id));
create policy consents_insert on public.consents for insert to authenticated
  with check (public.can_write_clinical(patient_id));
create policy consents_update on public.consents for update to authenticated
  using (public.can_write_clinical(patient_id)) with check (public.can_write_clinical(patient_id));

revoke all on public.dental_findings, public.periodontal_exams, public.clinical_notes,
              public.consent_templates, public.consents from anon;

-- -----------------------------------------------------------------------------
-- Plantillas iniciales de consentimiento
-- -----------------------------------------------------------------------------
insert into public.consent_templates (title, body) values
('Consentimiento informado general',
'Yo, el/la paciente (o su representante legal), declaro que el/la odontólogo(a) tratante me ha explicado de forma clara y comprensible el diagnóstico, el plan de tratamiento propuesto, sus beneficios, riesgos, posibles complicaciones y las alternativas disponibles, incluida la de no realizar tratamiento.

He tenido la oportunidad de hacer preguntas y todas fueron respondidas a mi satisfacción. Entiendo que la odontología no es una ciencia exacta y que no se me han garantizado resultados.

Declaro haber informado verazmente sobre mi estado de salud, enfermedades, alergias y medicamentos.

Autorizo a la Clínica Dental Villa San Juan y a su personal a realizar los procedimientos diagnósticos y terapéuticos necesarios, incluida la aplicación de anestesia local y la toma de radiografías y fotografías clínicas para mi expediente.

Sé que puedo revocar este consentimiento en cualquier momento antes del procedimiento.

De conformidad con la NOM-004-SSA3-2012 del expediente clínico.'),
('Consentimiento para extracción dental',
'Autorizo la extracción de la(s) pieza(s) dental(es) indicada(s) por el/la odontólogo(a) tratante.

Se me han explicado los riesgos, entre ellos: dolor e inflamación, sangrado, infección, alveolitis, lesión de dientes vecinos, fractura de raíces o del hueso, comunicación con el seno maxilar, y adormecimiento temporal o, en casos raros, permanente del labio, la lengua o el mentón.

Me comprometo a seguir las indicaciones posoperatorias y a acudir a las citas de control.'),
('Consentimiento para endodoncia',
'Autorizo el tratamiento de conductos (endodoncia) de la(s) pieza(s) indicada(s).

Se me ha explicado que su objetivo es conservar el diente, que su éxito no puede garantizarse y que pueden presentarse: dolor posoperatorio, fractura de instrumentos dentro del conducto, perforaciones, fractura del diente o necesidad de retratamiento, cirugía o extracción.

Entiendo que después del tratamiento el diente normalmente requiere una restauración definitiva o una corona para evitar su fractura.'),
('Consentimiento para ortodoncia',
'Autorizo el tratamiento de ortodoncia propuesto. Se me ha explicado su duración aproximada, la importancia de acudir a las citas, de mantener una higiene oral estricta y de usar los aparatos y retenedores según las indicaciones.

Entiendo los posibles riesgos: descalcificaciones o caries por mala higiene, reabsorción radicular, molestias en la articulación temporomandibular, problemas en las encías y recidiva si no uso los retenedores.');
