-- Fase 8: cuestionario en tablet.
\ir helpers.sql

create temp table q as select id as maria from patients where last_name = 'Pérez';
grant select on q to authenticated;

select pg_temp.login('recepcion@clinica.mx');
insert into patient_questionnaires (patient_id, answers, signer_name, signature)
  select maria, '{"allergies":["Penicilina"]}', 'María Pérez', 'data:image/png;base64,AAAA' from q;
select pg_temp.assert((select count(*) from patient_questionnaires) = 0, 'recepción entrega la tablet pero no lee las respuestas');
select pg_temp.expect_error($$insert into patient_questionnaires (patient_id, answers, signer_name, signature) select maria, '{}', 'x', 'no-es-firma' from q$$, 'exige firma');
select pg_temp.logout();

select pg_temp.login('dra.lopez@clinica.mx');
select pg_temp.assert((select count(*) from patient_questionnaires) = 1, 'la odontóloga lo ve');
select pg_temp.expect_error($$update patient_questionnaires set answers = '{}'$$, 'las respuestas firmadas no se cambian');
update patient_questionnaires set reviewed_at = now();
select pg_temp.assert((select reviewed_by = auth.uid() from patient_questionnaires limit 1), 'revisión registra a la odontóloga');
select pg_temp.assert(pg_temp.affected('delete from patient_questionnaires') = 0, 'no se borran');
select pg_temp.logout();
select pg_temp.login('dr.ruiz@clinica.mx');
select pg_temp.assert((select count(*) from patient_questionnaires) = 0, 'otro odontólogo no lo ve');
select pg_temp.logout();
