-- Invitaciones al equipo: solo el dueño las gestiona, el enlace vale una vez, caduca y no se pierde el rol.
-- Se ejecuta con `npm run test:db` (dentro de una transacción que se deshace al final).

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(18);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000a3', 'dueno-a@invitaciones.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b3', 'dueno-b@invitaciones.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000c3', 'encargado-a@invitaciones.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000d3', 'nuevo@invitaciones.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000e3', 'otro@invitaciones.test', 'authenticated', 'authenticated');

create function pg_temp.como(usuario uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', usuario, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.hash(codigo text) returns text language sql as $$
  select encode(sha256(convert_to(codigo, 'UTF8')), 'hex');
$$;

set local role authenticated;

select pg_temp.como('00000000-0000-0000-0000-0000000000a3');
select set_config('prueba.org_a', public.crear_organizacion('Negocio A')::text, true);
insert into public.miembros (organizacion_id, usuario_id, rol) values
  (current_setting('prueba.org_a')::uuid, '00000000-0000-0000-0000-0000000000c3', 'encargado');

select pg_temp.como('00000000-0000-0000-0000-0000000000b3');
select set_config('prueba.org_b', public.crear_organizacion('Negocio B')::text, true);

-- Crear: solo el dueño, solo en su negocio, nunca para otro dueño.
select pg_temp.como('00000000-0000-0000-0000-0000000000a3');
select lives_ok(
  format('insert into public.invitaciones (organizacion_id, etiqueta, rol, codigo_hash) values (%L, ''Marta'', ''empleado'', %L)',
    current_setting('prueba.org_a'), pg_temp.hash('codigo-marta')),
  'el dueño invita a un empleado'
);
select lives_ok(
  format('insert into public.invitaciones (organizacion_id, etiqueta, rol, codigo_hash) values (%L, ''Gestoría'', ''gestoria'', %L)',
    current_setting('prueba.org_a'), pg_temp.hash('codigo-gestoria')),
  'el dueño invita a la gestoría'
);
select throws_ok(
  format('insert into public.invitaciones (organizacion_id, etiqueta, rol, codigo_hash) values (%L, ''Socio'', ''dueno'', %L)',
    current_setting('prueba.org_a'), pg_temp.hash('codigo-dueno')),
  '23514', null, 'no se puede invitar a un dueño'
);
select throws_ok(
  format('insert into public.invitaciones (organizacion_id, etiqueta, rol, codigo_hash) values (%L, ''Corto'', ''empleado'', ''abc'')',
    current_setting('prueba.org_a')),
  '23514', null, 'el código se guarda siempre como resumen de 64 caracteres'
);

select pg_temp.como('00000000-0000-0000-0000-0000000000c3');
select throws_ok(
  format('insert into public.invitaciones (organizacion_id, etiqueta, rol, codigo_hash) values (%L, ''Pedro'', ''empleado'', %L)',
    current_setting('prueba.org_a'), pg_temp.hash('codigo-pedro')),
  '42501', null, 'el encargado no puede invitar'
);
select is((select count(*)::int from public.invitaciones), 0, 'el encargado no ve las invitaciones');

select pg_temp.como('00000000-0000-0000-0000-0000000000b3');
select throws_ok(
  format('insert into public.invitaciones (organizacion_id, etiqueta, rol, codigo_hash) values (%L, ''Intruso'', ''empleado'', %L)',
    current_setting('prueba.org_a'), pg_temp.hash('codigo-intruso')),
  '42501', null, 'el dueño de B no puede invitar a A'
);
select is((select count(*)::int from public.invitaciones), 0, 'el dueño de B no ve las invitaciones de A');

-- Aceptar.
select pg_temp.como('00000000-0000-0000-0000-0000000000d3');
select is(public.aceptar_invitacion('codigo-marta')::text, current_setting('prueba.org_a'), 'aceptar devuelve el negocio');
select is(
  (select rol::text from public.miembros where organizacion_id = current_setting('prueba.org_a')::uuid and usuario_id = '00000000-0000-0000-0000-0000000000d3'),
  'empleado', 'queda con el rol de la invitación'
);
select throws_ok($$select public.aceptar_invitacion('codigo-marta')$$, 'P0001', null, 'el enlace vale una sola vez');

select pg_temp.como('00000000-0000-0000-0000-0000000000e3');
select throws_ok($$select public.aceptar_invitacion('codigo-que-no-existe')$$, 'P0001', null, 'un código inventado no vale');
select throws_ok($$select public.aceptar_invitacion(null)$$, 'P0001', null, 'sin código tampoco');

-- Caducada: no vale aunque el código sea bueno.
-- (Nadie puede editar una invitación desde la app; el reloj se adelanta con el rol de la base de datos.)
reset role;
update public.invitaciones set caduca_en = now() - interval '1 minute' where codigo_hash = pg_temp.hash('codigo-gestoria');
set local role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000000e3');
select throws_ok($$select public.aceptar_invitacion('codigo-gestoria')$$, 'P0001', null, 'una invitación caducada no vale');

-- Quien ya es miembro con más categoría no baja de rol al aceptar una invitación.
select pg_temp.como('00000000-0000-0000-0000-0000000000a3');
insert into public.invitaciones (organizacion_id, etiqueta, rol, codigo_hash)
  values (current_setting('prueba.org_a')::uuid, 'Otra vez', 'empleado', pg_temp.hash('codigo-rebaja'));
select public.aceptar_invitacion('codigo-rebaja');
select is(
  (select rol::text from public.miembros where organizacion_id = current_setting('prueba.org_a')::uuid and usuario_id = '00000000-0000-0000-0000-0000000000a3'),
  'dueno', 'el dueño sigue siendo dueño'
);

-- Anular: solo el dueño.
select pg_temp.como('00000000-0000-0000-0000-0000000000c3');
delete from public.invitaciones where organizacion_id = current_setting('prueba.org_a')::uuid;
select pg_temp.como('00000000-0000-0000-0000-0000000000a3');
select ok((select count(*) from public.invitaciones) > 0, 'el encargado no ha podido anular nada');

-- Equipo: nombres para todos, correos solo para quien gestiona usuarios, nada para extraños.
select is(
  (select count(*)::int from public.equipo_del_negocio(current_setting('prueba.org_a')::uuid) where correo is not null),
  3, 'el dueño ve el correo de los 3 miembros'
);
select pg_temp.como('00000000-0000-0000-0000-0000000000b3');
select is((select count(*)::int from public.equipo_del_negocio(current_setting('prueba.org_a')::uuid)), 0, 'un extraño no ve el equipo de otro negocio');

select * from finish();
rollback;
