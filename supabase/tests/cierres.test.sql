-- Aislamiento y permisos del cierre diario y los sabores.
-- Se ejecuta con `npm run test:db` (dentro de una transacción que se deshace al final).

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(11);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'dueno-a@cierres.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b1', 'dueno-b@cierres.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000e1', 'empleado-a@cierres.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000f1', 'gestoria-a@cierres.test', 'authenticated', 'authenticated');

create function pg_temp.como(usuario uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', usuario, 'role', 'authenticated')::text, true);
$$;

set local role authenticated;

-- Negocio A (con empleado y gestoría) y negocio B.
select pg_temp.como('00000000-0000-0000-0000-0000000000a1');
select set_config('prueba.org_a', public.crear_organizacion('Negocio A')::text, true);
insert into public.miembros (organizacion_id, usuario_id, rol) values
  (current_setting('prueba.org_a')::uuid, '00000000-0000-0000-0000-0000000000e1', 'empleado'),
  (current_setting('prueba.org_a')::uuid, '00000000-0000-0000-0000-0000000000f1', 'gestoria');
select set_config('prueba.local_a',
  (select id::text from public.locales where organizacion_id = current_setting('prueba.org_a')::uuid), true);
with nuevo as (
  insert into public.sabores (organizacion_id, nombre)
  values (current_setting('prueba.org_a')::uuid, 'Fresa') returning id
)
select set_config('prueba.sabor_a', id::text, true) from nuevo;

select pg_temp.como('00000000-0000-0000-0000-0000000000b1');
select set_config('prueba.org_b', public.crear_organizacion('Negocio B')::text, true);
select set_config('prueba.local_b',
  (select id::text from public.locales where organizacion_id = current_setting('prueba.org_b')::uuid), true);
with nuevo as (
  insert into public.sabores (organizacion_id, nombre)
  values (current_setting('prueba.org_b')::uuid, 'Limón') returning id
)
select set_config('prueba.sabor_b', id::text, true) from nuevo;

-- El empleado de A registra el cierre del día, con una tanda de fresa.
select pg_temp.como('00000000-0000-0000-0000-0000000000e1');
select isnt(
  public.guardar_cierre(
    current_setting('prueba.org_a')::uuid, current_setting('prueba.local_a')::uuid,
    date '2026-09-30', 512.40, array[current_setting('prueba.sabor_a')::uuid], null),
  null, 'el empleado puede registrar el cierre del día'
);
-- Volver a guardar el mismo día corrige el cierre en lugar de duplicarlo.
select public.guardar_cierre(
  current_setting('prueba.org_a')::uuid, current_setting('prueba.local_a')::uuid,
  date '2026-09-30', 600, '{}', 'corregido');
select is(
  (select count(*)::int from public.cierres_diarios where organizacion_id = current_setting('prueba.org_a')::uuid),
  1, 'guardar el mismo día no duplica el cierre'
);
select is(
  (select venta from public.cierres_diarios where organizacion_id = current_setting('prueba.org_a')::uuid),
  600.00::numeric, 'el cierre queda con la venta corregida'
);
select is(
  (select count(*)::int from public.cierre_tandas where organizacion_id = current_setting('prueba.org_a')::uuid),
  0, 'al corregir, las tandas se sustituyen'
);
select throws_ok(
  format('insert into public.sabores (organizacion_id, nombre) values (%L, ''Intruso'')', current_setting('prueba.org_a')),
  '42501', null, 'el empleado no puede crear sabores'
);

-- La gestoría no ve ni escribe ventas.
select pg_temp.como('00000000-0000-0000-0000-0000000000f1');
select is((select count(*)::int from public.cierres_diarios), 0, 'la gestoría no ve los cierres');
select throws_ok(
  format('select public.guardar_cierre(%L, %L, date ''2026-10-01'', 10)',
    current_setting('prueba.org_a'), current_setting('prueba.local_a')),
  '42501', null, 'la gestoría no puede registrar cierres'
);

-- El negocio B no ve ni toca nada de A.
select pg_temp.como('00000000-0000-0000-0000-0000000000b1');
select is((select count(*)::int from public.cierres_diarios), 0, 'B no ve los cierres de A');
select is(
  (select count(*)::int from public.sabores where organizacion_id = current_setting('prueba.org_a')::uuid),
  0, 'B no ve los sabores de A'
);
select throws_ok(
  format('select public.guardar_cierre(%L, %L, date ''2026-10-01'', 10)',
    current_setting('prueba.org_a'), current_setting('prueba.local_a')),
  '42501', null, 'B no puede registrar cierres en A'
);

-- Un cierre de B no puede usar el local ni los sabores de A.
select throws_ok(
  format('select public.guardar_cierre(%L, %L, date ''2026-10-01'', 10, array[%L]::uuid[])',
    current_setting('prueba.org_b'), current_setting('prueba.local_b'), current_setting('prueba.sabor_a')),
  '23503', null, 'un cierre no puede usar sabores de otro negocio'
);

reset role;
select * from finish();
rollback;
