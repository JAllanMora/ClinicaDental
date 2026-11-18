-- Fase 9: horarios por odontólogo y bot de WhatsApp.
\ir helpers.sql

create temp table w as
  select (select id from profiles where email = 'dra.lopez@clinica.mx') as lopez,
         (select id from profiles where email = 'dr.ruiz@clinica.mx') as ruiz;
grant select on w to authenticated;

-- Turnos: cada odontólogo edita los suyos; el admin, los de todos.
select pg_temp.login('dra.lopez@clinica.mx');
select set_working_hours(lopez, '[{"weekday":1,"starts":"10:00","ends":"11:00"}]') from w;
select pg_temp.assert((select count(*) from working_hours where dentist_id = (select lopez from w)) = 1, 'la odontóloga guarda su horario');
select pg_temp.expect_error($$select set_working_hours(ruiz, '[]') from w$$, 'no edita el horario de otro');
select pg_temp.expect_error($$select set_working_hours(lopez, '[{"weekday":2,"starts":"09:00","ends":"12:00"},{"weekday":2,"starts":"11:00","ends":"13:00"}]') from w$$, 'rechaza turnos empalmados');
select pg_temp.logout();
select pg_temp.login('recepcion@clinica.mx');
select pg_temp.expect_error($$select set_working_hours(lopez, '[]') from w$$, 'recepción no cambia turnos');
select pg_temp.assert(pg_temp.affected($$update whatsapp_settings set days_ahead = 3$$) = 0, 'recepción no cambia la configuración del bot');
select pg_temp.logout();
select pg_temp.login('admin@clinica.mx');
select set_working_hours(ruiz, '[]') from w;
select pg_temp.assert(pg_temp.affected($$update whatsapp_settings set days_ahead = 30$$) = 1, 'admin configura el bot');
select pg_temp.logout();

-- Horarios libres: sólo dentro de los turnos y sin días bloqueados.
create temp table s as
  select * from available_slots(30, (current_date + 1)::timestamptz, (current_date + 15)::timestamptz);
select pg_temp.assert((select count(*) from s) > 0, 'hay horarios libres');
select pg_temp.assert(
  (select bool_and(extract(dow from starts_at at time zone 'America/Mexico_City') = 1
                   and (starts_at at time zone 'America/Mexico_City')::time between '10:00' and '10:30') from s),
  'sólo ofrece el turno del lunes de 10 a 11');
select pg_temp.assert((select bool_and(dentist_id = (select lopez from w)) from s), 'el odontólogo sin turnos no se ofrece');

insert into schedule_blocks (dentist_id, starts_at, ends_at, reason)
  select lopez, (current_date + 1)::timestamptz, (current_date + 15)::timestamptz, 'Vacaciones' from w;
select pg_temp.assert(
  (select count(*) from available_slots(30, (current_date + 1)::timestamptz, (current_date + 15)::timestamptz)) = 0,
  'los días bloqueados no se ofrecen');

-- Bitácora: el personal la ve y marca atendido, pero no cambia el texto.
insert into whatsapp_messages (phone, direction, body, needs_attention) values ('8112345678', 'entrante', 'Quiero hablar con alguien', true);
select pg_temp.login('recepcion@clinica.mx');
select pg_temp.assert((select count(*) from whatsapp_messages) = 1, 'recepción ve los chats');
update whatsapp_messages set attended_at = now(), attended_by = auth.uid();
select pg_temp.assert((select attended_at is not null from whatsapp_messages), 'recepción marca atendido');
select pg_temp.expect_error($$update whatsapp_messages set body = 'otro'$$, 'el texto no se cambia');
select pg_temp.assert(pg_temp.affected($$delete from whatsapp_messages$$) = 0, 'no se borran');
select pg_temp.expect_error($$select * from patient_by_phone('8112345678')$$, 'buscar por teléfono es sólo para el bot');
select pg_temp.logout();
