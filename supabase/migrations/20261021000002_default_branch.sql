-- Sucursal y sillones iniciales (editables desde Configuración).
with b as (
  insert into public.branches (name, address, phone)
  values ('Villa San Juan', 'San Juan Solís', '771 347 5528')
  returning id
)
insert into public.chairs (branch_id, name)
select b.id, s.name from b, (values ('Sillón 1'), ('Sillón 2')) as s(name);
