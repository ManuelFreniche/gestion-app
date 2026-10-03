-- Invitar al equipo y a la gestoría con un enlace de un solo uso.
--
-- El dueño crea una invitación (rol + nombre de referencia) y la app le da un enlace para mandarlo por el
-- medio que quiera (WhatsApp, correo...). Quien lo abre inicia sesión o crea su cuenta y queda dentro del
-- negocio con ese rol. La base de datos solo guarda un resumen irreversible (hash) del código: nadie, ni
-- siquiera con acceso a la tabla, puede reconstruir un enlace.

create table public.invitaciones (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones (id) on delete cascade,
  -- Para qué persona es (solo para reconocerla en la lista): «Marta», «Gestoría López»...
  etiqueta text not null check (length(trim(etiqueta)) between 1 and 80),
  -- Nunca se invita a un dueño: el negocio solo tiene el dueño que lo creó.
  rol public.rol_miembro not null check (rol <> 'dueno'),
  codigo_hash text not null unique check (length(codigo_hash) = 64),
  creada_por uuid references auth.users (id) on delete set null,
  creada_en timestamptz not null default now(),
  caduca_en timestamptz not null default now() + interval '7 days',
  usada_en timestamptz,
  usada_por uuid references auth.users (id) on delete set null
);
create index invitaciones_organizacion_idx on public.invitaciones (organizacion_id, creada_en desc);

alter table public.invitaciones enable row level security;
revoke all on public.invitaciones from anon;

create policy "ver invitaciones" on public.invitaciones
  for select to authenticated using (privado.autorizar(organizacion_id, 'usuarios.gestionar'));
create policy "crear invitaciones" on public.invitaciones
  for insert to authenticated with check (privado.autorizar(organizacion_id, 'usuarios.gestionar'));
create policy "anular invitaciones" on public.invitaciones
  for delete to authenticated using (privado.autorizar(organizacion_id, 'usuarios.gestionar'));

-- Quien abre el enlace acepta la invitación: queda como miembro con el rol de la invitación y el enlace deja
-- de valer. Si ya era miembro de ese negocio no cambia su rol (no se baja a nadie de categoría por error).
-- Devuelve el negocio al que ha entrado. Los errores son para la persona: se enseñan tal cual.
create function public.aceptar_invitacion(p_codigo text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
  inv public.invitaciones%rowtype;
begin
  if usuario is null then
    raise exception 'Hace falta iniciar sesión';
  end if;

  select * into inv
  from public.invitaciones
  where codigo_hash = encode(sha256(convert_to(coalesce(p_codigo, ''), 'UTF8')), 'hex')
  for update;

  if not found or inv.usada_en is not null or inv.caduca_en < now() then
    raise exception 'Esta invitación ya no vale (se usó o caducó). Pide otra a quien te invitó.';
  end if;

  insert into public.miembros (organizacion_id, usuario_id, rol)
  values (inv.organizacion_id, usuario, inv.rol)
  on conflict (organizacion_id, usuario_id) do nothing;

  update public.invitaciones set usada_en = now(), usada_por = usuario where id = inv.id;
  return inv.organizacion_id;
end;
$$;

revoke all on function public.aceptar_invitacion(text) from public, anon;
grant execute on function public.aceptar_invitacion(text) to authenticated;

-- Quién forma parte del negocio, con nombre. Cualquier miembro ve nombre y rol; el correo solo lo ve quien
-- gestiona usuarios. Quien no es miembro no recibe nada.
create function public.equipo_del_negocio(p_organizacion uuid)
returns table (usuario_id uuid, nombre text, correo text, rol public.rol_miembro, creado_en timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select m.usuario_id,
         p.nombre,
         case when privado.autorizar(p_organizacion, 'usuarios.gestionar') then u.email end,
         m.rol,
         m.creado_en
  from public.miembros m
  left join public.perfiles p on p.usuario_id = m.usuario_id
  left join auth.users u on u.id = m.usuario_id
  where m.organizacion_id = p_organizacion
    and privado.es_miembro(p_organizacion)
  order by m.creado_en;
$$;

revoke all on function public.equipo_del_negocio(uuid) from public, anon;
grant execute on function public.equipo_del_negocio(uuid) to authenticated;
