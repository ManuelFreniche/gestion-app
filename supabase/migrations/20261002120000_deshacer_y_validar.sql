-- Deshacer lo que se metió desde la Bandeja y no dejar entrar datos imposibles.
--
-- 1) Nuevo permiso `documentos.deshacer` (dueño y encargado) y la función `deshacer_documento`: quita de
--    Ventas y de Facturas lo que metió un documento aprobado y lo devuelve a la Bandeja para revisarlo
--    otra vez. No borra nada que se perdería sin avisar (días con notas o sabores apuntados, facturas ya
--    marcadas como pagadas).
-- 2) `aprobar_cierre` y `registrar_ingresos` rechazan fechas futuras o absurdas, y `aprobar_cierre` rechaza
--    un cobro (efectivo + tarjeta) mayor que la venta y ya no borra el desglose guardado cuando el cierre
--    nuevo no trae ninguno.
-- 3) Una misma factura (proveedor, número, fecha e importe) no puede registrarse dos veces.

insert into public.permisos_rol (rol, permiso) values
  ('dueno', 'documentos.deshacer'),
  ('encargado', 'documentos.deshacer');

-- Fecha de hoy en la zona horaria del negocio, para no aceptar ventas de días que aún no han llegado.
create function privado.validar_fecha_venta(org uuid, f date)
returns void
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  hoy date;
begin
  select (now() at time zone coalesce(
    (select a.zona_horaria from public.ajustes_organizacion a where a.organizacion_id = org),
    'Europe/Madrid'
  ))::date into hoy;

  if f is null then
    raise exception 'Falta la fecha de la venta';
  end if;
  if f > hoy then
    raise exception 'El % es un día futuro: elige el día en que se hizo la venta.', to_char(f, 'DD/MM/YYYY');
  end if;
  if f < date '2000-01-01' then
    raise exception 'El % es una fecha demasiado antigua: revisa el año.', to_char(f, 'DD/MM/YYYY');
  end if;
end;
$$;

revoke all on function privado.validar_fecha_venta(uuid, date) from public, anon;
grant execute on function privado.validar_fecha_venta(uuid, date) to authenticated;

