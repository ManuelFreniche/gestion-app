-- Deshacer lo metido desde la Bandeja, validación de fechas y cobros, y facturas repetidas.
-- Se ejecuta con `npm run test:db` (dentro de una transacción que se deshace al final).

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(59);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000a3', 'dueno-a@deshacer.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b3', 'dueno-b@deshacer.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000c3', 'encargado-a@deshacer.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000e3', 'empleado-a@deshacer.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000f3', 'gestoria-a@deshacer.test', 'authenticated', 'authenticated');

create function pg_temp.como(usuario uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', usuario, 'role', 'authenticated')::text, true);
$$;

-- Sube un documento a la bandeja de un negocio (con el usuario que esté activo).
create function pg_temp.doc(p_id uuid, p_tipo text, p_org text) returns void language sql as $$
  insert into public.documentos_entrantes (id, organizacion_id, tipo, origen, archivo_ruta, archivo_nombre, archivo_tipo, huella)
  values (p_id, p_org::uuid, p_tipo, 'subida', p_org || '/' || p_id || '.pdf', 'x.pdf', 'application/pdf', p_id::text);
$$;

set local role authenticated;

select pg_temp.como('00000000-0000-0000-0000-0000000000a3');
select set_config('prueba.org_a', public.crear_organizacion('Negocio A')::text, true);
insert into public.miembros (organizacion_id, usuario_id, rol) values
  (current_setting('prueba.org_a')::uuid, '00000000-0000-0000-0000-0000000000c3', 'encargado'),
  (current_setting('prueba.org_a')::uuid, '00000000-0000-0000-0000-0000000000e3', 'empleado'),
  (current_setting('prueba.org_a')::uuid, '00000000-0000-0000-0000-0000000000f3', 'gestoria');
select set_config('prueba.local_a',
  (select id::text from public.locales where organizacion_id = current_setting('prueba.org_a')::uuid), true);
select set_config('prueba.hoy', ((now() at time zone 'Europe/Madrid')::date)::text, true);

select pg_temp.como('00000000-0000-0000-0000-0000000000b3');
select set_config('prueba.org_b', public.crear_organizacion('Negocio B')::text, true);
select set_config('prueba.local_b',
  (select id::text from public.locales where organizacion_id = current_setting('prueba.org_b')::uuid), true);

-- ───────────────────────── Permiso nuevo ─────────────────────────
select pg_temp.como('00000000-0000-0000-0000-0000000000a3');
select is((select count(*)::int from public.mis_permisos(current_setting('prueba.org_a')::uuid) as p where p = 'documentos.deshacer'), 1,
  'el dueño puede deshacer documentos');
select pg_temp.como('00000000-0000-0000-0000-0000000000c3');
select is((select count(*)::int from public.mis_permisos(current_setting('prueba.org_a')::uuid) as p where p = 'documentos.deshacer'), 1,
  'el encargado puede deshacer documentos');
select pg_temp.como('00000000-0000-0000-0000-0000000000e3');
select is((select count(*)::int from public.mis_permisos(current_setting('prueba.org_a')::uuid) as p where p = 'documentos.deshacer'), 0,
  'el empleado no puede deshacer documentos');
select pg_temp.como('00000000-0000-0000-0000-0000000000f3');
select is((select count(*)::int from public.mis_permisos(current_setting('prueba.org_a')::uuid) as p where p = 'documentos.deshacer'), 0,
  'la gestoría no puede deshacer documentos');
select is(has_function_privilege('anon', 'public.deshacer_documento(uuid)', 'execute'), false,
  'sin iniciar sesión no se puede deshacer nada');

-- ───────────────────────── Fechas y cobros ─────────────────────────
select pg_temp.como('00000000-0000-0000-0000-0000000000a3');
select lives_ok(
  format($f$select pg_temp.doc('00000000-0000-0000-0000-00000000d301', 'cierre', %L)$f$, current_setting('prueba.org_a')),
  'el dueño sube un cierre a la bandeja');
select throws_ok(
  format($f$select public.aprobar_cierre('00000000-0000-0000-0000-00000000d301', %L, %L::date + 1, 100)$f$,
    current_setting('prueba.local_a'), current_setting('prueba.hoy')),
  'P0001', null, 'un cierre con fecha de mañana no entra');
select throws_ok(
  format($f$select public.aprobar_cierre('00000000-0000-0000-0000-00000000d301', %L, date '1999-12-31', 100)$f$,
    current_setting('prueba.local_a')),
  'P0001', null, 'un cierre con una fecha absurdamente antigua no entra');
select throws_ok(
  format($f$select public.aprobar_cierre('00000000-0000-0000-0000-00000000d301', %L, %L::date, 100, 60, 60)$f$,
    current_setting('prueba.local_a'), current_setting('prueba.hoy')),
  'P0001', null, 'efectivo y tarjeta no pueden sumar más que la venta');
select is((select estado from public.documentos_entrantes where id = '00000000-0000-0000-0000-00000000d301'), 'pendiente',
  'si falla la comprobación, el documento sigue pendiente');
select isnt(
  public.aprobar_cierre('00000000-0000-0000-0000-00000000d301', current_setting('prueba.local_a')::uuid,
    current_setting('prueba.hoy')::date, 100, 20, 80),
  null, 'el día de hoy sí se acepta, con efectivo y tarjeta que suman la venta');

-- Un cierre nuevo sin desglose no borra el que el día ya tenía.
select pg_temp.doc('00000000-0000-0000-0000-00000000d302', 'cierre', current_setting('prueba.org_a'));
select isnt(
  public.aprobar_cierre('00000000-0000-0000-0000-00000000d302', current_setting('prueba.local_a')::uuid,
    current_setting('prueba.hoy')::date, 110),
  null, 'un segundo cierre del mismo día lo sustituye');
select is((select venta from public.cierres_diarios where local_id = current_setting('prueba.local_a')::uuid and fecha = current_setting('prueba.hoy')::date),
  110.00::numeric, 'la venta es la del cierre nuevo');
select is((select efectivo from public.cierres_diarios where local_id = current_setting('prueba.local_a')::uuid and fecha = current_setting('prueba.hoy')::date),
  20.00::numeric, 'el efectivo guardado se conserva si el cierre nuevo no trae desglose');
select is((select banco from public.cierres_diarios where local_id = current_setting('prueba.local_a')::uuid and fecha = current_setting('prueba.hoy')::date),
  80.00::numeric, 'la tarjeta guardada se conserva si el cierre nuevo no trae desglose');

select pg_temp.doc('00000000-0000-0000-0000-00000000d303', 'cierre', current_setting('prueba.org_a'));
select isnt(
  public.aprobar_cierre('00000000-0000-0000-0000-00000000d303', current_setting('prueba.local_a')::uuid,
    current_setting('prueba.hoy')::date, 110, 5, null),
  null, 'un cierre con desglose parcial lo sustituye entero');
select is((select efectivo from public.cierres_diarios where local_id = current_setting('prueba.local_a')::uuid and fecha = current_setting('prueba.hoy')::date),
  5.00::numeric, 'el efectivo es el del cierre nuevo');
select is((select banco from public.cierres_diarios where local_id = current_setting('prueba.local_a')::uuid and fecha = current_setting('prueba.hoy')::date),
  null::numeric, 'la tarjeta no se mezcla con la del cierre anterior');
select is((select documento_id from public.cierres_diarios where local_id = current_setting('prueba.local_a')::uuid and fecha = current_setting('prueba.hoy')::date),
  '00000000-0000-0000-0000-00000000d303'::uuid, 'el día pertenece al último documento que lo tocó');

-- ───────────────────────── Hoja de ingresos ─────────────────────────
select pg_temp.doc('00000000-0000-0000-0000-00000000d304', 'ingresos', current_setting('prueba.org_a'));
select throws_ok(
  format($f$select public.registrar_ingresos('00000000-0000-0000-0000-00000000d304', %L,
    jsonb_build_array(
      jsonb_build_object('fecha', %L::date - 10, 'venta', 50),
      jsonb_build_object('fecha', %L::date + 1, 'venta', 60)))$f$,
    current_setting('prueba.local_a'), current_setting('prueba.hoy'), current_setting('prueba.hoy')),
  'P0001', null, 'una hoja con un día futuro no entra');
select is((select count(*)::int from public.cierres_diarios where fecha = current_setting('prueba.hoy')::date - 10), 0,
  'y no deja a medias los días buenos de esa hoja');
select is(
  public.registrar_ingresos('00000000-0000-0000-0000-00000000d304', current_setting('prueba.local_a')::uuid,
    jsonb_build_array(
      jsonb_build_object('fecha', current_setting('prueba.hoy')::date - 10, 'venta', 50),
      jsonb_build_object('fecha', current_setting('prueba.hoy')::date - 9, 'venta', 60))),
  2, 'una hoja con días pasados entra');

-- ───────────────────────── Facturas repetidas ─────────────────────────
select pg_temp.doc('00000000-0000-0000-0000-00000000d305', 'factura', current_setting('prueba.org_a'));
select is(
  public.registrar_facturas('00000000-0000-0000-0000-00000000d305', $j$[
    {"proveedor":"Puleva","numero":"A-1","fecha":"2026-08-01","importe":24.2,"categoria":"Materia prima",
     "lineas":[{"descripcion":"Leche entera 1L","cantidad":20,"unidad":"ud","precio_unitario":1,"importe":20}]},
    {"proveedor":"Puleva","numero":"A-2","fecha":"2026-08-15","importe":12.1,"categoria":"Materia prima",
     "lineas":[{"descripcion":"Leche entera 1L","cantidad":10,"unidad":"ud","precio_unitario":1,"importe":10}]}
  ]$j$::jsonb),
  2, 'se registran dos facturas de un documento');

select pg_temp.doc('00000000-0000-0000-0000-00000000d306', 'factura', current_setting('prueba.org_a'));
select throws_ok(
  $f$select public.registrar_facturas('00000000-0000-0000-0000-00000000d306',
    '[{"proveedor":"  PULEVA ","numero":"A-1","fecha":"2026-08-01","importe":24.2}]'::jsonb)$f$,
  '23505', null, 'la misma factura (aunque cambien mayúsculas o espacios) no se registra dos veces');
select throws_ok(
  $f$select public.registrar_facturas('00000000-0000-0000-0000-00000000d306', $j$[
    {"proveedor":"Hielos SL","numero":"H-9","fecha":"2026-08-02","importe":30},
    {"proveedor":"Hielos SL","numero":"H-9","fecha":"2026-08-02","importe":30}
  ]$j$::jsonb)$f$,
  '23505', null, 'ni dos veces dentro del mismo documento');
select is(
  public.registrar_facturas('00000000-0000-0000-0000-00000000d306',
    '[{"proveedor":"Puleva","numero":"A-1","fecha":"2026-08-01","importe":-24.2,"categoria":"Materia prima"}]'::jsonb),
  1, 'un abono con el mismo número y el importe cambiado de signo sí entra');

select pg_temp.doc('00000000-0000-0000-0000-00000000d307', 'factura', current_setting('prueba.org_a'));
select is(
  public.registrar_facturas('00000000-0000-0000-0000-00000000d307', $j$[
    {"proveedor":"Varios","fecha":"2026-08-03","importe":5},
    {"proveedor":"Varios","fecha":"2026-08-03","importe":5}
  ]$j$::jsonb),
  2, 'las facturas sin número no se comparan: no se puede saber si son la misma');

-- ───────────────────────── Quién puede deshacer ─────────────────────────
select pg_temp.doc('00000000-0000-0000-0000-00000000d308', 'cierre', current_setting('prueba.org_a'));

select pg_temp.como('00000000-0000-0000-0000-0000000000e3');
select throws_ok($f$select public.deshacer_documento('00000000-0000-0000-0000-00000000d303')$f$,
  'P0002', null, 'el empleado no puede deshacer');
select pg_temp.como('00000000-0000-0000-0000-0000000000f3');
select throws_ok($f$select public.deshacer_documento('00000000-0000-0000-0000-00000000d304')$f$,
  'P0002', null, 'la gestoría no puede deshacer');
select pg_temp.como('00000000-0000-0000-0000-0000000000b3');
select throws_ok($f$select public.deshacer_documento('00000000-0000-0000-0000-00000000d302')$f$,
  'P0002', null, 'otro negocio no puede deshacer documentos ajenos (y no sabe si existen)');

select pg_temp.como('00000000-0000-0000-0000-0000000000a3');
select throws_ok($f$select public.deshacer_documento('00000000-0000-0000-0000-00000000dfff')$f$,
  'P0002', null, 'un documento que no existe da el mismo error');
select throws_ok($f$select public.deshacer_documento('00000000-0000-0000-0000-00000000d308')$f$,
  'P0002', null, 'un documento pendiente no se puede deshacer: no hay nada que quitar');

-- ───────────────────────── Deshacer un cierre ─────────────────────────
select pg_temp.como('00000000-0000-0000-0000-0000000000c3');
select is(public.deshacer_documento('00000000-0000-0000-0000-00000000d303'), '{"cierres": 1, "facturas": 0}'::jsonb,
  'el encargado deshace un cierre y se quita su día de Ventas');
select is((select estado from public.documentos_entrantes where id = '00000000-0000-0000-0000-00000000d303'), 'pendiente',
  'el documento vuelve a la bandeja');
select is((select revisado_en from public.documentos_entrantes where id = '00000000-0000-0000-0000-00000000d303'), null::timestamptz,
  'y sin fecha de revisión');
select ok((select datos ? 'deshecho_en' from public.documentos_entrantes where id = '00000000-0000-0000-0000-00000000d303'),
  'queda apuntado cuándo se deshizo');
select is((select count(*)::int from public.cierres_diarios where local_id = current_setting('prueba.local_a')::uuid and fecha = current_setting('prueba.hoy')::date), 0,
  'el día ya no está en Ventas');
select throws_ok($f$select public.deshacer_documento('00000000-0000-0000-0000-00000000d303')$f$,
  'P0002', null, 'deshacer dos veces da error');

-- Un documento cuyo día lo pisó otro no quita nada, pero se puede reabrir.
select is(public.deshacer_documento('00000000-0000-0000-0000-00000000d301'), '{"cierres": 0, "facturas": 0}'::jsonb,
  'deshacer un documento sustituido por otro no quita nada de Ventas');
select is((select estado from public.documentos_entrantes where id = '00000000-0000-0000-0000-00000000d301'), 'pendiente',
  'pero lo devuelve a la bandeja');

select isnt(
  public.aprobar_cierre('00000000-0000-0000-0000-00000000d303', current_setting('prueba.local_a')::uuid,
    current_setting('prueba.hoy')::date, 120, 20, 100),
  null, 'tras deshacer, el documento se puede volver a aprobar');

-- Una hoja de ingresos.
select is(public.deshacer_documento('00000000-0000-0000-0000-00000000d304'), '{"cierres": 2, "facturas": 0}'::jsonb,
  'deshacer una hoja de ingresos quita todos sus días');
select ok((select not (datos ? 'partes') from public.documentos_entrantes where id = '00000000-0000-0000-0000-00000000d304'),
  'y la hoja vuelve a tener todas sus partes por decidir');
select is((select count(*)::int from public.cierres_diarios where fecha in (current_setting('prueba.hoy')::date - 10, current_setting('prueba.hoy')::date - 9)), 0,
  'los días de la hoja ya no están en Ventas');

-- ───────────────────────── Deshacer facturas ─────────────────────────
select pg_temp.como('00000000-0000-0000-0000-0000000000a3');
update public.facturas_recibidas set estado_pago = 'pagada'
  where documento_id = '00000000-0000-0000-0000-00000000d305' and numero = 'A-1';
select throws_ok($f$select public.deshacer_documento('00000000-0000-0000-0000-00000000d305')$f$,
  'P0001', null, 'con una factura marcada como pagada no se deshace');
select is((select estado from public.documentos_entrantes where id = '00000000-0000-0000-0000-00000000d305'), 'aprobado',
  'el documento sigue aprobado');
select is((select count(*)::int from public.facturas_recibidas where documento_id = '00000000-0000-0000-0000-00000000d305'), 2,
  'y sus facturas siguen ahí');
update public.facturas_recibidas set estado_pago = 'pendiente'
  where documento_id = '00000000-0000-0000-0000-00000000d305';
select is(public.deshacer_documento('00000000-0000-0000-0000-00000000d305'), '{"cierres": 0, "facturas": 2}'::jsonb,
  'sin pagos marcados, se quitan sus facturas');
select is((select count(*)::int from public.facturas_lineas where organizacion_id = current_setting('prueba.org_a')::uuid), 0,
  'y sus líneas de producto');
select is(public.deshacer_documento('00000000-0000-0000-0000-00000000d306'), '{"cierres": 0, "facturas": 1}'::jsonb,
  'también se deshace un abono');

-- Un documento deshecho se puede volver a registrar con las mismas facturas.
select is(
  public.registrar_facturas('00000000-0000-0000-0000-00000000d305',
    '[{"proveedor":"Puleva","numero":"A-1","fecha":"2026-08-01","importe":24.2,"categoria":"Materia prima"}]'::jsonb),
  1, 'tras deshacer, las mismas facturas se pueden volver a registrar');

-- ───────────────────────── Lo que no se pierde sin avisar ─────────────────────────
select pg_temp.doc('00000000-0000-0000-0000-00000000d309', 'cierre', current_setting('prueba.org_a'));
select isnt(
  public.aprobar_cierre('00000000-0000-0000-0000-00000000d309', current_setting('prueba.local_a')::uuid,
    current_setting('prueba.hoy')::date - 5, 90, 10, 80),
  null, 'se aprueba un cierre de hace cinco días');
update public.cierres_diarios set notas = 'Cerrado antes por la lluvia'
  where local_id = current_setting('prueba.local_a')::uuid and fecha = current_setting('prueba.hoy')::date - 5;
select throws_ok($f$select public.deshacer_documento('00000000-0000-0000-0000-00000000d309')$f$,
  'P0001', null, 'un día con notas no se deshace: se perderían');
select is((select count(*)::int from public.cierres_diarios where fecha = current_setting('prueba.hoy')::date - 5), 1,
  'y el día sigue en Ventas');

select pg_temp.doc('00000000-0000-0000-0000-00000000d310', 'cierre', current_setting('prueba.org_a'));
select isnt(
  public.aprobar_cierre('00000000-0000-0000-0000-00000000d310', current_setting('prueba.local_a')::uuid,
    current_setting('prueba.hoy')::date - 4, 90, 10, 80),
  null, 'se aprueba otro cierre');
insert into public.sabores (id, organizacion_id, nombre)
  values ('00000000-0000-0000-0000-0000000005a1', current_setting('prueba.org_a')::uuid, 'Fresa');
insert into public.cierre_tandas (cierre_id, sabor_id, organizacion_id)
  select id, '00000000-0000-0000-0000-0000000005a1', organizacion_id from public.cierres_diarios
  where local_id = current_setting('prueba.local_a')::uuid and fecha = current_setting('prueba.hoy')::date - 4;
select throws_ok($f$select public.deshacer_documento('00000000-0000-0000-0000-00000000d310')$f$,
  'P0001', null, 'un día con sabores apuntados no se deshace');

-- ───────────────────────── Aislamiento entre negocios ─────────────────────────
select pg_temp.como('00000000-0000-0000-0000-0000000000b3');
select pg_temp.doc('00000000-0000-0000-0000-00000000d3b1', 'cierre', current_setting('prueba.org_b'));
select isnt(
  public.aprobar_cierre('00000000-0000-0000-0000-00000000d3b1', current_setting('prueba.local_b')::uuid,
    current_setting('prueba.hoy')::date - 1, 70, 10, 60),
  null, 'B aprueba un cierre en su negocio');

select pg_temp.como('00000000-0000-0000-0000-0000000000a3');
select throws_ok($f$select public.deshacer_documento('00000000-0000-0000-0000-00000000d3b1')$f$,
  'P0002', null, 'el dueño de A no puede deshacer documentos de B');

select pg_temp.como('00000000-0000-0000-0000-0000000000b3');
select is((select count(*)::int from public.cierres_diarios), 1, 'y los datos de B siguen intactos');

reset role;
select * from finish();
rollback;
