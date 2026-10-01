-- Aislamiento y permisos de los gastos sueltos.
-- Se ejecuta con `npm run test:db` (dentro de una transacción que se deshace al final).

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(9);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000a3', 'dueno-a@gastos.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b3', 'dueno-b@gastos.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000e3', 'empleado-a@gastos.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000f3', 'gestoria-a@gastos.test', 'authenticated', 'authenticated');

create function pg_temp.como(usuario uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', usuario, 'role', 'authenticated')::text, true);
$$;

set local role authenticated;

select pg_temp.como('00000000-0000-0000-0000-0000000000a3');
select set_config('prueba.org_a', public.crear_organizacion('Negocio A')::text, true);
insert into public.miembros (organizacion_id, usuario_id, rol) values
  (current_setting('prueba.org_a')::uuid, '00000000-0000-0000-0000-0000000000e3', 'empleado'),
  (current_setting('prueba.org_a')::uuid, '00000000-0000-0000-0000-0000000000f3', 'gestoria');

select pg_temp.como('00000000-0000-0000-0000-0000000000b3');
select set_config('prueba.org_b', public.crear_organizacion('Negocio B')::text, true);

-- El dueño apunta un gasto.
select pg_temp.como('00000000-0000-0000-0000-0000000000a3');
select lives_ok(
  format($f$insert into public.gastos_varios (organizacion_id, fecha, concepto, categoria, importe)
    values (%L, date '2026-09-01', 'Alquiler septiembre', 'Alquiler', 650)$f$, current_setting('prueba.org_a')),
  'el dueño apunta un gasto'
);
select throws_ok(
  format($f$insert into public.gastos_varios (organizacion_id, fecha, concepto, importe)
    values (%L, date '2026-09-01', 'Nada', 0)$f$, current_setting('prueba.org_a')),
  '23514', null, 'un gasto de 0 € no se admite'
);
select is((select count(*)::int from public.gastos_varios), 1, 'el dueño ve su gasto');

-- Otro negocio: ni lo ve, ni escribe en el negocio ajeno.
select pg_temp.como('00000000-0000-0000-0000-0000000000b3');
select is((select count(*)::int from public.gastos_varios), 0, 'otro negocio no ve los gastos');
select throws_ok(
  format($f$insert into public.gastos_varios (organizacion_id, fecha, concepto, importe)
    values (%L, date '2026-09-02', 'Intruso', 10)$f$, current_setting('prueba.org_a')),
  '42501', null, 'otro negocio no puede apuntar gastos en el nuestro'
);

-- Empleado: ni ve costes ni escribe.
select pg_temp.como('00000000-0000-0000-0000-0000000000e3');
select is((select count(*)::int from public.gastos_varios), 0, 'el empleado no ve los gastos');
select throws_ok(
  format($f$insert into public.gastos_varios (organizacion_id, fecha, concepto, importe)
    values (%L, date '2026-09-02', 'Helado', 5)$f$, current_setting('prueba.org_a')),
  '42501', null, 'el empleado no puede apuntar gastos'
);

-- Gestoría: lee pero no escribe ni borra.
select pg_temp.como('00000000-0000-0000-0000-0000000000f3');
select is((select count(*)::int from public.gastos_varios), 1, 'la gestoría ve los gastos');
delete from public.gastos_varios;
select is(
  (select count(*)::int from public.gastos_varios), 1, 'la gestoría no puede borrar gastos'
);

select * from finish();
rollback;
