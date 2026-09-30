-- Un documento puede traer varias facturas (un PDF con todas las del mes de un proveedor) y cada
-- factura trae líneas de producto. Las líneas permiten comparar precios entre proveedores y,
-- más adelante, calcular márgenes. Mismos permisos que las facturas: facturas.ver / facturas.editar.

drop index public.facturas_recibidas_documento_idx;
create index facturas_recibidas_documento_idx on public.facturas_recibidas (documento_id)
  where documento_id is not null;

create table public.facturas_lineas (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones (id) on delete cascade,
  factura_id uuid not null references public.facturas_recibidas (id) on delete cascade,
  descripcion text not null check (length(trim(descripcion)) between 1 and 200),
  cantidad numeric(12, 3) check (cantidad is null or cantidad >= 0),
  unidad text check (length(unidad) <= 20),
  precio_unitario numeric(12, 4) check (precio_unitario is null or precio_unitario >= 0),
  importe numeric(10, 2) not null check (importe >= 0)
);
create index facturas_lineas_factura_idx on public.facturas_lineas (factura_id);
create index facturas_lineas_organizacion_idx on public.facturas_lineas (organizacion_id, descripcion);

alter table public.facturas_lineas enable row level security;
revoke all on public.facturas_lineas from anon;

create policy "ver lineas de facturas" on public.facturas_lineas
  for select to authenticated using (privado.autorizar(organizacion_id, 'facturas.ver'));
create policy "crear lineas de facturas" on public.facturas_lineas
  for insert to authenticated with check (privado.autorizar(organizacion_id, 'facturas.editar'));
create policy "editar lineas de facturas" on public.facturas_lineas
  for update to authenticated
  using (privado.autorizar(organizacion_id, 'facturas.editar'))
  with check (privado.autorizar(organizacion_id, 'facturas.editar'));
create policy "borrar lineas de facturas" on public.facturas_lineas
  for delete to authenticated using (privado.autorizar(organizacion_id, 'facturas.editar'));

-- Registra todas las facturas de un documento de la bandeja (con sus líneas) y lo marca como
-- aprobado. p_facturas es una lista de objetos:
-- {proveedor, numero, fecha, importe, categoria, lineas: [{descripcion, cantidad, unidad, precio_unitario, importe}]}
-- Devuelve cuántas facturas se han registrado. Se ejecuta con los permisos de quien llama.
create function public.registrar_facturas(p_documento uuid, p_facturas jsonb)
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
  where id = p_documento and tipo = 'factura' and estado = 'pendiente'
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

  update public.documentos_entrantes
  set estado = 'aprobado', revisado_por = auth.uid(), revisado_en = now()
  where id = p_documento;

  return total;
end;
$$;

revoke all on function public.registrar_facturas(uuid, jsonb) from public, anon;
grant execute on function public.registrar_facturas(uuid, jsonb) to authenticated;
