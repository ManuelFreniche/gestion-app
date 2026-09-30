-- Cierre del día: venta y tandas completas por sabor, por local y día.
-- Usa los permisos que ya existen: ventas.ver para leer, ventas.editar para escribir
-- y inventario.editar para gestionar los sabores.

-- Para que un cierre solo pueda apuntar a un local de su mismo negocio.
alter table public.locales add constraint locales_id_organizacion_key unique (id, organizacion_id);

create table public.sabores (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones (id) on delete cascade,
  nombre text not null check (length(trim(nombre)) between 1 and 60),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  unique (id, organizacion_id)
);
create unique index sabores_nombre_idx on public.sabores (organizacion_id, lower(trim(nombre)));

create table public.cierres_diarios (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones (id) on delete cascade,
  local_id uuid not null,
  fecha date not null,
  venta numeric(10, 2) not null check (venta >= 0),
  notas text check (length(notas) <= 500),
  creado_por uuid references auth.users (id) on delete set null default auth.uid(),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  foreign key (local_id, organizacion_id) references public.locales (id, organizacion_id) on delete cascade,
  unique (local_id, fecha),
  unique (id, organizacion_id)
);
create index cierres_diarios_organizacion_fecha_idx on public.cierres_diarios (organizacion_id, fecha desc);

create table public.cierre_tandas (
  cierre_id uuid not null,
  sabor_id uuid not null,
  organizacion_id uuid not null references public.organizaciones (id) on delete cascade,
  primary key (cierre_id, sabor_id),
  foreign key (cierre_id, organizacion_id) references public.cierres_diarios (id, organizacion_id) on delete cascade,
  foreign key (sabor_id, organizacion_id) references public.sabores (id, organizacion_id) on delete cascade
);
create index cierre_tandas_organizacion_idx on public.cierre_tandas (organizacion_id);

alter table public.sabores enable row level security;
alter table public.cierres_diarios enable row level security;
alter table public.cierre_tandas enable row level security;

revoke all on public.sabores, public.cierres_diarios, public.cierre_tandas from anon;

create policy "ver sabores" on public.sabores
  for select to authenticated using (privado.es_miembro(organizacion_id));
create policy "crear sabores" on public.sabores
  for insert to authenticated with check (privado.autorizar(organizacion_id, 'inventario.editar'));
create policy "editar sabores" on public.sabores
  for update to authenticated
  using (privado.autorizar(organizacion_id, 'inventario.editar'))
  with check (privado.autorizar(organizacion_id, 'inventario.editar'));
create policy "borrar sabores" on public.sabores
  for delete to authenticated using (privado.autorizar(organizacion_id, 'inventario.editar'));

create policy "ver cierres" on public.cierres_diarios
  for select to authenticated using (privado.autorizar(organizacion_id, 'ventas.ver'));
create policy "crear cierres" on public.cierres_diarios
  for insert to authenticated with check (privado.autorizar(organizacion_id, 'ventas.editar'));
create policy "editar cierres" on public.cierres_diarios
  for update to authenticated
  using (privado.autorizar(organizacion_id, 'ventas.editar'))
  with check (privado.autorizar(organizacion_id, 'ventas.editar'));

create policy "ver tandas" on public.cierre_tandas
  for select to authenticated using (privado.autorizar(organizacion_id, 'ventas.ver'));
create policy "crear tandas" on public.cierre_tandas
  for insert to authenticated with check (privado.autorizar(organizacion_id, 'ventas.editar'));
create policy "borrar tandas" on public.cierre_tandas
  for delete to authenticated using (privado.autorizar(organizacion_id, 'ventas.editar'));

-- Guarda el cierre de un día (crea o corrige) junto con los sabores de los que
-- se ha gastado una tanda. Se ejecuta con los permisos de quien llama: manda la RLS.
create function public.guardar_cierre(
  p_organizacion uuid,
  p_local uuid,
  p_fecha date,
  p_venta numeric,
  p_sabores uuid[] default '{}',
  p_notas text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  cierre uuid;
begin
  insert into public.cierres_diarios (organizacion_id, local_id, fecha, venta, notas)
  values (p_organizacion, p_local, p_fecha, p_venta, nullif(trim(p_notas), ''))
  on conflict (local_id, fecha) do update
    set venta = excluded.venta,
        notas = excluded.notas,
        actualizado_en = now()
  returning id into cierre;

  delete from public.cierre_tandas where cierre_id = cierre;
  insert into public.cierre_tandas (cierre_id, sabor_id, organizacion_id)
  select cierre, s, p_organizacion from unnest(coalesce(p_sabores, '{}')) as s;

  return cierre;
end;
$$;

revoke all on function public.guardar_cierre(uuid, uuid, date, numeric, uuid[], text) from public, anon;
grant execute on function public.guardar_cierre(uuid, uuid, date, numeric, uuid[], text) to authenticated;