-- Aprueba un ticket de cierre. Igual que antes, pero con la fecha y el cobro comprobados, y si el cierre
-- nuevo no trae efectivo ni tarjeta se conserva el desglose que el día ya tuviera.
create or replace function public.aprobar_cierre(
  p_documento uuid,
  p_local uuid,
  p_fecha date,
  p_venta numeric,
  p_efectivo numeric default null,
  p_banco numeric default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  org uuid;
  cierre uuid;
begin
  select organizacion_id into org
  from public.documentos_entrantes
  where id = p_documento and tipo = 'cierre' and estado = 'pendiente'
  for update;

  if org is null then
    raise exception 'El documento no existe o ya se revisó' using errcode = 'P0002';
  end if;

  perform privado.validar_fecha_venta(org, p_fecha);
  if coalesce(p_efectivo, 0) + coalesce(p_banco, 0) > p_venta + 0.05 then
    raise exception 'Efectivo (%) y tarjeta (%) suman más que la venta (%): revisa las cifras.',
      to_char(coalesce(p_efectivo, 0), 'FM999990.00'), to_char(coalesce(p_banco, 0), 'FM999990.00'), to_char(p_venta, 'FM999990.00');
  end if;

  insert into public.cierres_diarios (organizacion_id, local_id, fecha, venta, efectivo, banco, documento_id)
  values (org, p_local, p_fecha, p_venta, p_efectivo, p_banco, p_documento)
  on conflict (local_id, fecha) do update
    set venta = excluded.venta,
        efectivo = case when excluded.efectivo is null and excluded.banco is null then public.cierres_diarios.efectivo else excluded.efectivo end,
        banco = case when excluded.efectivo is null and excluded.banco is null then public.cierres_diarios.banco else excluded.banco end,
        documento_id = excluded.documento_id,
        actualizado_en = now()
  returning id into cierre;

  update public.documentos_entrantes
  set estado = 'aprobado',
      revisado_por = auth.uid(),
      revisado_en = now(),
      datos = datos || jsonb_build_object('fecha', p_fecha, 'venta', p_venta)
  where id = p_documento;

  return cierre;
end;
$$;

-- Mete en Ventas los días de una hoja de ingresos. Igual que antes, pero ningún día puede ser futuro.
create or replace function public.registrar_ingresos(p_documento uuid, p_local uuid, p_dias jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  org uuid;
  d jsonb;
  total integer := 0;
begin
  if jsonb_typeof(p_dias) is distinct from 'array' or jsonb_array_length(p_dias) not between 1 and 400 then
    raise exception 'Lista de días no válida' using errcode = '22023';
  end if;

  select organizacion_id into org
  from public.documentos_entrantes
  where id = p_documento and tipo in ('factura', 'ingresos') and estado = 'pendiente'
  for update;

  if org is null then
    raise exception 'El documento no existe o ya se revisó' using errcode = 'P0002';
  end if;

  for d in select * from jsonb_array_elements(p_dias) loop
    perform privado.validar_fecha_venta(org, (d->>'fecha')::date);

    insert into public.cierres_diarios (organizacion_id, local_id, fecha, venta, efectivo, banco, documento_id)
    values (
      org,
      p_local,
      (d->>'fecha')::date,
      (d->>'venta')::numeric,
      (d->>'efectivo')::numeric,
      (d->>'banco')::numeric,
      p_documento
    )
    on conflict (local_id, fecha) do update
      set venta = excluded.venta,
          efectivo = coalesce(excluded.efectivo, public.cierres_diarios.efectivo),
          banco = coalesce(excluded.banco, public.cierres_diarios.banco),
          documento_id = excluded.documento_id,
          actualizado_en = now();
    total := total + 1;
  end loop;

  perform public.cerrar_parte(p_documento, 'ingresos', 'aprobada');
  return total;
end;
$$;

-- Una factura con número no puede registrarse dos veces (mismo proveedor, número, fecha e importe). Un
-- abono con el mismo número que la factura que anula tiene el importe cambiado de signo, así que no choca.
create unique index facturas_recibidas_unica_idx on public.facturas_recibidas
  (organizacion_id, lower(btrim(proveedor)), numero, fecha, importe)
  where numero is not null and btrim(numero) <> '';

-- Deshace un documento aprobado: quita de Ventas y de Facturas lo que metió y lo devuelve a la Bandeja
-- (pendiente), para leerlo o corregirlo y volver a meterlo. Devuelve cuántos días y facturas ha quitado.
--
-- Va con los permisos del propietario de la función (hace falta borrar cierres, que ninguna política deja
-- borrar) pero comprueba por dentro que quien llama tiene `documentos.deshacer` en ese negocio. Si el
-- documento no existe, no está aprobado o es de otro negocio, el error es el mismo: no revela nada.
create function public.deshacer_documento(p_documento uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  doc public.documentos_entrantes%rowtype;
  cierres integer;
  facturas integer;
begin
  select * into doc
  from public.documentos_entrantes
  where id = p_documento and estado = 'aprobado'
  for update;

  if not found or not privado.autorizar(doc.organizacion_id, 'documentos.deshacer') then
    raise exception 'El documento no existe o ya no se puede deshacer' using errcode = 'P0002';
  end if;

  -- Un día con notas o con sabores apuntados tiene datos que no vienen del documento: no se borra.
  if exists (
    select 1 from public.cierres_diarios c
    where c.documento_id = doc.id
      and c.organizacion_id = doc.organizacion_id
      and (c.notas is not null or exists (select 1 from public.cierre_tandas t where t.cierre_id = c.id))
  ) then
    raise exception 'Algún día de este documento tiene notas o sabores apuntados y se perderían. Quítalos antes de deshacerlo.';
  end if;

  if exists (
    select 1 from public.facturas_recibidas f
    where f.documento_id = doc.id
      and f.organizacion_id = doc.organizacion_id
      and f.estado_pago = 'pagada'
  ) then
    raise exception 'Alguna factura de este documento está marcada como pagada. Márcala como pendiente en Facturas antes de deshacerlo.';
  end if;

  delete from public.cierres_diarios
  where documento_id = doc.id and organizacion_id = doc.organizacion_id;
  get diagnostics cierres = row_count;

  delete from public.facturas_recibidas
  where documento_id = doc.id and organizacion_id = doc.organizacion_id;
  get diagnostics facturas = row_count;

  update public.documentos_entrantes
  set estado = 'pendiente',
      revisado_por = null,
      revisado_en = null,
      datos = (datos - 'partes') || jsonb_build_object('deshecho_en', now(), 'deshecho_por', auth.uid())
  where id = doc.id;

  return jsonb_build_object('cierres', cierres, 'facturas', facturas);
end;
$$;

revoke all on function public.deshacer_documento(uuid) from public, anon;
grant execute on function public.deshacer_documento(uuid) to authenticated;
