-- Aislamiento y permisos de las facturas recibidas y su aprobación desde la bandeja.
-- Se ejecuta con `npm run test:db` (dentro de una transacción que se deshace al final).

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(22);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000a2', 'dueno-a@facturas.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b2', 'dueno-b@facturas.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000e2', 'empleado-a@facturas.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000f2', 'gestoria-a@facturas.test', 'authenticated', 'authenticated');

create function pg_temp.como(usuario uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', usuario, 'role', 'authenticated')::text, true);
$$;

set local role authenticated;

select pg_temp.como('00000000-0000-0000-0000-0000000000a2');
select set_config('prueba.org_a', public.crear_organizacion('Negocio A')::text, true);
insert into public.miembros (organizacion_id, usuario_id, rol) values
  (current_setting('prueba.org_a')::uuid, '00000000-0000-0000-0000-0000000000e2', 'empleado'),
  (current_setting('prueba.org_a')::uuid, '00000000-0000-0000-0000-0000000000f2', 'gestoria');

select pg_temp.como('00000000-0000-0000-0000-0000000000b2');
select set_config('prueba.org_b', public.crear_organizacion('Negocio B')::text, true);

-- El empleado sube una factura a la bandeja (puede subir, pero no revisar).
select pg_temp.como('00000000-0000-0000-0000-0000000000e2');
select lives_ok(
  format($f$insert into public.documentos_entrantes
    (id, organizacion_id, tipo, origen, archivo_ruta, archivo_nombre, archivo_tipo, huella)
    values ('00000000-0000-0000-0000-00000000d001', %L, 'factura', 'subida', %L, 'leroy.pdf', 'application/pdf', 'h1')$f$,
    current_setting('prueba.org_a'), current_setting('prueba.org_a') || '/leroy.pdf'),
  'el empleado puede subir una factura a la bandeja'
);
select throws_ok(
  $f$select public.aprobar_factura('00000000-0000-0000-0000-00000000d001', 'Leroy Merlín', date '2026-08-10', 84.50)$f$,
  'P0002', null, 'el empleado no puede aprobar facturas'
);
select is((select count(*)::int from public.facturas_recibidas), 0, 'el empleado no ve las facturas');

-- El dueño aprueba la factura.
select pg_temp.como('00000000-0000-0000-0000-0000000000a2');
select isnt(
  public.aprobar_factura('00000000-0000-0000-0000-00000000d001', 'Leroy Merlín', date '2026-08-10', 84.50, 'Suministros', 'F-123'),
  null, 'el dueño puede aprobar una factura'
);
select is(
  (select estado from public.documentos_entrantes where id = '00000000-0000-0000-0000-00000000d001'),
  'aprobado', 'al aprobar, el documento queda aprobado'
);
select throws_ok(
  $f$select public.aprobar_factura('00000000-0000-0000-0000-00000000d001', 'Leroy Merlín', date '2026-08-10', 84.50)$f$,
  'P0002', null, 'una factura no se puede aprobar dos veces'
);
select throws_ok(
  format($f$insert into public.facturas_recibidas (organizacion_id, proveedor, fecha, importe, categoria)
    values (%L, 'X', date '2026-08-10', 10, 'Inventada')$f$, current_setting('prueba.org_a')),
  '23514', null, 'la categoría tiene que ser una de la lista'
);

-- La gestoría lee pero no escribe.
select pg_temp.como('00000000-0000-0000-0000-0000000000f2');
select is((select count(*)::int from public.facturas_recibidas), 1, 'la gestoría ve las facturas');
select throws_ok(
  format($f$insert into public.facturas_recibidas (organizacion_id, proveedor, fecha, importe)
    values (%L, 'X', date '2026-08-10', 10)$f$, current_setting('prueba.org_a')),
  '42501', null, 'la gestoría no puede crear facturas'
);

-- El negocio B no ve ni toca nada de A.
select pg_temp.como('00000000-0000-0000-0000-0000000000b2');
select is((select count(*)::int from public.facturas_recibidas), 0, 'B no ve las facturas de A');
select throws_ok(
  format($f$insert into public.facturas_recibidas (organizacion_id, proveedor, fecha, importe)
    values (%L, 'X', date '2026-08-10', 10)$f$, current_setting('prueba.org_a')),
  '42501', null, 'B no puede crear facturas en A'
);
select throws_ok(
  $f$select public.aprobar_factura('00000000-0000-0000-0000-00000000d001', 'X', date '2026-08-10', 10)$f$,
  'P0002', null, 'B no puede aprobar documentos de A'
);

-- Varias facturas con líneas en un solo documento.
select pg_temp.como('00000000-0000-0000-0000-0000000000e2');
select lives_ok(
  format($f$insert into public.documentos_entrantes
    (id, organizacion_id, tipo, origen, archivo_ruta, archivo_nombre, archivo_tipo, huella)
    values ('00000000-0000-0000-0000-00000000d002', %L, 'factura', 'subida', %L, 'puleva.pdf', 'application/pdf', 'h2')$f$,
    current_setting('prueba.org_a'), current_setting('prueba.org_a') || '/puleva.pdf'),
  'el empleado sube otro documento con varias facturas'
);
select throws_ok(
  $f$select public.registrar_facturas('00000000-0000-0000-0000-00000000d002', '[{"proveedor":"Puleva","fecha":"2026-08-01","importe":10}]'::jsonb)$f$,
  'P0002', null, 'el empleado no puede registrar facturas'
);

select pg_temp.como('00000000-0000-0000-0000-0000000000a2');
select is(
  public.registrar_facturas('00000000-0000-0000-0000-00000000d002', $j$[
    {"proveedor":"Puleva","numero":"A-1","fecha":"2026-08-01","importe":24.2,"categoria":"Materia prima",
     "lineas":[{"descripcion":"Leche entera 1L","cantidad":20,"unidad":"ud","precio_unitario":1,"importe":20}]},
    {"proveedor":"Puleva","numero":"A-2","fecha":"2026-08-15","importe":12.1,"categoria":"Materia prima",
     "lineas":[{"descripcion":"Leche entera 1L","cantidad":10,"unidad":"ud","precio_unitario":1,"importe":10}]}
  ]$j$::jsonb),
  2, 'el dueño registra dos facturas de un documento'
);
select is((select count(*)::int from public.facturas_recibidas where documento_id = '00000000-0000-0000-0000-00000000d002'), 2, 'quedan dos facturas');
select is((select count(*)::int from public.facturas_lineas), 2, 'y sus líneas');
select throws_ok(
  $f$select public.registrar_facturas('00000000-0000-0000-0000-00000000d002', '[{"proveedor":"X","fecha":"2026-08-01","importe":1}]'::jsonb)$f$,
  'P0002', null, 'un documento no se registra dos veces'
);

-- La gestoría lee las líneas pero no las escribe.
select pg_temp.como('00000000-0000-0000-0000-0000000000f2');
select is((select count(*)::int from public.facturas_lineas), 2, 'la gestoría ve las líneas');
select throws_ok(
  format($f$insert into public.facturas_lineas (organizacion_id, factura_id, descripcion, importe)
    select %L, id, 'X', 1 from public.facturas_recibidas limit 1$f$, current_setting('prueba.org_a')),
  '42501', null, 'la gestoría no puede crear líneas'
);

-- El negocio B no ve las líneas de A.
select pg_temp.como('00000000-0000-0000-0000-0000000000b2');
select is((select count(*)::int from public.facturas_lineas), 0, 'B no ve las líneas de A');
select throws_ok(
  format($f$insert into public.facturas_lineas (organizacion_id, factura_id, descripcion, importe)
    values (%L, gen_random_uuid(), 'X', 1)$f$, current_setting('prueba.org_a')),
  '42501', null, 'B no puede crear líneas en A'
);

reset role;
select * from finish();
rollback;
