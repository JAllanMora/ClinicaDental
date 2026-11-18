-- =============================================================================
-- Datos de demostración para desarrollo local (`npx supabase start` / `db reset`).
-- NO se aplica en producción: `supabase db push` sólo sube las migraciones.
--
-- Usuarios (contraseña para todos: Clinica2026!)
--   admin@clinica.local      Administrador
--   dentista@clinica.local   Odontóloga (Dra. Ana López)
--   dentista2@clinica.local  Odontólogo (Dr. Carlos Ruiz)
--   recepcion@clinica.local  Recepción
-- =============================================================================
set search_path = public, extensions;

-- -----------------------------------------------------------------------------
-- Usuarios. El trigger on_auth_user_created crea su perfil; el primero es admin.
-- -----------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
)
select
  '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
  crypt('Clinica2026!', gen_salt('bf')), now(),
  jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'role', u.app_role),
  jsonb_build_object('full_name', u.full_name), now(), now(),
  '', '', '', ''
from (values
  (1, '00000000-0000-4000-a000-000000000001'::uuid, 'admin@clinica.local',     'Javier Allan Mora', 'admin'),
  (2, '00000000-0000-4000-a000-000000000002'::uuid, 'dentista@clinica.local',  'Dra. Ana López',    'dentist'),
  (3, '00000000-0000-4000-a000-000000000003'::uuid, 'dentista2@clinica.local', 'Dr. Carlos Ruiz',   'dentist'),
  (4, '00000000-0000-4000-a000-000000000004'::uuid, 'recepcion@clinica.local', 'Lucía Hernández',   'reception')
) as u(n, id, email, full_name, app_role)
order by u.n;

insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id::text, u.id,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
from auth.users u
where u.email like '%@clinica.local';

update public.profiles set active = true;
update public.profiles set specialty = 'Odontología general', professional_id = '12345678', color = '#C2187A', commission_pct = 40
  where email = 'dentista@clinica.local';
update public.profiles set specialty = 'Endodoncia', professional_id = '87654321', color = '#6366F1', commission_pct = 35
  where email = 'dentista2@clinica.local';

-- Turnos: lunes a viernes 9–14 y 16–20, sábado 9–14.
insert into public.working_hours (dentist_id, weekday, starts, ends)
select p.id, d.weekday, d.starts, d.ends
from public.profiles p
cross join (values
  (1::smallint, time '09:00', time '14:00'), (1, '16:00', '20:00'),
  (2, '09:00', '14:00'), (2, '16:00', '20:00'),
  (3, '09:00', '14:00'), (3, '16:00', '20:00'),
  (4, '09:00', '14:00'), (4, '16:00', '20:00'),
  (5, '09:00', '14:00'), (5, '16:00', '20:00'),
  (6, '09:00', '14:00')
) as d (weekday, starts, ends)
where p.role = 'dentist';

-- -----------------------------------------------------------------------------
-- Pacientes, historia clínica y equipo de atención
-- -----------------------------------------------------------------------------
insert into public.patients (id, first_name, last_name, second_last_name, birth_date, sex, phone, email, primary_dentist_id, branch_id, contact_preference)
select p.id, p.first_name, p.last_name, p.second_last_name, p.birth_date, p.sex::public.sex, p.phone, p.email, p.dentist, b.id, p.pref::public.contact_channel
from (values
  ('10000000-0000-4000-a000-000000000001'::uuid, 'María',     'González', 'Pérez',    date '1985-03-14', 'F', '8112345601', 'maria.gonzalez@example.com', '00000000-0000-4000-a000-000000000002'::uuid, 'whatsapp'),
  ('10000000-0000-4000-a000-000000000002'::uuid, 'José',      'Martínez', 'Ramírez',  date '1972-11-02', 'M', '8112345602', null,                         '00000000-0000-4000-a000-000000000002'::uuid, 'sms'),
  ('10000000-0000-4000-a000-000000000003'::uuid, 'Sofía',     'Hernández', null,      date '2015-07-21', 'F', '8112345603', 'familia.hdz@example.com',    '00000000-0000-4000-a000-000000000002'::uuid, 'email'),
  ('10000000-0000-4000-a000-000000000004'::uuid, 'Luis',      'Ramírez',  'Torres',   date '1990-01-30', 'M', '8112345604', null,                         '00000000-0000-4000-a000-000000000003'::uuid, 'whatsapp'),
  ('10000000-0000-4000-a000-000000000005'::uuid, 'Guadalupe', 'Treviño',  'Garza',    date '1958-09-09', 'F', '8112345605', 'lupita.t@example.com',       '00000000-0000-4000-a000-000000000003'::uuid, 'whatsapp'),
  ('10000000-0000-4000-a000-000000000006'::uuid, 'Andrés',    'Salinas',  null,       date '2001-05-17', 'M', '8112345606', null,                         null,                                         'whatsapp')
) as p(id, first_name, last_name, second_last_name, birth_date, sex, phone, email, dentist, pref)
cross join lateral (select id from public.branches order by created_at limit 1) b;

