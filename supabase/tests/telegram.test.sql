-- Aislamiento y permisos del aviso por Telegram.
-- Se ejecuta con `npm run test:db` (dentro de una transacción que se deshace al final).

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(12);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000a2', 'dueno-a@telegram.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b2', 'dueno-b@telegram.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000e2', 'empleado-a@telegram.test', 'authenticated', 'authenticated');

create function pg_temp.como(usuario uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', usuario, 'role', 'authenticated')::text, true);
$$;

set local role authenticated;

select pg_temp.como('00000000-0000-0000-0000-0000000000a2');
select set_config('prueba.org_a', public.crear_organizacion('Negocio A')::text, true);
insert into public.miembros (organizacion_id, usuario_id, rol) values
  (current_setting('prueba.org_a')::uuid, '00000000-0000-0000-0000-0000000000e2', 'empleado');
select set_config('prueba.local_a',
  (select id::text from public.locales where organizacion_id = current_setting('prueba.org_a')::uuid), true);

select pg_temp.como('00000000-0000-0000-0000-0000000000b2');
select set_config('prueba.org_b', public.crear_organizacion('Negocio B')::text, true);
select set_config('prueba.local_b',
  (select id::text from public.locales where organizacion_id = current_setting('prueba.org_b')::uuid), true);

-- Códigos de conexión: solo quien puede cambiar ajustes, y solo en su negocio.
select pg_temp.como('00000000-0000-0000-0000-0000000000a2');
select lives_ok(
  format('insert into public.telegram_codigos (codigo, organizacion_id, local_id) values (''AAAAAAAAAA'', %L, %L)',
    current_setting('prueba.org_a'), current_setting('prueba.local_a')),
  'el dueño crea un código de conexión'
);
select is((select count(*)::int from public.telegram_codigos), 0, 'nadie lee los códigos desde la app, ni el dueño');

select pg_temp.como('00000000-0000-0000-0000-0000000000e2');
select throws_ok(
  format('insert into public.telegram_codigos (codigo, organizacion_id, local_id) values (''BBBBBBBBBB'', %L, %L)',
    current_setting('prueba.org_a'), current_setting('prueba.local_a')),
  '42501', null, 'el empleado no puede crear códigos'
);

select pg_temp.como('00000000-0000-0000-0000-0000000000b2');
select throws_ok(
  format('insert into public.telegram_codigos (codigo, organizacion_id, local_id) values (''CCCCCCCCCC'', %L, %L)',
    current_setting('prueba.org_a'), current_setting('prueba.local_a')),
  '42501', null, 'B no puede crear códigos para A'
);
select throws_ok(
  format('insert into public.telegram_codigos (codigo, organizacion_id, local_id) values (''DDDDDDDDDD'', %L, %L)',
    current_setting('prueba.org_b'), current_setting('prueba.local_a')),
  '23503', null, 'un código no puede apuntar al local de otro negocio'
);
select throws_ok(
  format('insert into public.telegram_codigos (codigo, organizacion_id, local_id) values (''corto'', %L, %L)',
    current_setting('prueba.org_b'), current_setting('prueba.local_b')),
  '23514', null, 'el código tiene que tener el formato esperado'
);

-- Conexiones: las crea el bot (clave de servicio, aquí el rol dueño de la base), no las personas.
select throws_ok(
  format('insert into public.telegram_vinculos (organizacion_id, local_id, chat_id) values (%L, %L, 1)',
    current_setting('prueba.org_b'), current_setting('prueba.local_b')),
  '42501', null, 'una persona no puede crear conexiones a mano'
);
reset role;
insert into public.telegram_vinculos (organizacion_id, local_id, chat_id)
values (current_setting('prueba.org_a')::uuid, current_setting('prueba.local_a')::uuid, 111);
select throws_ok(
  format('insert into public.telegram_vinculos (organizacion_id, local_id, chat_id) values (%L, %L, 222)',
    current_setting('prueba.org_b'), current_setting('prueba.local_a')),
  '23503', null, 'una conexión no puede usar el local de otro negocio'
);
insert into public.telegram_conversaciones (chat_id, organizacion_id, local_id, fecha, paso)
values (111, current_setting('prueba.org_a')::uuid, current_setting('prueba.local_a')::uuid, date '2026-09-30', 'venta');

set local role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000000a2');
select is((select count(*)::int from public.telegram_vinculos), 1, 'el dueño ve la conexión de su negocio');
select throws_ok('select * from public.telegram_conversaciones', '42501', null, 'las conversaciones del bot no se leen desde la app');

select pg_temp.como('00000000-0000-0000-0000-0000000000e2');
select is((select count(*)::int from public.telegram_vinculos), 0, 'el empleado no ve las conexiones');

select pg_temp.como('00000000-0000-0000-0000-0000000000b2');
delete from public.telegram_vinculos;
reset role;
select is((select count(*)::int from public.telegram_vinculos), 1, 'B no ve ni borra la conexión de A');

select * from finish();
rollback;
