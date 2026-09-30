-- Bandeja de revisión: documentos (tickets de cierre, y luego facturas) que entran por
-- subida o por correo y esperan a que una persona decida si se meten o no.

-- Quién puede revisar la bandeja.
insert into public.permisos_rol (rol, permiso) values
  ('dueno', 'documentos.revisar'),
  ('encargado', 'documentos.revisar');

-- El cierre guarda de dónde salió y cómo se cobró.
alter table public.cierres_diarios
  add column efectivo numeric(10, 2) check (efectivo >= 0),
  add column banco numeric(10, 2) check (banco >= 0),
  add column documento_id uuid;

create table public.documentos_entrantes (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones (id) on delete cascade,
  tipo text not null check (tipo in ('cierre', 'factura')),
  origen text not null check (origen in ('subida', 'correo')),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aprobado', 'descartado')),
  archivo_ruta text not null,
  archivo_nombre text not null check (length(archivo_nombre) <= 200),
  archivo_tipo text not null,
  -- Huella del archivo: evita meter dos veces el mismo ticket o factura.
  huella text not null,
  -- Lo que el lector ha sacado del documento (fecha, venta, efectivo, banco...).
  datos jsonb not null default '{}'::jsonb,
  asunto text,
  remitente text,
  recibido_en timestamptz not null default now(),
  subido_por uuid references auth.users (id) on delete set null default auth.uid(),
  revisado_por uuid references auth.users (id) on delete set null,
  revisado_en timestamptz,
  unique (organizacion_id, huella),
  -- Cada archivo vive dentro de la carpeta de su negocio.
  check (archivo_ruta like organizacion_id::text || '/%')
);
create index documentos_entrantes_estado_idx on public.documentos_entrantes (organizacion_id, estado, recibido_en desc);

alter table public.documentos_entrantes enable row level security;
revoke all on public.documentos_entrantes from anon;

create policy "ver documentos" on public.documentos_entrantes
  for select to authenticated using (privado.autorizar(organizacion_id, 'documentos.revisar'));
create policy "subir documentos" on public.documentos_entrantes
  for insert to authenticated with check (privado.autorizar(organizacion_id, 'facturas.subir'));
create policy "revisar documentos" on public.documentos_entrantes
  for update to authenticated
  using (privado.autorizar(organizacion_id, 'documentos.revisar'))
  with check (privado.autorizar(organizacion_id, 'documentos.revisar'));

-- Archivos: bucket privado, una carpeta por negocio (<organizacion_id>/<archivo>).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documentos', 'documentos', false, 10485760,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic']);

create policy "subir archivos de documentos" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documentos'
    and privado.autorizar(((storage.foldername(name))[1])::uuid, 'facturas.subir')
  );
create policy "ver archivos de documentos" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documentos'
    and privado.autorizar(((storage.foldername(name))[1])::uuid, 'documentos.revisar')
  );

-- Aprueba un ticket de cierre: crea o corrige el cierre del día con los datos revisados
-- y marca el documento como aprobado. Se ejecuta con los permisos de quien llama.
create function public.aprobar_cierre(
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

  insert into public.cierres_diarios (organizacion_id, local_id, fecha, venta, efectivo, banco, documento_id)
  values (org, p_local, p_fecha, p_venta, p_efectivo, p_banco, p_documento)
  on conflict (local_id, fecha) do update
    set venta = excluded.venta,
        efectivo = excluded.efectivo,
        banco = excluded.banco,
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

revoke all on function public.aprobar_cierre(uuid, uuid, date, numeric, numeric, numeric) from public, anon;
grant execute on function public.aprobar_cierre(uuid, uuid, date, numeric, numeric, numeric) to authenticated;
