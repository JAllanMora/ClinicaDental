-- Fase 7: inventario y laboratorio.
\ir helpers.sql

create temp table ajeno as select id from patients where last_name = 'Torres';
grant select on ajeno to authenticated;

select pg_temp.login('recepcion@clinica.mx');
insert into inventory_items (branch_id, name, unit, min_stock) select id, 'Anestesia lidocaína', 'cartucho', 50 from branches limit 1;
create temp table inv as select id as item from inventory_items where name = 'Anestesia lidocaína';
grant select on inv to authenticated;
select inventory_in((select item from inv), 30, 'L-B', current_date + 200, 8.5);
select inventory_in((select item from inv), 20, 'L-A', current_date + 20, 8.5);
select pg_temp.assert((select stock from inventory_stock where item_id = (select item from inv)) = 50, 'stock suma lotes');
select pg_temp.assert((select next_expiry from inventory_stock where item_id = (select item from inv)) = current_date + 20, 'próxima caducidad');
select pg_temp.expect_error($$insert into inventory_lots (item_id, received_qty, remaining) select item, 5, 5 from inv$$, 'no se escriben lotes directo');
select pg_temp.assert(pg_temp.affected('update inventory_lots set remaining = 999') = 0, 'no se edita el stock directo');
select pg_temp.logout();

select pg_temp.login('dra.lopez@clinica.mx');
select inventory_out((select item from inv), 25, 'salida', 'Consumo del día');
select pg_temp.assert((select remaining from inventory_lots where lot_code = 'L-A') = 0, 'sale primero el lote que caduca antes');
select pg_temp.assert((select remaining from inventory_lots where lot_code = 'L-B') = 25, 'el resto del lote siguiente');
select pg_temp.assert((select count(*) from inventory_movements where kind = 'salida') = 2, 'un movimiento por lote');
select pg_temp.expect_error($$select inventory_out((select item from inv), 100)$$, 'no hay salida sin existencias');
select pg_temp.expect_error($$insert into inventory_items (branch_id, name) select id, 'X' from branches limit 1$$, 'odontóloga no da de alta artículos');

-- Laboratorio
select pg_temp.logout();
select pg_temp.login('admin@clinica.mx');
insert into labs (name, phone) values ('Laboratorio Dental Hidalgo', '771 000 0000');
select pg_temp.logout();
select pg_temp.login('dra.lopez@clinica.mx');
insert into lab_orders (patient_id, dentist_id, lab_id, work_type, teeth, shade, due_date, cost)
  select (select id from patients where last_name = 'Pérez'), auth.uid(), (select id from labs limit 1), 'Corona de zirconia', '16', 'A2', current_date + 7, 1800;
select pg_temp.expect_error($$insert into lab_orders (patient_id, dentist_id, work_type) select id, auth.uid(), 'x' from ajeno$$, 'odontóloga no pide trabajos de pacientes ajenos');
update lab_orders set status = 'enviado';
select pg_temp.assert((select sent_at is not null from lab_orders limit 1), 'envío registra fecha');
select pg_temp.logout();
select pg_temp.login('recepcion@clinica.mx');
update lab_orders set status = 'recibido';
select pg_temp.assert((select count(*) from lab_order_events) = 3, 'historial de estados');
select pg_temp.assert((select received_at is not null from lab_orders limit 1), 'recepción registra fecha');
select pg_temp.logout();
select pg_temp.login('dr.ruiz@clinica.mx');
select pg_temp.assert((select count(*) from lab_orders) = 0, 'otro odontólogo no ve el trabajo');
select pg_temp.logout();
