-- Fase 3: archivos clínicos y storage.
\ir helpers.sql

create temp table ctx as select id as maria, id::text || '/abc-rx.png' as path from patients where last_name = 'Pérez';
grant select on ctx to authenticated;

select pg_temp.login('dra.lopez@clinica.mx');
insert into storage.objects (bucket_id, name) select 'clinical', path from ctx;
insert into patient_files (patient_id, kind, storage_path, file_name, uploaded_by)
  select maria, 'periapical', path, 'rx.png', auth.uid() from ctx;
select pg_temp.assert((select count(*) from storage.objects) = 1, 'odontóloga sube archivo a su paciente');
select pg_temp.expect_error($$insert into patient_files (patient_id, kind, storage_path, file_name) select maria, 'otro', 'otro-paciente/x.png', 'x' from ctx$$, 'la ruta debe empezar con el id del paciente');
update patient_files set description = 'Periapical 16';
select pg_temp.expect_error($$update patient_files set storage_path = storage_path || 'x'$$, 'no se reemplaza el archivo');
select pg_temp.assert(pg_temp.affected('delete from patient_files') = 0, 'archivos no se borran');
select pg_temp.assert(pg_temp.affected('delete from storage.objects') = 0, 'objetos de storage no se borran');
select pg_temp.logout();

select pg_temp.login('dr.ruiz@clinica.mx');
select pg_temp.assert((select count(*) from patient_files) = 0, 'otro odontólogo no ve archivos ajenos');
select pg_temp.assert((select count(*) from storage.objects) = 0, 'otro odontólogo no descarga archivos ajenos');
select pg_temp.expect_error($$insert into storage.objects (bucket_id, name) select 'clinical', maria::text || '/y.png' from ctx$$, 'otro odontólogo no sube a paciente ajeno');
select pg_temp.logout();

select pg_temp.login('recepcion@clinica.mx');
select pg_temp.assert((select count(*) from storage.objects) = 0, 'recepción no descarga radiografías');
select pg_temp.expect_error($$insert into storage.objects (bucket_id, name) select 'clinical', maria::text || '/z.png' from ctx$$, 'recepción no sube archivos clínicos');
select pg_temp.logout();
