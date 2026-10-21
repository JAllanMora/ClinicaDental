-- Utilidades compartidas por las pruebas (se incluyen con \ir).
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

-- Ejecuta una sentencia que DEBE fallar (por RLS, privilegios o trigger).
create or replace function pg_temp.expect_error(stmt text, msg text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    raise notice 'ok - %', msg;
    return;
  end;
  raise exception 'FALLA: %', msg;
end $$;

-- Ejecuta una sentencia y devuelve cuántas filas afectó.
create or replace function pg_temp.affected(stmt text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute stmt;
  get diagnostics n = row_count;
  return n;
end $$;
