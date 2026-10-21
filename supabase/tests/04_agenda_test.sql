-- Fase 4: agenda.
\ir helpers.sql

create temp table ctx as
select
  (select id from patients where last_name = 'Pérez') as maria,
  (select id from patients where last_name = 'Gómez') as luis,
  (select id from profiles where email = 'dra.lopez@clinica.mx') as lopez,
  (select id from profiles where email = 'dr.ruiz@clinica.mx') as ruiz,
  (select id from chairs order by name limit 1) as s1,
  (select id from chairs order by name offset 1 limit 1) as s2,
  (select id from appointment_types where name = 'Limpieza') as limpieza;
grant select on ctx to authenticated;

select pg_temp.login('recepcion@clinica.mx');
insert into appointments (patient_id, dentist_id, chair_id, type_id, starts_at, ends_at)
  select maria, lopez, s1, limpieza, '2026-11-02 10:00-06', '2026-11-02 10:30-06' from ctx;
select pg_temp.expect_error($$insert into appointments (patient_id, dentist_id, chair_id, starts_at, ends_at) select luis, ruiz, s1, '2026-11-02 10:15-06', '2026-11-02 10:45-06' from ctx$$, 'no se empalman citas en el mismo sillón');
select pg_temp.expect_error($$insert into appointments (patient_id, dentist_id, chair_id, starts_at, ends_at) select luis, lopez, s2, '2026-11-02 10:15-06', '2026-11-02 10:45-06' from ctx$$, 'no se empalman citas del mismo odontólogo');
-- Dr. Ruiz atiende a Luis (paciente de la Dra. López) en otro sillón
insert into appointments (patient_id, dentist_id, chair_id, starts_at, ends_at)
  select luis, ruiz, s2, '2026-11-02 10:00-06', '2026-11-02 11:00-06' from ctx;
-- Cancelar libera el espacio
update appointments set status = 'cancelada', cancel_reason = 'Paciente avisó' where dentist_id = (select lopez from ctx);
insert into appointments (patient_id, dentist_id, chair_id, starts_at, ends_at)
  select maria, lopez, s1, '2026-11-02 10:00-06', '2026-11-02 10:45-06' from ctx;
select pg_temp.assert((select count(*) from appointments) = 3, 'cancelada libera el horario');
update appointments set status = 'confirmada' where status = 'programada' and patient_id = (select maria from ctx);
select pg_temp.assert((select confirmed_at is not null from appointments where status = 'confirmada'), 'confirmación registra la hora');
select pg_temp.assert(pg_temp.affected('delete from appointments') = 0, 'recepción no borra citas');
insert into waitlist (patient_id, type_id, notes) select luis, limpieza, 'Puede venir en la mañana' from ctx;
select pg_temp.logout();

-- La cita le dio acceso al Dr. Ruiz al expediente de Luis
select pg_temp.login('dr.ruiz@clinica.mx');
select pg_temp.assert((select count(*) from patients where last_name = 'Gómez') = 1, 'odontólogo de la cita entra al equipo de atención');
select pg_temp.assert((select count(*) from appointments) = 3, 'odontólogo ve toda la agenda');
select pg_temp.assert((select count(*) from appointments a join patients p on p.id = a.patient_id where p.last_name = 'Pérez') = 0, 'citas ajenas sin datos del paciente');
select pg_temp.expect_error($$insert into appointments (patient_id, dentist_id, chair_id, starts_at, ends_at) select luis, lopez, s2, '2026-11-03 10:00-06', '2026-11-03 11:00-06' from ctx$$, 'odontólogo no agenda a nombre de otro');
select pg_temp.assert(pg_temp.affected($$update appointments set notes = 'x' where dentist_id = (select lopez from ctx)$$) = 0, 'odontólogo no modifica citas ajenas');
insert into appointments (patient_id, dentist_id, chair_id, starts_at, ends_at)
  select luis, ruiz, s2, '2026-11-03 12:00-06', '2026-11-03 13:00-06' from ctx;
select pg_temp.logout();

select pg_temp.login('admin@clinica.mx');
select pg_temp.assert((select count(*) from audit_log where table_name = 'appointments') >= 6, 'bitácora registra citas');
select pg_temp.assert((select count(*) from appointment_types) >= 10, 'tipos de cita iniciales');
select pg_temp.logout();
