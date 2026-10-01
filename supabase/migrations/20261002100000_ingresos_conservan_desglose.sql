-- Si un día ya tenía cierre con efectivo y tarjeta y la hoja de ingresos solo trae la venta, el
-- desglose guardado se conserva en vez de borrarse. Mismo cuerpo que registrar_ingresos, solo cambia
-- el `do update`.
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
