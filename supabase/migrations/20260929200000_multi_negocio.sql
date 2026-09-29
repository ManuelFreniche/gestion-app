-- Fase 0: base multi-negocio.
-- Cada fila de negocio lleva organizacion_id y RLS decide quién la ve.
-- Las funciones de autorización viven en el esquema "privado", que no expone la API.

create schema if not exists privado;
grant usage on schema privado to authenticated;

-- Roles y permisos -----------------------------------------------------------

create type public.rol_miembro as enum ('dueno', 'encargado', 'empleado', 'gestoria');

create table public.permisos_rol (
  rol public.rol_miembro not null,
  permiso text not null,
  primary key (rol, permiso)
);

comment on table public.permisos_rol is
  'Qué puede hacer cada rol. Formato del permiso: <modulo>.<accion>, p. ej. gastos.ver';

insert into public.permisos_rol (rol, permiso) values
  -- Dueño: todo
  ('dueno', 'inventario.ver'), ('dueno', 'inventario.editar'), ('dueno', 'inventario.recuento'),
  ('dueno', 'gastos.ver'), ('dueno', 'gastos.editar'),
  ('dueno', 'facturas.ver'), ('dueno', 'facturas.editar'), ('dueno', 'facturas.subir'),
  ('dueno', 'ventas.ver'), ('dueno', 'ventas.editar'),
  ('dueno', 'margenes.ver'), ('dueno', 'margenes.editar'),
  ('dueno', 'exportar.usar'),
  ('dueno', 'locales.gestionar'), ('dueno', 'usuarios.gestionar'),
  ('dueno', 'ajustes.editar'), ('dueno', 'suscripcion.gestionar'),
  -- Encargado: todo lo operativo, sin usuarios, ajustes ni suscripción
  ('encargado', 'inventario.ver'), ('encargado', 'inventario.editar'), ('encargado', 'inventario.recuento'),
  ('encargado', 'gastos.ver'), ('encargado', 'gastos.editar'),
  ('encargado', 'facturas.ver'), ('encargado', 'facturas.editar'), ('encargado', 'facturas.subir'),
  ('encargado', 'ventas.ver'), ('encargado', 'ventas.editar'),
  ('encargado', 'margenes.ver'), ('encargado', 'margenes.editar'),
  ('encargado', 'exportar.usar'),
  -- Empleado: mostrador, sin costes ni márgenes
  ('empleado', 'inventario.ver'), ('empleado', 'inventario.recuento'),
  ('empleado', 'facturas.subir'),
  ('empleado', 'ventas.ver'), ('empleado', 'ventas.editar'),
  -- Gestoría: solo lectura de lo fiscal y exportación
  ('gestoria', 'gastos.ver'), ('gestoria', 'facturas.ver'), ('gestoria', 'exportar.usar');

-- Organizaciones, locales y miembros -----------------------------------------

create table public.organizaciones (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(trim(nombre)) between 1 and 120),
  plan text not null default 'prueba',
  creado_en timestamptz not null default now()
);

create table public.locales (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones (id) on delete cascade,
  nombre text not null check (length(trim(nombre)) between 1 and 120),
  creado_en timestamptz not null default now()
);
create index locales_organizacion_idx on public.locales (organizacion_id);

create table public.miembros (
  organizacion_id uuid not null references public.organizaciones (id) on delete cascade,
  usuario_id uuid not null references auth.users (id) on delete cascade,
  rol public.rol_miembro not null,
  creado_en timestamptz not null default now(),
  primary key (organizacion_id, usuario_id)
);
create index miembros_usuario_idx on public.miembros (usuario_id);

create table public.ajustes_organizacion (
  organizacion_id uuid primary key references public.organizaciones (id) on delete cascade,
  modulos text[] not null default array['inventario', 'gastos', 'facturas', 'ventas', 'margenes'],
  moneda text not null default 'EUR',
  zona_horaria text not null default 'Europe/Madrid',
  marca jsonb not null default '{}'::jsonb
);

create table public.perfiles (
  usuario_id uuid primary key references auth.users (id) on delete cascade,
  nombre text,
  creado_en timestamptz not null default now()
);

-- Funciones de autorización --------------------------------------------------

create function privado.es_miembro(org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.miembros m
    where m.organizacion_id = org and m.usuario_id = (select auth.uid())
  );
$$;

create function privado.autorizar(org uuid, permiso_pedido text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.miembros m
    join public.permisos_rol p on p.rol = m.rol
    where m.organizacion_id = org
      and m.usuario_id = (select auth.uid())
      and p.permiso = permiso_pedido
  );
$$;

revoke all on function privado.es_miembro(uuid) from public;
revoke all on function privado.autorizar(uuid, text) from public;
grant execute on function privado.es_miembro(uuid) to authenticated;
grant execute on function privado.autorizar(uuid, text) to authenticated;

-- RLS ------------------------------------------------------------------------

alter table public.permisos_rol enable row level security;
alter table public.organizaciones enable row level security;
alter table public.locales enable row level security;
alter table public.miembros enable row level security;
alter table public.ajustes_organizacion enable row level security;
alter table public.perfiles enable row level security;

