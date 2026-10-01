-- La Bandeja es la base: todo entra por ella y se reparte solo. Esta migración:
-- 1) añade la categoría Gasolina a los gastos,
-- 2) deja que un documento sea una hoja de ingresos (muchos días de venta), y
-- 3) permite que un mismo archivo traiga facturas e ingresos y se decida cada parte por separado.

-- La tabla gastos_varios (gastos apuntados a mano, migración anterior) queda sin uso: la interfaz
-- ya no la lee ni la escribe. Su borrado va en una migración aparte cuando se confirme.

alter table public.facturas_recibidas drop constraint facturas_recibidas_categoria_check;
alter table public.facturas_recibidas add constraint facturas_recibidas_categoria_check
  check (categoria in ('Materia prima', 'Suministros', 'Alquiler', 'Nóminas', 'Gasolina', 'Otros'));

alter table public.documentos_entrantes drop constraint documentos_entrantes_tipo_check;
alter table public.documentos_entrantes add constraint documentos_entrantes_tipo_check
  check (tipo in ('cierre', 'factura', 'ingresos'));

-- Cierra una parte de un documento ('facturas' o 'ingresos'). El documento sale de la bandeja
-- cuando se han decidido todas las partes que traía: queda 'aprobado' si se metió alguna y
-- 'descartado' si no se metió ninguna. Se ejecuta con los permisos de quien llama.
create function public.cerrar_parte(p_documento uuid, p_parte text, p_resultado text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actuales jsonb;
  partes jsonb;
  sin_decidir integer;
  metidas integer;
begin
  if p_parte not in ('facturas', 'ingresos') or p_resultado not in ('aprobada', 'descartada') then
    raise exception 'Parte no válida' using errcode = '22023';
  end if;

  select datos into actuales
  from public.documentos_entrantes
  where id = p_documento and estado = 'pendiente'
  for update;

  if not found then
    raise exception 'El documento no existe o ya se revisó' using errcode = 'P0002';
  end if;

  partes := coalesce(actuales->'partes', '{}'::jsonb) || jsonb_build_object(p_parte, p_resultado);

  select count(*) into sin_decidir
  from unnest(array['facturas', 'ingresos']) as k
  where jsonb_typeof(actuales->k) = 'array' and jsonb_array_length(actuales->k) > 0 and not (partes ? k);

  select count(*) into metidas from jsonb_each_text(partes) where value = 'aprobada';

  update public.documentos_entrantes
  set datos = actuales || jsonb_build_object('partes', partes),
      estado = case when sin_decidir > 0 then 'pendiente' when metidas > 0 then 'aprobado' else 'descartado' end,
      revisado_por = case when sin_decidir > 0 then revisado_por else auth.uid() end,
      revisado_en = case when sin_decidir > 0 then revisado_en else now() end
  where id = p_documento;
end;
$$;

revoke all on function public.cerrar_parte(uuid, text, text) from public, anon;
grant execute on function public.cerrar_parte(uuid, text, text) to authenticated;

-- Igual que antes, pero el documento solo se cierra cuando se han decidido todas sus partes.
create or replace function public.registrar_facturas(p_documento uuid, p_facturas jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  org uuid;
  f jsonb;
  l jsonb;
  factura uuid;
  total integer := 0;
begin
  if jsonb_typeof(p_facturas) is distinct from 'array' or jsonb_array_length(p_facturas) not between 1 and 50 then
    raise exception 'Lista de facturas no válida' using errcode = '22023';
  end if;

  select organizacion_id into org
  from public.documentos_entrantes
  where id = p_documento and tipo in ('factura', 'ingresos') and estado = 'pendiente'
  for update;

  if org is null then
    raise exception 'El documento no existe o ya se revisó' using errcode = 'P0002';
  end if;

  for f in select * from jsonb_array_elements(p_facturas) loop
    insert into public.facturas_recibidas (organizacion_id, proveedor, numero, fecha, importe, categoria, documento_id)
    values (
      org,
      trim(f->>'proveedor'),
      nullif(trim(f->>'numero'), ''),
      (f->>'fecha')::date,
      (f->>'importe')::numeric,
      coalesce(nullif(f->>'categoria', ''), 'Otros'),
      p_documento
    )
    returning id into factura;

    for l in select * from jsonb_array_elements(coalesce(f->'lineas', '[]'::jsonb)) loop
      insert into public.facturas_lineas (organizacion_id, factura_id, descripcion, cantidad, unidad, precio_unitario, importe)
      values (
        org,
        factura,
        trim(l->>'descripcion'),
        (l->>'cantidad')::numeric,
        nullif(trim(l->>'unidad'), ''),
        (l->>'precio_unitario')::numeric,
        (l->>'importe')::numeric
      );
    end loop;
    total := total + 1;
  end loop;

  perform public.cerrar_parte(p_documento, 'facturas', 'aprobada');
  return total;
end;
$$;

-- Mete en Ventas los días de una hoja de ingresos. p_dias es una lista de objetos
-- {fecha, venta, efectivo, banco}. Si un día ya tenía cierre, se actualiza con la hoja (las
-- tandas y las notas del cierre se conservan). Devuelve cuántos días se han metido.
create function public.registrar_ingresos(p_documento uuid, p_local uuid, p_dias jsonb)
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
          efectivo = excluded.efectivo,
          banco = excluded.banco,
          documento_id = excluded.documento_id,
          actualizado_en = now();
    total := total + 1;
  end loop;

  perform public.cerrar_parte(p_documento, 'ingresos', 'aprobada');
  return total;
end;
$$;

revoke all on function public.registrar_ingresos(uuid, uuid, jsonb) from public, anon;
grant execute on function public.registrar_ingresos(uuid, uuid, jsonb) to authenticated;
