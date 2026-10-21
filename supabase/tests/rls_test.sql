-- Pruebas de RLS. Se ejecutan con scripts/test-db.sh contra un Postgres local
-- con supabase_stub.sql + migraciones aplicadas. Cualquier fallo aborta.
\set ON_ERROR_STOP 1

create or replace function pg_temp.login(p_email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', (select id::text from auth.users where email = p_email), false);
  execute 'set role authenticated';
end $$;

create or replace function pg_temp.logout() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', false);
end $$;

create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin
  if not coalesce(cond, false) then raise exception 'FALLA: %', msg; end if;
  raise notice 'ok - %', msg;
end $$;

-- Usuarios: el primero es admin automáticamente
insert into auth.users (email) values ('admin@clinica.mx');
insert into auth.users (email, raw_app_meta_data) values
  ('dra.lopez@clinica.mx', '{"role":"dentist"}'),
  ('dr.ruiz@clinica.mx',   '{"role":"dentist"}'),
  ('recepcion@clinica.mx', '{"role":"reception"}'),
  ('sinrol@clinica.mx',    '{}');

select pg_temp.assert((select role from profiles where email = 'admin@clinica.mx') = 'admin', 'primer usuario es admin');
select pg_temp.assert((select role from profiles where email = 'dra.lopez@clinica.mx') = 'dentist', 'rol desde app_metadata');
select pg_temp.assert((select role from profiles where email = 'sinrol@clinica.mx') = 'reception', 'rol por defecto recepción');
select pg_temp.assert(not (select active from profiles where email = 'dra.lopez@clinica.mx'), 'usuarios nuevos quedan inactivos');
-- El administrador activa al personal invitado (sinrol@ se queda inactivo)
update profiles set active = true where email in ('dra.lopez@clinica.mx', 'dr.ruiz@clinica.mx', 'recepcion@clinica.mx');

-- Recepción da de alta un paciente asignado a la Dra. López
select pg_temp.login('recepcion@clinica.mx');
insert into patients (first_name, last_name, phone, primary_dentist_id)
values ('María', 'Pérez', '7711234567', (select id from profiles where email = 'dra.lopez@clinica.mx'));
select pg_temp.assert((select count(*) from patients) = 1, 'recepción ve el paciente que creó');
select pg_temp.assert((select count(*) from patients where search like '%perez%') = 1, 'búsqueda sin acentos');
select pg_temp.logout();

-- Dra. López: ve el paciente y puede capturar anamnesis
select pg_temp.login('dra.lopez@clinica.mx');
select pg_temp.assert((select count(*) from patients) = 1, 'odontóloga de cabecera ve a su paciente');
insert into medical_histories (patient_id, allergies) select id, '{penicilina}' from patients;
select pg_temp.assert((select count(*) from medical_histories) = 1, 'odontóloga captura anamnesis');
-- Un odontólogo que crea paciente queda como cabecera
insert into patients (first_name, last_name) values ('Luis', 'Gómez');
select pg_temp.assert((select count(*) from patients) = 2, 'odontóloga ve el paciente que creó');
select pg_temp.logout();

-- Dr. Ruiz: no ve pacientes ajenos ni su anamnesis
select pg_temp.login('dr.ruiz@clinica.mx');
select pg_temp.assert((select count(*) from patients) = 0, 'otro odontólogo no ve pacientes ajenos');
select pg_temp.assert((select count(*) from medical_histories) = 0, 'otro odontólogo no ve anamnesis ajena');
update patients set notes = 'x';  -- no afecta filas invisibles
select pg_temp.logout();
select pg_temp.assert((select count(*) from patients where notes = 'x') = 0, 'otro odontólogo no modifica pacientes ajenos');

-- Recepción no ve datos clínicos
select pg_temp.login('recepcion@clinica.mx');
select pg_temp.assert((select count(*) from medical_histories) = 0, 'recepción no ve anamnesis');
select pg_temp.assert((select count(*) from audit_log) = 0, 'recepción no ve bitácora');
do $$ begin
  begin
    update profiles set role = 'admin' where id = auth.uid();
    raise exception 'FALLA: recepción pudo escalar su rol';
  exception when others then
    if sqlerrm like 'FALLA%' then raise; end if;
    raise notice 'ok - recepción no puede cambiar su rol';
  end;
end $$;
do $$ begin
  begin
    delete from patients;
    if (select count(*) from patients) > 0 then
      raise notice 'ok - recepción no puede borrar pacientes';
    else
      raise exception 'FALLA: recepción borró pacientes';
    end if;
  end;
end $$;
select pg_temp.logout();

-- Admin ve todo y la bitácora registró los cambios
select pg_temp.login('admin@clinica.mx');
select pg_temp.assert((select count(*) from patients) = 2, 'admin ve todos los pacientes');
select pg_temp.assert((select count(*) from medical_histories) = 1, 'admin ve anamnesis');
select pg_temp.assert((select count(*) from audit_log where table_name = 'medical_histories') = 1, 'bitácora registra anamnesis');
select pg_temp.assert(
  (select actor_email from audit_log where table_name = 'medical_histories') = 'dra.lopez@clinica.mx',
  'bitácora registra el autor');
do $$ begin
  begin
    delete from audit_log;
    if (select count(*) from audit_log) = 0 then
      raise exception 'FALLA: se pudo borrar la bitácora';
    end if;
  exception when others then
    if sqlerrm like 'FALLA%' then raise; end if;
  end;
  raise notice 'ok - bitácora no se puede borrar';
end $$;
select pg_temp.logout();

-- Ni siquiera el dueño de la base puede alterar la bitácora
do $$ begin
  begin
    update audit_log set actor_email = 'x';
    raise exception 'FALLA: se pudo editar la bitácora';
  exception when others then
    if sqlerrm like 'FALLA%' then raise; end if;
    raise notice 'ok - bitácora inmutable incluso para postgres';
  end;
end $$;

-- Un usuario inactivo (p. ej. registrado por su cuenta) no ve nada
select pg_temp.login('sinrol@clinica.mx');
select pg_temp.assert((select count(*) from patients) = 0, 'usuario inactivo no ve pacientes');
select pg_temp.assert((select count(*) from profiles) = 1, 'usuario inactivo sólo ve su perfil');
do $$ begin
  begin
    insert into patients (first_name, last_name) values ('X', 'Y');
    raise exception 'FALLA: usuario inactivo creó paciente';
  exception when others then
    if sqlerrm like 'FALLA%' then raise; end if;
    raise notice 'ok - usuario inactivo no crea pacientes';
  end;
end $$;
select pg_temp.logout();

-- Usuario anónimo no ve nada
set role anon;
do $$ begin
  begin
    perform count(*) from patients;
    raise exception 'FALLA: anon pudo consultar pacientes';
  exception when insufficient_privilege then
    raise notice 'ok - anon sin acceso a pacientes';
  end;
end $$;
reset role;
