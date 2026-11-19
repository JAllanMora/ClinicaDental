-- Fase 2: odontograma, periodontograma, notas de evolución y consentimientos.
-- Usa los datos creados por 01_base_test.sql.
\ir helpers.sql

create temp table ctx as select id as maria from patients where last_name = 'Pérez';
grant select on ctx to authenticated;

-- Dra. López (equipo de atención) registra datos clínicos
select pg_temp.login('dra.lopez@clinica.mx');
insert into dental_findings (patient_id, tooth, surface, condition, layer)
  select maria, 16, 'O', 'caries', 'patologia' from ctx;
insert into dental_findings (patient_id, tooth, condition, layer)
  select maria, 46, 'endodoncia', 'propuesto' from ctx;
select pg_temp.expect_error($$insert into dental_findings (patient_id, tooth, condition, layer) select maria, 19, 'caries', 'patologia' from ctx$$, 'pieza inexistente (19) rechazada');
select pg_temp.expect_error($$insert into dental_findings (patient_id, tooth, condition, layer) select maria, 56, 'caries', 'patologia' from ctx$$, 'pieza temporal inexistente (56) rechazada');
insert into dental_findings (patient_id, tooth, condition, layer) select maria, 55, 'caries', 'patologia' from ctx;
update dental_findings set layer = 'realizado' where tooth = 46;
select pg_temp.assert((select completed_at is not null and completed_by = auth.uid() from dental_findings where tooth = 46), 'completar registra fecha y autor');
select pg_temp.expect_error($$update dental_findings set tooth = 17 where tooth = 16$$, 'no se puede cambiar la pieza de un hallazgo');
update dental_findings set voided_at = now(), void_reason = 'error de captura' where tooth = 55;
select pg_temp.expect_error($$update dental_findings set layer = 'realizado' where tooth = 55$$, 'hallazgo anulado no se modifica');
select pg_temp.assert(pg_temp.affected('delete from dental_findings') = 0, 'hallazgos no se pueden borrar');

insert into periodontal_exams (patient_id, data)
  select maria, '{"16":{"mobility":1,"sites":{"MV":{"pd":5,"rec":1,"bop":true,"sup":false}}}}' from ctx;
update periodontal_exams set notes = 'Gingivitis generalizada';

insert into clinical_notes (patient_id, teeth, procedure, materials)
  select maria, '{46}', 'Endodoncia', 'Limas K, gutapercha, AH Plus' from ctx;
insert into clinical_notes (patient_id, procedure, description, amends_note_id)
  select maria, 'Adenda', 'Se agrega conductometría 21 mm', (select id from clinical_notes limit 1) from ctx;
select pg_temp.assert(pg_temp.affected('update clinical_notes set procedure = $x$x$x$') = 0, 'notas de evolución inmutables');
select pg_temp.assert(pg_temp.affected('delete from clinical_notes') = 0, 'notas de evolución no se borran');
select pg_temp.expect_error($$insert into clinical_notes (patient_id, procedure, dentist_id) select maria, 'x', (select id from profiles where email = 'dr.ruiz@clinica.mx') from ctx$$, 'no se firma una nota a nombre de otro');

insert into consents (patient_id, title, body, signer_name, signature)
  select maria, 'General', 'Texto', 'María José Pérez', 'data:image/png;base64,AAAA' from ctx;
select pg_temp.expect_error($$update consents set body = 'otro texto'$$, 'consentimiento firmado no se edita');
update consents set revoked_at = now(), revoked_reason = 'La paciente lo solicitó';
select pg_temp.expect_error($$update consents set revoked_reason = 'x'$$, 'consentimiento revocado queda cerrado');
select pg_temp.expect_error($$insert into consents (patient_id, title, body, signer_name, signature) select maria, 'x', 'x', 'x', 'no-es-imagen' from ctx$$, 'firma debe ser imagen PNG');
select pg_temp.assert((select count(*) from consent_templates) >= 4, 'plantillas de consentimiento disponibles');
select pg_temp.expect_error($$insert into consent_templates (title, body) values ('x', 'x')$$, 'odontólogo no edita plantillas');
select pg_temp.logout();

-- Otro odontólogo y recepción no ven nada clínico
select pg_temp.login('dr.ruiz@clinica.mx');
select pg_temp.assert((select count(*) from dental_findings) + (select count(*) from periodontal_exams)
  + (select count(*) from clinical_notes) + (select count(*) from consents) = 0, 'otro odontólogo no ve expediente ajeno');
select pg_temp.expect_error($$insert into dental_findings (patient_id, tooth, condition, layer) select maria, 11, 'caries', 'patologia' from ctx$$, 'otro odontólogo no escribe en expediente ajeno');
select pg_temp.logout();

select pg_temp.login('recepcion@clinica.mx');
select pg_temp.assert((select count(*) from dental_findings) + (select count(*) from clinical_notes) + (select count(*) from consents) = 0, 'recepción no ve expediente clínico');
select pg_temp.assert((select count(*) from consent_templates) >= 4, 'recepción ve plantillas de consentimiento');
select pg_temp.expect_error($$insert into clinical_notes (patient_id, procedure) select maria, 'x' from ctx$$, 'recepción no escribe notas');
select pg_temp.logout();

-- Admin ve todo y la bitácora lo registra
select pg_temp.login('admin@clinica.mx');
select pg_temp.assert((select count(*) from dental_findings) = 3, 'admin ve odontograma');
select pg_temp.assert((select count(*) from audit_log where table_name = 'dental_findings') >= 5, 'bitácora registra odontograma');
select pg_temp.assert((select count(*) from audit_log where table_name = 'consents') = 2, 'bitácora registra firma y revocación');
select pg_temp.logout();
