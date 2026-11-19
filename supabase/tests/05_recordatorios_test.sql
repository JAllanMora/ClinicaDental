-- Fase 5: recordatorios y confirmación por enlace.
\ir helpers.sql

-- Cita futura para probar el enlace de confirmación.
select pg_temp.login('recepcion@clinica.mx');
insert into appointments (patient_id, dentist_id, chair_id, starts_at, ends_at)
  select (select id from patients where last_name = 'Gómez'), (select id from profiles where email = 'dr.ruiz@clinica.mx'),
         (select id from chairs order by name limit 1), now() + interval '2 days', now() + interval '2 days 30 minutes';
create temp table tok as select confirm_token as t from appointments where starts_at > now() + interval '1 day' limit 1;
grant select on tok to anon, authenticated;
select pg_temp.logout();

set role anon;
select pg_temp.assert((select count(*) from appointment_by_token((select t from tok))) = 1, 'el paciente ve su cita con el token');
select pg_temp.assert((select count(*) from appointment_by_token(gen_random_uuid())) = 0, 'token inválido no muestra nada');
select pg_temp.expect_error('select * from appointments', 'anónimo no lee citas');
select pg_temp.assert(respond_appointment((select t from tok), 'confirmada'), 'el paciente confirma con el enlace');
select pg_temp.expect_error($$select respond_appointment((select t from tok), 'borrar')$$, 'respuesta inválida rechazada');
reset role;
select pg_temp.assert((select status = 'confirmada' and patient_response = 'confirmada' and confirmed_at is not null from appointments where confirm_token = (select t from tok)), 'la cita queda confirmada');
select pg_temp.assert((select count(*) from audit_log where table_name = 'appointments' and action = 'UPDATE' and new_data->>'patient_response' = 'confirmada') = 1, 'bitácora registra la confirmación del paciente');

-- Citas pasadas no se pueden confirmar
select pg_temp.assert(not respond_appointment((select confirm_token from appointments where starts_at < now() limit 1), 'confirmada'), 'citas pasadas no aceptan respuesta');

-- Configuración: sólo admin
select pg_temp.logout();
select pg_temp.login('dra.lopez@clinica.mx');
select pg_temp.assert(pg_temp.affected($$update reminder_settings set days_before = 2$$) = 0, 'odontóloga no cambia la configuración');
select pg_temp.assert((select count(*) from reminder_settings) = 1, 'personal lee la configuración');
select pg_temp.logout();
select pg_temp.login('admin@clinica.mx');
select pg_temp.assert(pg_temp.affected($$update reminder_settings set days_before = 2$$) = 1, 'admin cambia la configuración');

-- Bitácora de mensajes
select pg_temp.logout();
select pg_temp.login('recepcion@clinica.mx');
insert into notifications (patient_id, channel, recipient, body, status)
  select id, 'whatsapp', '+527710001122', 'hola', 'simulado' from patients where last_name = 'Gómez';
select pg_temp.expect_error($$insert into notifications (patient_id, channel, recipient, body, sent_by) select id, 'sms', '1', 'x', (select id from profiles where email = 'admin@clinica.mx') from patients limit 1$$, 'no se registran mensajes a nombre de otro');
select pg_temp.assert(pg_temp.affected('delete from notifications') = 0, 'los mensajes no se borran');
select pg_temp.logout();

-- Reprogramar reinicia recordatorio y confirmación
select pg_temp.login('recepcion@clinica.mx');
update appointments set reminder_sent_at = now() where confirm_token = (select t from tok);
update appointments set starts_at = starts_at + interval '1 hour', ends_at = ends_at + interval '1 hour' where confirm_token = (select t from tok);
select pg_temp.assert((select reminder_sent_at is null and patient_response is null and status = 'programada' from appointments where confirm_token = (select t from tok)), 'reprogramar reinicia recordatorio y confirmación');
select pg_temp.logout();
