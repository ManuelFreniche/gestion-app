-- Facturas recibidas de proveedores. La app no emite facturas: solo registra las que llegan.
-- Usa los permisos que ya existen: facturas.ver para leer y facturas.editar para escribir.
-- Las facturas entran por la bandeja (documentos_entrantes con tipo 'factura') y una persona
-- con documentos.revisar decide cuáles se meten.

create table public.facturas_recibidas (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones (id) on delete cascade,
  proveedor text not null check (length(trim(proveedor)) between 1 and 120),
  numero text check (length(numero) <= 60),
  fecha date not null,
  importe numeric(10, 2) not null check (importe >= 0),
  categoria text not null default 'Otros'
    check (categoria in ('Materia prima', 'Suministros', 'Alquiler', 'Nóminas', 'Otros')),
  estado_pago text not null default 'pendiente' check (estado_pago in ('pendiente', 'pagada')),
  documento_id uuid references public.documentos_entrantes (id) on delete set null,
  creado_por uuid references auth.users (id) on delete set null default auth.uid(),
  creado_en timestamptz not null default now()
);
create index facturas_recibidas_organizacion_fecha_idx on public.facturas_recibidas (organizacion_id, fecha desc);
-- Un documento solo puede dar lugar a una factura.
create unique index facturas_recibidas_documento_idx on public.facturas_recibidas (documento_id)
  where documento_id is not null;

alter table public.facturas_recibidas enable row level security;
revoke all on public.facturas_recibidas from anon;

create policy "ver facturas" on public.facturas_recibidas
  for select to authenticated using (privado.autorizar(organizacion_id, 'facturas.ver'));
create policy "crear facturas" on public.facturas_recibidas
  for insert to authenticated with check (privado.autorizar(organizacion_id, 'facturas.editar'));
create policy "editar facturas" on public.facturas_recibidas
  for update to authenticated
  using (privado.autorizar(organizacion_id, 'facturas.editar'))
  with check (privado.autorizar(organizacion_id, 'facturas.editar'));
create policy "borrar facturas" on public.facturas_recibidas
  for delete to authenticated using (privado.autorizar(organizacion_id, 'facturas.editar'));

-- Aprueba una factura de la bandeja: la registra con los datos revisados y marca el
-- documento como aprobado. Se ejecuta con los permisos de quien llama.
create function public.aprobar_factura(
  p_documento uuid,
  p_proveedor text,
  p_fecha date,
  p_importe numeric,
  p_categoria text default 'Otros',
  p_numero text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  org uuid;
  factura uuid;
begin
  select organizacion_id into org
  from public.documentos_entrantes
  where id = p_documento and tipo = 'factura' and estado = 'pendiente'
  for update;

  if org is null then
    raise exception 'El documento no existe o ya se revisó' using errcode = 'P0002';
  end if;

  insert into public.facturas_recibidas (organizacion_id, proveedor, numero, fecha, importe, categoria, documento_id)
  values (org, trim(p_proveedor), nullif(trim(p_numero), ''), p_fecha, p_importe, p_categoria, p_documento)
  returning id into factura;

  update public.documentos_entrantes
  set estado = 'aprobado',
      revisado_por = auth.uid(),
      revisado_en = now(),
      datos = datos || jsonb_build_object('proveedor', trim(p_proveedor), 'fecha', p_fecha, 'importe', p_importe)
  where id = p_documento;

  return factura;
end;
$$;

revoke all on function public.aprobar_factura(uuid, text, date, numeric, text, text) from public, anon;
grant execute on function public.aprobar_factura(uuid, text, date, numeric, text, text) to authenticated;
