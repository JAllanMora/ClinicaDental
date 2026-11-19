-- Fase 10: doctores por tipo de cita, costos y comisiones sólo para el admin, gastos.
\ir helpers.sql

create temp table z as
  select (select id from profiles where email = 'dra.lopez@clinica.mx') as lopez,
         (select id from profiles where email = 'dr.ruiz@clinica.mx') as ruiz;
grant select on z to authenticated;
insert into appointment_types (name, duration_minutes) values ('Endodoncia (prueba fase 10)', 30);

-- Doctores por tipo de cita: sólo el admin los define.
select pg_temp.login('recepcion@clinica.mx');
select pg_temp.expect_error($$insert into appointment_type_dentists (type_id, dentist_id)
  select (select id from appointment_types where name like 'Endodoncia (prueba%'), lopez from z$$, 'recepción no asigna doctores a un tipo de cita');
select pg_temp.logout();
select pg_temp.login('admin@clinica.mx');
-- Ruiz trabaja todos los lunes a viernes; López sigue de vacaciones (prueba 09).
select set_working_hours(ruiz, '[{"weekday":1,"starts":"09:00","ends":"12:00"},{"weekday":2,"starts":"09:00","ends":"12:00"},{"weekday":3,"starts":"09:00","ends":"12:00"},{"weekday":4,"starts":"09:00","ends":"12:00"},{"weekday":5,"starts":"09:00","ends":"12:00"}]') from z;
insert into appointment_type_dentists (type_id, dentist_id)
  select (select id from appointment_types where name like 'Endodoncia (prueba%'), lopez from z;
select pg_temp.logout();

select pg_temp.assert(
  (select count(*) from available_slots(30, (current_date + 1)::timestamptz, (current_date + 15)::timestamptz)) > 0,
  'sin tipo de cita se ofrece a cualquier doctor');
select pg_temp.assert(
  (select count(*) from available_slots(30, (current_date + 1)::timestamptz, (current_date + 15)::timestamptz, null, null,
     (select id from appointment_types where name like 'Endodoncia (prueba%'))) = 0,
  'con tipo de cita sólo se ofrecen sus doctores');
select pg_temp.assert(
  (select bool_and(dentist_id = (select ruiz from z)) from available_slots(30, (current_date + 1)::timestamptz, (current_date + 15)::timestamptz, null, null,
     (select id from appointment_types where name = 'Limpieza' limit 1))) is not false,
  'un tipo sin doctores asignados se ofrece con cualquiera');

-- Comisiones: el odontólogo no ve ni cambia las reglas.
select pg_temp.login('dra.lopez@clinica.mx');
select pg_temp.assert((select count(*) from commission_rates) = 0, 'odontóloga no ve las comisiones');
select pg_temp.expect_error($$insert into commission_rates (dentist_id, pct) select lopez, 90 from z$$, 'odontóloga no se pone comisión');
select pg_temp.expect_error($$select commission_pct_for(auth.uid(), null)$$, 'odontóloga no consulta porcentajes');
select pg_temp.logout();
select pg_temp.login('admin@clinica.mx');
insert into commission_rates (dentist_id, pct) select lopez, 40 from z
  on conflict (dentist_id, treatment_id) do update set pct = excluded.pct;
select pg_temp.logout();

-- Prioridad de reglas: odontólogo + tratamiento > tratamiento > odontólogo.
insert into treatments (name, price) values ('Tratamiento comisión prueba', 1000);
insert into commission_rates (treatment_id, pct) select id, 20 from treatments where name = 'Tratamiento comisión prueba';
select pg_temp.assert(commission_pct_for((select lopez from z), (select id from treatments where name = 'Tratamiento comisión prueba')) = 20, 'la regla del tratamiento gana a la del odontólogo');
insert into commission_rates (dentist_id, treatment_id, pct) select lopez, (select id from treatments where name = 'Tratamiento comisión prueba'), 55 from z;
select pg_temp.assert(commission_pct_for((select lopez from z), (select id from treatments where name = 'Tratamiento comisión prueba')) = 55, 'la regla odontólogo + tratamiento gana a todas');
select pg_temp.assert(commission_pct_for((select ruiz from z), null) = 0, 'sin regla la comisión es 0');

-- Costo de laboratorio: sólo el admin.
update lab_orders set plan_item_id = (select id from treatment_plan_items where tooth = 16 and status = 'realizado' limit 1)
  where work_type = 'Corona de zirconia';
