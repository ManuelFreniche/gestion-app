-- Aviso nocturno por Telegram: cada noche el bot pregunta por el cierre del día.
-- El bot no es una persona con sesión: escribe con la clave de servicio, así que todo lo que
-- hace queda acotado por estas tablas (un chat de Telegram <-> un local de un negocio).
-- Los usuarios solo crean el código de conexión y ven o borran la conexión de su negocio.

-- Chats de Telegram conectados a un local. Solo los crea el bot al recibir un código válido.
create table public.telegram_vinculos (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones (id) on delete cascade,
  local_id uuid not null,
  chat_id bigint not null unique,
  nombre text check (length(nombre) <= 120),
  creado_en timestamptz not null default now(),
  foreign key (local_id, organizacion_id) references public.locales (id, organizacion_id) on delete cascade
);
create index telegram_vinculos_organizacion_idx on public.telegram_vinculos (organizacion_id);

-- Código de un solo uso (caduca en 15 minutos) que se manda al bot para conectar el chat.
create table public.telegram_codigos (
  codigo text primary key check (codigo ~ '^[A-Z0-9]{10}$'),
  organizacion_id uuid not null references public.organizaciones (id) on delete cascade,
  local_id uuid not null,
  creado_por uuid references auth.users (id) on delete set null default auth.uid(),
  caduca timestamptz not null default now() + interval '15 minutes',
  foreign key (local_id, organizacion_id) references public.locales (id, organizacion_id) on delete cascade
);
create index telegram_codigos_organizacion_idx on public.telegram_codigos (organizacion_id);

-- Conversación de cada noche con un chat: en qué paso va y qué ha marcado. Solo la toca el bot.
create table public.telegram_conversaciones (
  chat_id bigint primary key references public.telegram_vinculos (chat_id) on delete cascade,
  organizacion_id uuid not null references public.organizaciones (id) on delete cascade,
  local_id uuid not null,
  fecha date not null,
  paso text not null check (paso in ('venta', 'tandas', 'hecho')),
  venta numeric(10, 2) check (venta >= 0),
  -- Sabores ofrecidos (en orden, para que los botones sean cortos) y los marcados.
  sabores jsonb not null default '[]'::jsonb,
  seleccion integer[] not null default '{}',
  actualizado_en timestamptz not null default now(),
  foreign key (local_id, organizacion_id) references public.locales (id, organizacion_id) on delete cascade
);
create index telegram_conversaciones_organizacion_idx on public.telegram_conversaciones (organizacion_id);

alter table public.telegram_vinculos enable row level security;
alter table public.telegram_codigos enable row level security;
alter table public.telegram_conversaciones enable row level security;

revoke all on public.telegram_vinculos, public.telegram_codigos, public.telegram_conversaciones from anon;
-- Sin políticas para authenticated en telegram_conversaciones: solo el bot (clave de servicio).
revoke all on public.telegram_conversaciones from authenticated;

create policy "ver conexiones de telegram" on public.telegram_vinculos
  for select to authenticated using (privado.autorizar(organizacion_id, 'ajustes.editar'));
create policy "borrar conexiones de telegram" on public.telegram_vinculos
  for delete to authenticated using (privado.autorizar(organizacion_id, 'ajustes.editar'));

create policy "crear codigos de telegram" on public.telegram_codigos
  for insert to authenticated with check (privado.autorizar(organizacion_id, 'ajustes.editar'));