-- Nada es visible sin sesión.
revoke all on public.permisos_rol, public.organizaciones, public.locales,
  public.miembros, public.ajustes_organizacion, public.perfiles from anon;

create policy "permisos visibles con sesión" on public.permisos_rol
  for select to authenticated using (true);

create policy "ver mis organizaciones" on public.organizaciones
  for select to authenticated using (privado.es_miembro(id));
create policy "editar organización" on public.organizaciones
  for update to authenticated
  using (privado.autorizar(id, 'ajustes.editar'))
  with check (privado.autorizar(id, 'ajustes.editar'));
-- Las organizaciones se crean con crear_organizacion(); no hay insert ni delete directos.

create policy "ver locales" on public.locales
  for select to authenticated using (privado.es_miembro(organizacion_id));
create policy "crear locales" on public.locales
  for insert to authenticated with check (privado.autorizar(organizacion_id, 'locales.gestionar'));
create policy "editar locales" on public.locales
  for update to authenticated
  using (privado.autorizar(organizacion_id, 'locales.gestionar'))
  with check (privado.autorizar(organizacion_id, 'locales.gestionar'));
create policy "borrar locales" on public.locales
  for delete to authenticated using (privado.autorizar(organizacion_id, 'locales.gestionar'));

create policy "ver miembros" on public.miembros
  for select to authenticated using (privado.es_miembro(organizacion_id));
create policy "añadir miembros" on public.miembros
  for insert to authenticated with check (privado.autorizar(organizacion_id, 'usuarios.gestionar'));
create policy "cambiar rol" on public.miembros
  for update to authenticated
  using (privado.autorizar(organizacion_id, 'usuarios.gestionar'))
  with check (privado.autorizar(organizacion_id, 'usuarios.gestionar'));
create policy "quitar miembros" on public.miembros
  for delete to authenticated using (privado.autorizar(organizacion_id, 'usuarios.gestionar'));

create policy "ver ajustes" on public.ajustes_organizacion
  for select to authenticated using (privado.es_miembro(organizacion_id));
create policy "editar ajustes" on public.ajustes_organizacion
  for update to authenticated
  using (privado.autorizar(organizacion_id, 'ajustes.editar'))
  with check (privado.autorizar(organizacion_id, 'ajustes.editar'));

create policy "ver mi perfil" on public.perfiles
  for select to authenticated using (usuario_id = (select auth.uid()));
create policy "editar mi perfil" on public.perfiles
  for update to authenticated
  using (usuario_id = (select auth.uid()))
  with check (usuario_id = (select auth.uid()));

-- Una organización nunca se queda sin dueño ----------------------------------

create function privado.proteger_ultimo_dueno()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.rol = 'dueno'
     and (tg_op = 'DELETE' or new.rol <> 'dueno')
     and exists (select 1 from public.organizaciones o where o.id = old.organizacion_id)
     and not exists (
       select 1 from public.miembros m
       where m.organizacion_id = old.organizacion_id
         and m.rol = 'dueno'
         and m.usuario_id <> old.usuario_id
     )
  then
    raise exception 'La organización debe tener al menos un dueño';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger proteger_ultimo_dueno
  before update or delete on public.miembros
  for each row execute function privado.proteger_ultimo_dueno();

-- Perfil automático al registrarse ------------------------------------------

create function privado.crear_perfil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.perfiles (usuario_id, nombre)
  values (new.id, new.raw_user_meta_data ->> 'nombre');
  return new;
end;
$$;

create trigger crear_perfil
  after insert on auth.users
  for each row execute function privado.crear_perfil();

-- API para la app ------------------------------------------------------------

-- Crea un negocio con su primer local y deja a quien lo crea como dueño.
create function public.crear_organizacion(p_nombre text, p_local text default 'Principal')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  nueva uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Hace falta iniciar sesión';
  end if;

  insert into public.organizaciones (nombre) values (trim(p_nombre)) returning id into nueva;
  insert into public.miembros (organizacion_id, usuario_id, rol) values (nueva, (select auth.uid()), 'dueno');
  insert into public.ajustes_organizacion (organizacion_id) values (nueva);
  insert into public.locales (organizacion_id, nombre) values (nueva, trim(p_local));
  return nueva;
end;
$$;

revoke all on function public.crear_organizacion(text, text) from public, anon;
grant execute on function public.crear_organizacion(text, text) to authenticated;

-- Permisos del usuario actual en una organización (vacío si no es miembro).
create function public.mis_permisos(p_organizacion uuid)
returns setof text
language sql
stable
set search_path = ''
as $$
  select p.permiso
  from public.miembros m
  join public.permisos_rol p on p.rol = m.rol
  where m.organizacion_id = p_organizacion
    and m.usuario_id = (select auth.uid());
$$;

revoke all on function public.mis_permisos(uuid) from public, anon;
grant execute on function public.mis_permisos(uuid) to authenticated;