select pg_temp.login('dra.lopez@clinica.mx');
select pg_temp.expect_error($$insert into lab_order_costs (order_id, cost) select id, 100 from lab_orders limit 1$$, 'odontóloga no captura costos');
select pg_temp.assert((select count(*) from lab_order_costs) = 0, 'odontóloga no ve costos');
-- Reporte: ve sólo lo suyo, sin costo ni porcentaje.
select pg_temp.assert((select count(*) > 0 and bool_and(dentist_id = auth.uid()) from commission_report(now() - interval '1 day', now() + interval '1 day')), 'odontóloga ve sus comisiones');
select pg_temp.assert((select bool_and(lab_cost is null and pct is null) from commission_report(now() - interval '1 day', now() + interval '1 day')), 'sin costo de laboratorio ni porcentaje');
select pg_temp.assert(
  (select commission = round(line_total * 0.40, 2) from commission_report(now() - interval '1 day', now() + interval '1 day') where tooth = '16'),
  'la comisión usa el porcentaje del odontólogo');
select pg_temp.logout();
select pg_temp.login('admin@clinica.mx');
insert into lab_order_costs (order_id, cost) select id, 100 from lab_orders where work_type = 'Corona de zirconia';
select pg_temp.assert(
  (select lab_cost = 100 and pct = 40 and commission = round((line_total - 100) * 0.40, 2)
   from commission_report(now() - interval '1 day', now() + interval '1 day') where tooth = '16'),
  'el admin ve el costo y la comisión descuenta el laboratorio');
select pg_temp.logout();
select pg_temp.login('recepcion@clinica.mx');
select pg_temp.assert((select count(*) from commission_report(now() - interval '1 day', now() + interval '1 day')) = 0, 'recepción no ve comisiones');
select pg_temp.assert((select count(*) from lab_order_costs) = 0, 'recepción no ve costos de laboratorio');

-- Inventario: el costo sólo lo guarda el admin.
select inventory_in((select id from inventory_items limit 1), 5, 'L-REC', current_date + 100, 99);
select pg_temp.logout();
select pg_temp.assert((select count(*) from inventory_lot_costs c join inventory_lots l on l.id = c.lot_id where l.lot_code = 'L-REC') = 0, 'el costo que captura recepción no se guarda');
select pg_temp.login('admin@clinica.mx');
select inventory_in((select id from inventory_items limit 1), 5, 'L-ADM', current_date + 100, 77);
select pg_temp.assert((select unit_cost = 77 from inventory_lot_costs c join inventory_lots l on l.id = c.lot_id where l.lot_code = 'L-ADM'), 'el admin captura el costo del lote');

-- Gastos: sólo el admin; no se editan, se anulan; los fijos se registran una vez por mes.
insert into expenses (category, concept, amount) values ('renta', 'Renta del local', 12000);
select pg_temp.expect_error($$update expenses set amount = 1 where concept = 'Renta del local'$$, 'un gasto no se edita');
select pg_temp.expect_error($$update expenses set voided = true where concept = 'Renta del local'$$, 'anular pide motivo');
update expenses set voided = true, void_reason = 'Duplicado' where concept = 'Renta del local';
select pg_temp.assert(pg_temp.affected($$delete from expenses$$) = 0, 'los gastos no se borran');
insert into recurring_expenses (category, concept, amount, day_of_month) values ('servicios', 'Internet', 600, 5), ('renta', 'Renta', 12000, 1);
select pg_temp.assert(apply_recurring_expenses(current_date) = 2, 'registra los gastos fijos del mes');
select pg_temp.assert(apply_recurring_expenses(current_date) = 0, 'no los duplica');
select pg_temp.logout();
select pg_temp.login('recepcion@clinica.mx');
select pg_temp.assert((select count(*) from expenses) = 0, 'recepción no ve los gastos');
select pg_temp.expect_error($$insert into expenses (category, concept, amount) values ('otros', 'x', 1)$$, 'recepción no registra gastos');
select pg_temp.expect_error($$select apply_recurring_expenses(current_date)$$, 'recepción no aplica gastos fijos');
select pg_temp.logout();
select pg_temp.login('dra.lopez@clinica.mx');
select pg_temp.assert((select count(*) from recurring_expenses) = 0, 'odontóloga no ve gastos fijos');
select pg_temp.logout();
