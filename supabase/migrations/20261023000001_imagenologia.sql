-- =============================================================================
-- Fase 3: imagenología y archivos clínicos
-- Radiografías, fotos intraorales/extraorales, DICOM, STL y documentos.
-- Los archivos viven en el bucket privado "clinical"; la ruta empieza con el
-- id del paciente: <patient_id>/<uuid>-<nombre>. Sólo se sirven con URL firmada.
-- =============================================================================

create type public.file_kind as enum (
  'periapical', 'aleta_mordida', 'oclusal', 'panoramica', 'cefalometrica', 'tomografia',
  'foto_intraoral', 'foto_extraoral', 'escaneo_stl', 'documento', 'otro'
);

create table public.patient_files (
  id            uuid primary key default gen_random_uuid(),
  patient_id    uuid not null references public.patients (id) on delete cascade,
  kind          public.file_kind not null,
  storage_path  text not null unique,
  file_name     text not null,
  mime_type     text,
  size_bytes    bigint,
  format        text not null default 'imagen' check (format in ('imagen', 'dicom', 'stl', 'pdf', 'otro')),
  taken_on      date not null default current_date,
  teeth         smallint[] not null default '{}',
  description   text,
  uploaded_by   uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  voided_at     timestamptz,
  voided_by     uuid references public.profiles (id) on delete set null,
  void_reason   text,
  check (storage_path like patient_id::text || '/%')
);

create index patient_files_patient_idx on public.patient_files (patient_id, taken_on desc);

create trigger patient_files_audit after insert or update or delete on public.patient_files
  for each row execute function public.audit_trigger();

-- Sólo se permite anular (con motivo) o editar descripción/piezas/fecha/tipo.
create or replace function public.protect_patient_file()
returns trigger
language plpgsql
as $$
begin
  if old.voided_at is not null then
    raise exception 'El archivo está anulado';
  end if;
  if new.patient_id <> old.patient_id or new.storage_path <> old.storage_path
     or new.uploaded_by is distinct from old.uploaded_by or new.created_at <> old.created_at then
    raise exception 'No se puede cambiar el archivo, sólo sus datos descriptivos';
  end if;
  if new.voided_at is not null then
    new.voided_by := coalesce(new.voided_by, auth.uid());
  end if;
  return new;
end;
$$;

create trigger patient_files_protect before update on public.patient_files
  for each row execute function public.protect_patient_file();

alter table public.patient_files enable row level security;

create policy files_select on public.patient_files for select to authenticated
  using (public.can_access_clinical(patient_id));
create policy files_insert on public.patient_files for insert to authenticated
  with check (public.can_write_clinical(patient_id) and uploaded_by = auth.uid());
create policy files_update on public.patient_files for update to authenticated
  using (public.can_write_clinical(patient_id)) with check (public.can_write_clinical(patient_id));

revoke all on public.patient_files from anon;

-- -----------------------------------------------------------------------------
-- Storage: bucket privado y políticas por paciente
-- -----------------------------------------------------------------------------
create or replace function public.storage_patient_id(p_name text)
returns uuid
language plpgsql
immutable
as $$
begin
  return split_part(p_name, '/', 1)::uuid;
exception when others then
  return null;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit)
values ('clinical', 'clinical', false, 209715200)  -- 200 MB (tomografías / escaneos)
on conflict (id) do nothing;

create policy clinical_files_select on storage.objects for select to authenticated
  using (bucket_id = 'clinical' and public.can_access_clinical(public.storage_patient_id(name)));
create policy clinical_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'clinical' and public.can_write_clinical(public.storage_patient_id(name)));
-- Sin UPDATE ni DELETE: los archivos del expediente no se reemplazan ni se borran.
