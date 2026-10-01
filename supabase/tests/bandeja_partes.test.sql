-- La Bandeja reparte un archivo en partes (facturas y gastos, ingresos) y cada una se decide por separado.
-- Se ejecuta con `npm run test:db` (dentro de una transacción que se deshace al final).

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(11);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000a4', 'dueno-a@partes.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b4', 'dueno-b@partes.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000e4', 'empleado-a@partes.test', 'authenticated', 'authenticated');

create function pg_temp.como(usuario uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', usuario, 'role', 'authenticated')::text, true);
$$;

set local role authenticated;

select pg_temp.como('00000000-0000-0000-0000-0000000000a4');
select set_config('prueba.org_a', public.crear_organizacion('Negocio A')::text, true);
select set_config('prueba.local_a', (select id::text from public.locales where organizacion_id = current_setting('prueba.org_a')::uuid), true);
insert into public.miembros (organizacion_id, usuario_id, rol) values
  (current_setting('prueba.org_a')::uuid, '00000000-0000-0000-0000-0000000000e4', 'empleado');

select pg_temp.como('00000000-0000-0000-0000-0000000000b4');
select set_config('prueba.org_b', public.crear_organizacion('Negocio B')::text, true);
select set_config('prueba.local_b', (select id::text from public.locales where organizacion_id = current_setting('prueba.org_b')::uuid), true);

-- Un día que ya tenía cierre, con notas.
select pg_temp.como('00000000-0000-0000-0000-0000000000a4');
insert into public.cierres_diarios (organizacion_id, local_id, fecha, venta, notas)
  values (current_setting('prueba.org_a')::uuid, current_setting('prueba.local_a')::uuid, date '2026-09-01', 1, 'nota');

insert into public.documentos_entrantes (id, organizacion_id, tipo, origen, archivo_ruta, archivo_nombre, archivo_tipo, huella, datos)
values
  ('00000000-0000-0000-0000-00000000d401', current_setting('prueba.org_a')::uuid, 'factura', 'subida', current_setting('prueba.org_a') || '/m.pdf', 'm.pdf', 'application/pdf', 'p1',
   '{"facturas":[{"proveedor":"Cepsa"}],"ingresos":[{"fecha":"2026-09-01"},{"fecha":"2026-09-02"}]}'),
  ('00000000-0000-0000-0000-00000000d402', current_setting('prueba.org_a')::uuid, 'ingresos', 'subida', current_setting('prueba.org_a') || '/i.pdf', 'i.pdf', 'application/pdf', 'p2',
   '{"ingresos":[{"fecha":"2026-09-03"}]}'),
  ('00000000-0000-0000-0000-00000000d403', current_setting('prueba.org_a')::uuid, 'ingresos', 'subida', current_setting('prueba.org_a') || '/j.pdf', 'j.pdf', 'application/pdf', 'p3',
   '{"ingresos":[{"fecha":"2026-09-04"}]}');

-- Los ingresos de un archivo mixto entran en Ventas y el archivo sigue pendiente.
select is(
  public.registrar_ingresos('00000000-0000-0000-0000-00000000d401', current_setting('prueba.local_a')::uuid,
    '[{"fecha":"2026-09-01","venta":280,"efectivo":100,"banco":180},{"fecha":"2026-09-02","venta":310.5}]'::jsonb),
  2, 'se meten los dos días de la hoja'
);
select is((select estado from public.documentos_entrantes where id = '00000000-0000-0000-0000-00000000d401'), 'pendiente',
  'faltan las facturas: el archivo sigue pendiente');
select is((select venta from public.cierres_diarios where fecha = date '2026-09-01'), 280.00, 'el día que ya existía se actualiza con la hoja');
select is((select notas from public.cierres_diarios where fecha = date '2026-09-01'), 'nota', 'las notas del cierre se conservan');

-- Las facturas, con categoría Gasolina, cierran el archivo.
select is(
  public.registrar_facturas('00000000-0000-0000-0000-00000000d401',
    '[{"proveedor":"Cepsa","fecha":"2026-09-12","importe":45.3,"categoria":"Gasolina","lineas":[]}]'::jsonb),
  1, 'se mete la factura de gasolina'
);
select is((select estado from public.documentos_entrantes where id = '00000000-0000-0000-0000-00000000d401'), 'aprobado',
  'decididas las dos partes, el archivo queda aprobado');
select throws_ok(
  format($f$select public.registrar_ingresos('00000000-0000-0000-0000-00000000d401', %L, '[{"fecha":"2026-09-05","venta":1}]'::jsonb)$f$,
    current_setting('prueba.local_a')),
  'P0002', null, 'un archivo ya cerrado no se vuelve a meter'
);

-- Descartar la única parte deja el archivo descartado.
select public.cerrar_parte('00000000-0000-0000-0000-00000000d402', 'ingresos', 'descartada');
select is((select estado from public.documentos_entrantes where id = '00000000-0000-0000-0000-00000000d402'), 'descartado',
  'descartar la única parte descarta el archivo');

-- El empleado no mete ventas; otro negocio tampoco puede tocar los documentos de A.
select pg_temp.como('00000000-0000-0000-0000-0000000000e4');
select throws_ok(
  format($f$select public.registrar_ingresos('00000000-0000-0000-0000-00000000d403', %L, '[{"fecha":"2026-09-04","venta":50}]'::jsonb)$f$,
    current_setting('prueba.local_a')),
  'P0002', null, 'el empleado no puede meter ingresos'
);
select pg_temp.como('00000000-0000-0000-0000-0000000000b4');
select throws_ok(
  format($f$select public.registrar_ingresos('00000000-0000-0000-0000-00000000d403', %L, '[{"fecha":"2026-09-04","venta":50}]'::jsonb)$f$,
    current_setting('prueba.local_b')),
  'P0002', null, 'otro negocio no puede meter ingresos en un documento ajeno'
);
select is((select count(*)::int from public.cierres_diarios), 0, 'otro negocio no ve las ventas de A');

select * from finish();
rollback;
