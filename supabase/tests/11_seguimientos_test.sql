-- Seguimientos (recall): el doctor los programa desde la nota; recepción les da seguimiento.
\ir helpers.sql

create temp table rc as select id as maria from patients where last_name = 'Pérez';
grant select on rc to authenticated;

-- La odontóloga tratante lo programa a su nombre.
select pg_temp.login('dra.lopez@clinica.mx');
insert into patient_recalls (patient_id, dentist_id, due_on, reason)
  select maria, auth.uid(), current_date + 180, 'Limpieza de control' from rc;
select pg_temp.assert((select count(*) from patient_recalls) = 1, 'la odontóloga crea y ve su seguimiento');
select pg_temp.expect_error($$insert into patient_recalls (patient_id, due_on, reason, created_by)
  select maria, current_date + 30, 'x y z', (select id from profiles where email = 'dr.ruiz@clinica.mx') from rc$$, 'no se crea a nombre de otro');
select pg_temp.assert(pg_temp.affected('delete from patient_recalls') = 0, 'los seguimientos no se borran');
select pg_temp.logout();

-- Otro odontólogo sin acceso al expediente no lo programa ni lo modifica.
select pg_temp.login('dr.ruiz@clinica.mx');
select pg_temp.expect_error($$insert into patient_recalls (patient_id, due_on, reason) select maria, current_date + 30, 'Revisión' from rc$$,
  'odontólogo ajeno no programa seguimientos');
select pg_temp.assert(pg_temp.affected($$update patient_recalls set due_on = current_date + 1$$) = 0, 'odontólogo ajeno no cambia la fecha');
select pg_temp.logout();

-- Recepción ve la lista, cambia la fecha y cancela con motivo; no los crea.
select pg_temp.login('recepcion@clinica.mx');
select pg_temp.assert((select count(*) from patient_recalls) = 1, 'recepción ve los seguimientos');
select pg_temp.expect_error($$insert into patient_recalls (patient_id, due_on, reason) select maria, current_date + 30, 'Revisión' from rc$$,
  'recepción no programa seguimientos');
select pg_temp.assert(pg_temp.affected($$update patient_recalls set due_on = current_date + 200$$) = 1, 'recepción cambia la fecha');
select pg_temp.expect_error($$update patient_recalls set status = 'cancelado'$$, 'cancelar exige motivo');
select pg_temp.expect_error($$update patient_recalls set patient_id = (select id from patients where id <> patient_id limit 1)$$,
  'no se cambia el paciente de un seguimiento');
select pg_temp.assert(pg_temp.affected($$update patient_recalls set status = 'cancelado', cancel_reason = 'Se mudó de ciudad'$$) = 1,
  'recepción cancela con motivo');
select pg_temp.logout();

select pg_temp.assert((select count(*) from audit_log where table_name = 'patient_recalls') >= 3, 'los cambios quedan en la bitácora');

-- El bot (llave de servicio) lo marca como enviado.
select pg_temp.assert(pg_temp.affected($$update patient_recalls set status = 'enviado', sent_count = 1, sent_at = now(), cancel_reason = null$$) = 1,
  'el bot marca el envío');
select pg_temp.expect_error($$update patient_recalls set sent_count = 3$$, 'a lo más dos mensajes por seguimiento');
