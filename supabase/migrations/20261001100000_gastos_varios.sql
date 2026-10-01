-- Gastos que no llegan con factura de proveedor (alquiler, nóminas, una compra en efectivo...).
-- Los gastos con factura ya están en facturas_recibidas: el módulo Gastos suma las dos cosas.
-- Usa los permisos que ya existen: gastos.ver para leer y gastos.editar para escribir.

create table public.gastos_varios (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones (id) on delete cascade,
  fecha date not null,
  concepto text not null check (length(trim(concepto)) between 1 and 120),
  categoria text not null default 'Otros'
    check (categoria in ('Materia prima', 'Suministros', 'Alquiler', 'Nóminas', 'Otros')),
  importe numeric(10, 2) not null check (importe > 0),
  creado_por uuid references auth.users (id) on delete set null default auth.uid(),
  creado_en timestamptz not null default now()
);
create index gastos_varios_organizacion_fecha_idx on public.gastos_varios (organizacion_id, fecha desc);

alter table public.gastos_varios enable row level security;
revoke all on public.gastos_varios from anon;

create policy "ver gastos" on public.gastos_varios
  for select to authenticated using (privado.autorizar(organizacion_id, 'gastos.ver'));
create policy "crear gastos" on public.gastos_varios
  for insert to authenticated with check (privado.autorizar(organizacion_id, 'gastos.editar'));
create policy "editar gastos" on public.gastos_varios
  for update to authenticated
  using (privado.autorizar(organizacion_id, 'gastos.editar'))
  with check (privado.autorizar(organizacion_id, 'gastos.editar'));
create policy "borrar gastos" on public.gastos_varios
  for delete to authenticated using (privado.autorizar(organizacion_id, 'gastos.editar'));
