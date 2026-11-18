-- =============================================================================
-- Horarios de trabajo por odontólogo
-- Turnos semanales (puede haber varios por día, p. ej. 9–14 y 16–19). Los días
-- libres, vacaciones y comidas se siguen guardando en schedule_blocks.
-- Los edita el administrador (de todos) o cada odontólogo (los suyos).
-- El bot de WhatsApp sólo ofrece citas dentro de estos turnos.
-- =============================================================================

create table public.working_hours (
  id          uuid primary key default gen_random_uuid(),
  dentist_id  uuid not null references public.profiles (id) on delete cascade,
  weekday     smallint not null check (weekday between 0 and 6),  -- 0 = domingo … 6 = sábado
  starts      time not null,
  ends        time not null,
  created_at  timestamptz not null default now(),
  check (ends > starts)
);

create index working_hours_dentist_idx on public.working_hours (dentist_id, weekday, starts);

create trigger working_hours_audit after insert or update or delete on public.working_hours
  for each row execute function public.audit_trigger();

alter table public.working_hours enable row level security;

create policy working_hours_select on public.working_hours for select to authenticated using (public.is_staff());
create policy working_hours_write on public.working_hours for all to authenticated
  using (public.is_admin() or dentist_id = auth.uid())
  with check (public.is_admin() or dentist_id = auth.uid());

revoke all on public.working_hours from anon;

-- Reemplaza el horario semanal completo de un odontólogo en una sola transacción.
-- p_shifts: [{"weekday": 1, "starts": "09:00", "ends": "14:00"}, …]
-- Corre con los permisos de quien llama (RLS aplica).
create or replace function public.set_working_hours(p_dentist uuid, p_shifts jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  s record;
  prev_day smallint;
  prev_ends time;
begin
  if not (public.is_admin() or p_dentist = auth.uid()) then
    raise exception 'Sin permiso para editar este horario' using errcode = '42501';
  end if;

  -- Turnos empalmados en el mismo día.
  for s in
    select (x->>'weekday')::smallint as weekday, (x->>'starts')::time as starts, (x->>'ends')::time as ends
    from jsonb_array_elements(coalesce(p_shifts, '[]'::jsonb)) x
    order by 1, 2
  loop
    if s.ends <= s.starts then
      raise exception 'Un turno termina antes de empezar' using errcode = '22023';
    end if;
    if prev_day = s.weekday and s.starts < prev_ends then
      raise exception 'Hay turnos empalmados el mismo día' using errcode = '22023';
    end if;
    prev_day := s.weekday;
    prev_ends := s.ends;
  end loop;

  delete from public.working_hours where dentist_id = p_dentist;
  insert into public.working_hours (dentist_id, weekday, starts, ends)
  select p_dentist, (x->>'weekday')::smallint, (x->>'starts')::time, (x->>'ends')::time
  from jsonb_array_elements(coalesce(p_shifts, '[]'::jsonb)) x;
end;
$$;

revoke all on function public.set_working_hours(uuid, jsonb) from public, anon;
grant execute on function public.set_working_hours(uuid, jsonb) to authenticated;

-- Horario inicial para los odontólogos que ya existen: lunes a viernes 9–19, sábado 9–14.
insert into public.working_hours (dentist_id, weekday, starts, ends)
select p.id, d.weekday, d.starts, d.ends
from public.profiles p
cross join (
  values (1::smallint, time '09:00', time '19:00'), (2, '09:00', '19:00'), (3, '09:00', '19:00'),
         (4, '09:00', '19:00'), (5, '09:00', '19:00'), (6, '09:00', '14:00')
) as d (weekday, starts, ends)
where p.role = 'dentist'
  and not exists (select 1 from public.working_hours w where w.dentist_id = p.id);