update public.patients set guardian_name = 'Rosa Hernández (madre)' where id = '10000000-0000-4000-a000-000000000003';

insert into public.medical_histories (patient_id, pathological_history, allergies, current_medications, chief_complaint, blood_pressure)
values
  ('10000000-0000-4000-a000-000000000001', '{"hipertension": true}', '{Penicilina}', 'Losartán 50 mg cada 24 h', 'Dolor en molar inferior derecho', '130/85'),
  ('10000000-0000-4000-a000-000000000002', '{"diabetes": true}', '{}', 'Metformina 850 mg', 'Revisión general y limpieza', '120/80'),
  ('10000000-0000-4000-a000-000000000003', '{}', '{}', null, 'Revisión de rutina', null),
  ('10000000-0000-4000-a000-000000000004', '{}', '{Látex}', null, 'Sensibilidad en incisivo central', '118/76'),
  ('10000000-0000-4000-a000-000000000005', '{"cardiopatia": true}', '{}', 'Aspirina 100 mg', 'Prótesis que se mueve', '140/90');

-- -----------------------------------------------------------------------------
-- Agenda: citas de hoy y de mañana en los sillones de la sucursal
-- -----------------------------------------------------------------------------
create temp table seed_chairs as
  select id, row_number() over (order by name) as n from public.chairs;

insert into public.appointments (patient_id, dentist_id, chair_id, type_id, starts_at, ends_at, status, reason)
select a.patient, a.dentist, c.id, t.id,
       ((public.clinic_day(now()) + a.day_offset + a.start_time)::text || '-06')::timestamptz,
       ((public.clinic_day(now()) + a.day_offset + a.start_time + make_interval(mins => t.duration_minutes))::text || '-06')::timestamptz,
       a.status::public.appointment_status, a.reason
from (values
  ('10000000-0000-4000-a000-000000000001'::uuid, '00000000-0000-4000-a000-000000000002'::uuid, 1, 'Endodoncia',               0, time '09:00', 'confirmada', 'Endodoncia molar 46'),
  ('10000000-0000-4000-a000-000000000002'::uuid, '00000000-0000-4000-a000-000000000002'::uuid, 1, 'Limpieza',                 0, time '11:00', 'programada', null),
  ('10000000-0000-4000-a000-000000000003'::uuid, '00000000-0000-4000-a000-000000000002'::uuid, 1, 'Valoración / primera vez', 0, time '12:00', 'programada', 'Revisión infantil'),
  ('10000000-0000-4000-a000-000000000004'::uuid, '00000000-0000-4000-a000-000000000003'::uuid, 2, 'Resina',                   0, time '10:00', 'programada', 'Resina en 11'),
  ('10000000-0000-4000-a000-000000000005'::uuid, '00000000-0000-4000-a000-000000000003'::uuid, 2, 'Prótesis / corona',        0, time '16:00', 'programada', 'Ajuste de prótesis'),
  ('10000000-0000-4000-a000-000000000006'::uuid, '00000000-0000-4000-a000-000000000002'::uuid, 1, 'Valoración / primera vez', 1, time '10:00', 'programada', null),
  ('10000000-0000-4000-a000-000000000004'::uuid, '00000000-0000-4000-a000-000000000003'::uuid, 2, 'Endodoncia',               1, time '12:00', 'programada', 'Valorar endodoncia')
) as a(patient, dentist, chair_n, type_name, day_offset, start_time, status, reason)
join seed_chairs c on c.n = least(a.chair_n, (select max(n) from seed_chairs))
join public.appointment_types t on t.name = a.type_name;

