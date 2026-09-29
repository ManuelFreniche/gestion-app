-- Pruebas de aislamiento entre negocios y de permisos por rol.
-- Se ejecutan con `npm run test:db` (dentro de una transacción que se deshace al final).

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(17);

-- Usuarios de prueba: dueño de A, dueño de B, empleado de A y gestoría de A.
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'dueno-a@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'dueno-b@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000e', 'empleado-a@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000f', 'gestoria-a@prueba.test', 'authenticated', 'authenticated');

select ok(
  (select count(*) = 4 from public.perfiles where usuario_id::text like '00000000-0000-0000-0000-0000000000%'),
  'cada usuario nuevo recibe un perfil'
);

create function pg_temp.como(usuario uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', usuario, 'role', 'authenticated')::text, true);
$$;

set local role authenticated;

-- Cada dueño crea su negocio.
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select set_config('prueba.org_a', public.crear_organizacion('Alpino''s')::text, true);
insert into public.miembros (organizacion_id, usuario_id, rol) values
  (current_setting('prueba.org_a')::uuid, '00000000-0000-0000-0000-00000000000e', 'empleado'),
  (current_setting('prueba.org_a')::uuid, '00000000-0000-0000-0000-00000000000f', 'gestoria');

select is((select count(*)::int from public.miembros), 3, 'el dueño de A ve a los 3 miembros de A');
select is((select count(*)::int from public.locales), 1, 'crear_organizacion crea un local');

select pg_temp.como('00000000-0000-0000-0000-00000000000b');
select set_config('prueba.org_b', public.crear_organizacion('Otro negocio')::text, true);

-- B no ve nada de A.
select is((select count(*)::int from public.organizaciones), 1, 'B solo ve su propia organización');
select is(
  (select count(*)::int from public.locales where organizacion_id = current_setting('prueba.org_a')::uuid),
  0, 'B no ve los locales de A'
);
select is(
  (select count(*)::int from public.miembros where organizacion_id = current_setting('prueba.org_a')::uuid),
  0, 'B no ve los miembros de A'
);
select is_empty(
  format('select public.mis_permisos(%L)', current_setting('prueba.org_a')),
  'B no tiene permisos en A'
);
select throws_ok(
  format('insert into public.locales (organizacion_id, nombre) values (%L, ''Intruso'')', current_setting('prueba.org_a')),
  '42501', null, 'B no puede crear locales en A'
);
select throws_ok(
  format('insert into public.miembros (organizacion_id, usuario_id, rol) values (%L, %L, ''dueno'')',
    current_setting('prueba.org_a'), '00000000-0000-0000-0000-00000000000b'),
  '42501', null, 'B no puede colarse como miembro de A'
);
update public.organizaciones set nombre = 'Hackeado' where id = current_setting('prueba.org_a')::uuid;

-- Empleado de A: mostrador, sin márgenes ni gestión.
select pg_temp.como('00000000-0000-0000-0000-00000000000e');
select ok(
  'ventas.editar' in (select public.mis_permisos(current_setting('prueba.org_a')::uuid)),
  'el empleado puede registrar ventas'
);
select ok(
  'margenes.ver' not in (select public.mis_permisos(current_setting('prueba.org_a')::uuid)),
  'el empleado no ve márgenes'
);
select throws_ok(
  format('insert into public.locales (organizacion_id, nombre) values (%L, ''Nuevo'')', current_setting('prueba.org_a')),
  '42501', null, 'el empleado no puede crear locales'
);

-- Gestoría de A: solo lo fiscal.
select pg_temp.como('00000000-0000-0000-0000-00000000000f');
select ok(
  'gastos.ver' in (select public.mis_permisos(current_setting('prueba.org_a')::uuid)),
  'la gestoría ve los gastos'
);
select ok(
  'ventas.ver' not in (select public.mis_permisos(current_setting('prueba.org_a')::uuid)),
  'la gestoría no ve las ventas'
);

-- Dueño de A: el nombre sigue intacto y no puede quedarse sin dueño.
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select is(
  (select nombre from public.organizaciones where id = current_setting('prueba.org_a')::uuid),
  'Alpino''s', 'B no pudo renombrar la organización de A'
);
select throws_ok(
  format('delete from public.miembros where organizacion_id = %L and usuario_id = %L',
    current_setting('prueba.org_a'), '00000000-0000-0000-0000-00000000000a'),
  'P0001', 'La organización debe tener al menos un dueño', 'A no puede dejar su negocio sin dueño'
);

-- Sin sesión no se ve nada.
reset role;
set local role anon;
select throws_ok('select * from public.organizaciones', '42501', null, 'sin sesión no se leen organizaciones');

reset role;
select * from finish();
rollback;
