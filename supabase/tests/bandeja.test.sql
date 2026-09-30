-- Aislamiento y permisos de la bandeja de revisión.
-- Se ejecuta con `npm run test:db` (dentro de una transacción que se deshace al final).

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(11);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000a2', 'dueno-a@bandeja.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b2', 'dueno-b@bandeja.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000e2', 'empleado-a@bandeja.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000f2', 'gestoria-a@bandeja.test', 'authenticated', 'authenticated');

create function pg_temp.como(usuario uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', usuario, 'role', 'authenticated')::text, true);
$$;

set local role authenticated;

select pg_temp.como('00000000-0000-0000-0000-0000000000a2');
select set_config('prueba.org_a', public.crear_organizacion('Negocio A')::text, true);
insert into public.miembros (organizacion_id, usuario_id, rol) values
  (current_setting('prueba.org_a')::uuid, '00000000-0000-0000-0000-0000000000e2', 'empleado'),
  (current_setting('prueba.org_a')::uuid, '00000000-0000-0000-0000-0000000000f2', 'gestoria');
select set_config('prueba.local_a',
  (select id::text from public.locales where organizacion_id = current_setting('prueba.org_a')::uuid), true);

select pg_temp.como('00000000-0000-0000-0000-0000000000b2');
select set_config('prueba.org_b', public.crear_organizacion('Negocio B')::text, true);

-- El empleado sube un ticket de cierre a su negocio (pero no puede leer la bandeja).
select pg_temp.como('00000000-0000-0000-0000-0000000000e2');
select lives_ok(
  format('insert into public.documentos_entrantes (organizacion_id, tipo, origen, archivo_ruta, archivo_nombre, archivo_tipo, huella)
          values (%L, ''cierre'', ''subida'', %L, ''cierre.pdf'', ''application/pdf'', ''huella-1'')',
    current_setting('prueba.org_a'), current_setting('prueba.org_a') || '/1.pdf'),
  'el empleado puede subir un documento'
);
select is((select count(*)::int from public.documentos_entrantes), 0, 'el empleado no ve la bandeja');
select lives_ok(
  format('insert into storage.objects (bucket_id, name, owner) values (''documentos'', %L, auth.uid())',
    current_setting('prueba.org_a') || '/1.pdf'),
  'el empleado puede subir el archivo a la carpeta de su negocio'
);
select throws_ok(
  format('select public.aprobar_cierre((select id from public.documentos_entrantes limit 1), %L, date ''2026-09-30'', 100)',
    current_setting('prueba.local_a')),
  'P0002', null, 'el empleado no puede aprobar (no ve el documento)'
);

-- La gestoría no puede subir documentos.
select pg_temp.como('00000000-0000-0000-0000-0000000000f2');
select throws_ok(
  format('insert into public.documentos_entrantes (organizacion_id, tipo, origen, archivo_ruta, archivo_nombre, archivo_tipo, huella)
          values (%L, ''cierre'', ''subida'', %L, ''x.pdf'', ''application/pdf'', ''huella-2'')',
    current_setting('prueba.org_a'), current_setting('prueba.org_a') || '/2.pdf'),
  '42501', null, 'la gestoría no puede subir documentos'
);

-- El negocio B no ve nada de A ni puede escribir en su carpeta.
select pg_temp.como('00000000-0000-0000-0000-0000000000b2');
select is((select count(*)::int from public.documentos_entrantes), 0, 'B no ve los documentos de A');
select throws_ok(
  format('insert into storage.objects (bucket_id, name, owner) values (''documentos'', %L, auth.uid())',
    current_setting('prueba.org_a') || '/intruso.pdf'),
  '42501', null, 'B no puede subir archivos a la carpeta de A'
);
select throws_ok(
  format('insert into public.documentos_entrantes (organizacion_id, tipo, origen, archivo_ruta, archivo_nombre, archivo_tipo, huella)
          values (%L, ''cierre'', ''subida'', %L, ''x.pdf'', ''application/pdf'', ''huella-3'')',
    current_setting('prueba.org_b'), current_setting('prueba.org_a') || '/3.pdf'),
  '23514', null, 'un documento no puede apuntar a la carpeta de otro negocio'
);

-- El dueño de A revisa: ve el documento, lo aprueba una vez y no dos.
select pg_temp.como('00000000-0000-0000-0000-0000000000a2');
select is((select count(*)::int from public.documentos_entrantes), 1, 'el dueño ve la bandeja');
select isnt(
  public.aprobar_cierre((select id from public.documentos_entrantes limit 1),
    current_setting('prueba.local_a')::uuid, date '2026-09-30', 136.70, 10.80, 125.90),
  null, 'el dueño aprueba el ticket y se crea el cierre'
);
select throws_ok(
  format('select public.aprobar_cierre((select id from public.documentos_entrantes limit 1), %L, date ''2026-09-30'', 136.70)',
    current_setting('prueba.local_a')),
  'P0002', null, 'un documento ya revisado no se puede aprobar otra vez'
);

reset role;
select * from finish();
rollback;