insert into public.waitlist (patient_id, type_id, dentist_id, preferred_time, notes)
select '10000000-0000-4000-a000-000000000002', t.id, '00000000-0000-4000-a000-000000000002', 'manana', 'Quiere adelantar su limpieza'
from public.appointment_types t where t.name = 'Limpieza';

-- -----------------------------------------------------------------------------
-- Dinero: un plan aceptado con un tratamiento realizado y un abono de hoy
-- -----------------------------------------------------------------------------
insert into public.treatment_plans (id, patient_id, dentist_id, title, status, valid_until, accepted_at)
values ('20000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000002',
        'Rehabilitación molar 46', 'aceptado', public.clinic_day(now()) + 30, now());

insert into public.treatment_plan_items (plan_id, treatment_id, description, tooth, phase, unit_price, status, completed_at, completed_by, sort)
select '20000000-0000-4000-a000-000000000001', t.id, t.name, i.tooth, i.phase, t.price,
       i.status::public.plan_item_status,
       case when i.status = 'realizado' then now() end,
       case when i.status = 'realizado' then '00000000-0000-4000-a000-000000000002'::uuid end,
       i.sort
from (values
  ('Consulta de valoración', null::smallint, 1, 'realizado', 1),
  ('Radiografía periapical', 46::smallint,   1, 'realizado', 2),
  ('Endodoncia multirradicular', 46::smallint,   2, 'pendiente', 3),
  ('Corona de zirconia',     46::smallint,   3, 'pendiente', 4)
) as i(name, tooth, phase, status, sort)
join public.treatments t on t.name = i.name;

insert into public.payments (patient_id, plan_id, branch_id, amount, method, received_by)
select '10000000-0000-4000-a000-000000000001', '20000000-0000-4000-a000-000000000001', b.id, 1500, 'efectivo', '00000000-0000-4000-a000-000000000004'
from (select id from public.branches order by created_at limit 1) b;

-- -----------------------------------------------------------------------------
-- Inventario (uno bajo de mínimo y uno por caducar) y una orden de laboratorio
-- -----------------------------------------------------------------------------
insert into public.inventory_items (id, branch_id, name, category, unit, min_stock, supplier)
select i.id, b.id, i.name, i.category, i.unit, i.min_stock, 'Depósito Dental del Norte'
from (values
  ('30000000-0000-4000-a000-000000000001'::uuid, 'Guantes de nitrilo (caja)', 'Consumibles', 'caja',   5),
  ('30000000-0000-4000-a000-000000000002'::uuid, 'Anestesia lidocaína 2%',    'Anestesia',   'cartucho', 50),
  ('30000000-0000-4000-a000-000000000003'::uuid, 'Resina A2',                 'Restauración', 'jeringa', 3)
) as i(id, name, category, unit, min_stock)
cross join (select id from public.branches order by created_at limit 1) b;

with lots as (
  insert into public.inventory_lots (item_id, lot_code, expires_on, received_qty, remaining, unit_cost, created_by)
  values
    ('30000000-0000-4000-a000-000000000001', 'GN-2401', public.clinic_day(now()) + 365, 3,   3,   180, '00000000-0000-4000-a000-000000000001'),
    ('30000000-0000-4000-a000-000000000002', 'LD-0925', public.clinic_day(now()) + 20,  100, 100, 12,  '00000000-0000-4000-a000-000000000001'),
    ('30000000-0000-4000-a000-000000000003', 'RA2-11',  public.clinic_day(now()) + 300, 6,   6,   420, '00000000-0000-4000-a000-000000000001')
  returning id, item_id, received_qty
)
insert into public.inventory_movements (item_id, lot_id, kind, quantity, reason, created_by)
select item_id, id, 'entrada', received_qty, 'Inventario inicial', '00000000-0000-4000-a000-000000000001' from lots;

insert into public.labs (id, name, contact, phone)
values ('40000000-0000-4000-a000-000000000001', 'Laboratorio Dental Monterrey', 'Ing. Pedro Saldaña', '8183334455');

insert into public.lab_orders (patient_id, dentist_id, lab_id, work_type, teeth, shade, status, due_date, cost, created_by)
values ('10000000-0000-4000-a000-000000000005', '00000000-0000-4000-a000-000000000003', '40000000-0000-4000-a000-000000000001',
        'Prótesis parcial removible', '36, 37', 'A3', 'enviado', public.clinic_day(now()) + 5, 1800, '00000000-0000-4000-a000-000000000003');
