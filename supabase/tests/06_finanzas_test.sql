-- Fase 6: presupuestos, pagos, corte de caja.
\ir helpers.sql

select pg_temp.login('recepcion@clinica.mx');
insert into patients (first_name, last_name) values ('Ana', 'Torres');
select pg_temp.logout();

create temp table f as select
  (select id from patients where last_name = 'Torres') as ana,
  (select id from patients where last_name = 'Pérez') as maria,
  (select id from patients where last_name = 'Gómez') as luis,
  (select id from profiles where email = 'dra.lopez@clinica.mx') as lopez,
  (select id from branches limit 1) as branch,
  (select id from treatments where name = 'Resina (1 superficie)') as resina;
grant select on f to authenticated;

-- La odontóloga hace el presupuesto de su paciente
select pg_temp.login('dra.lopez@clinica.mx');
insert into treatment_plans (patient_id, dentist_id, title) select maria, lopez, 'Plan inicial' from f;
insert into treatment_plan_items (plan_id, treatment_id, description, tooth, quantity, unit_price, discount_pct)
  select tp.id, f.resina, 'Resina', 16, 2, 800, 10 from treatment_plans tp, f where tp.patient_id = f.maria;
insert into treatment_plan_items (plan_id, description, unit_price)
  select tp.id, 'Limpieza', 600 from treatment_plans tp, f where tp.patient_id = f.maria;
select pg_temp.assert((select line_total from treatment_plan_items where tooth = 16) = 1440, 'total de partida con descuento');
select pg_temp.expect_error($$insert into treatment_plans (patient_id) select ana from f$$, 'odontóloga no presupuesta pacientes ajenos');
update treatment_plans set status = 'aceptado';
select pg_temp.assert((select accepted_at is not null from treatment_plans limit 1), 'aceptación registra la fecha');
update treatment_plan_items set status = 'realizado' where tooth = 16;
select pg_temp.assert((select completed_by = (select lopez from f) and completed_at is not null from treatment_plan_items where tooth = 16), 'realizado registra a la odontóloga');
select pg_temp.expect_error($$update treatment_plan_items set unit_price = 1 where tooth = 16$$, 'no se cambia el precio de lo realizado');
select pg_temp.expect_error($$update treatment_plan_items set status = 'pendiente' where tooth = 16$$, 'sólo admin revierte lo realizado');
select pg_temp.expect_error($$insert into payments (patient_id, branch_id, amount, method) select maria, branch, 100, 'efectivo' from f$$, 'odontóloga no cobra');

select pg_temp.expect_error($$update profiles set commission_pct = 90 where id = auth.uid()$$, 'odontóloga no cambia su comisión');

-- Recepción cobra
select pg_temp.logout();
select pg_temp.login('recepcion@clinica.mx');
select pg_temp.expect_error($$update treatment_plan_items set status = 'realizado' where description = 'Limpieza'$$, 'recepción no marca tratamientos realizados');
insert into payments (patient_id, branch_id, amount, method) select maria, branch, 1000, 'efectivo' from f;
insert into payments (patient_id, branch_id, amount, method, reference) select maria, branch, 200, 'tarjeta_debito', '1234' from f;
select pg_temp.assert((select balance from patient_balances where patient_id = (select maria from f)) = 240, 'saldo = realizado - abonos');
select pg_temp.assert((select pending_treatment from patient_balances where patient_id = (select maria from f)) = 600, 'tratamiento pendiente del plan aceptado');
select pg_temp.expect_error($$update payments set amount = 1 where method = 'efectivo'$$, 'un pago no se modifica');
select pg_temp.expect_error($$update payments set voided = true where method = 'tarjeta_debito'$$, 'cancelar exige motivo');
update payments set voided = true, void_reason = 'Cobro duplicado' where method = 'tarjeta_debito';
select pg_temp.assert((select voided_by is not null from payments where method = 'tarjeta_debito'), 'cancelación registra quién');
select pg_temp.assert((select balance from patient_balances where patient_id = (select maria from f)) = 440, 'pago cancelado no cuenta');
select pg_temp.assert(pg_temp.affected('delete from payments') = 0, 'pagos no se borran');
insert into cash_expenses (branch_id, amount, concept) select branch, 150, 'Garrafones' from f;

-- Corte de caja
insert into cash_closures (branch_id, day, opening_cash, totals, expected_cash, counted_cash)
  select branch, clinic_day(now()), 500, '{"efectivo":1000}', 1350, 1340 from f;
select pg_temp.assert((select difference from cash_closures) = -10, 'diferencia del corte');
select pg_temp.expect_error($$insert into payments (patient_id, branch_id, amount, method) select maria, branch, 50, 'efectivo' from f$$, 'día cerrado no admite pagos');
select pg_temp.expect_error($$update payments set voided = true, void_reason = 'x' where method = 'efectivo'$$, 'día cerrado no admite cancelaciones');
select pg_temp.expect_error($$insert into cash_expenses (branch_id, amount, concept) select branch, 1, 'x' from f$$, 'día cerrado no admite egresos');
select pg_temp.assert(pg_temp.affected('update cash_closures set counted_cash = 1350') = 0, 'el corte no se edita');

-- Dentista no ve caja
select pg_temp.logout();
select pg_temp.login('dra.lopez@clinica.mx');
select pg_temp.assert((select count(*) from cash_closures) = 0, 'odontóloga no ve cortes');
select pg_temp.assert((select count(*) from payments) = 2, 'odontóloga ve pagos de su paciente');
select pg_temp.logout();
select pg_temp.login('dr.ruiz@clinica.mx');
select pg_temp.assert((select count(*) from treatment_plans) = 0, 'otro odontólogo no ve el presupuesto');
select pg_temp.logout();
