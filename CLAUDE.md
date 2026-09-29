@AGENTS.md

# Gestión: app de gestión multi-negocio

SaaS para micronegocios con producción propia (heladerías, obradores, cafeterías).
Alpino's es el cliente cero: todo se prueba allí antes de venderse.
Plan completo: https://claude.ai/code/artifact/d80a599a-0894-46c1-b597-4397af2ab54d

Todo el producto (interfaz, código, tablas, commits) va en español.

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS 4. En Next 16 el
  middleware se llama `proxy` (`src/proxy.ts`). Lee `node_modules/next/dist/docs/` antes de
  usar una API que no conozcas bien.
- Supabase: Postgres con RLS, Auth, Storage. Cliente de servidor en `src/lib/supabase/server.ts`.
- Componentes base propios en `src/components/ui.tsx` con la API de shadcn/ui.

## Reglas que no se rompen

1. **Toda tabla de datos de negocio lleva `organizacion_id`** (FK a `organizaciones`, `on delete
   cascade`), RLS activado y políticas que usan `privado.es_miembro()` para leer y
   `privado.autorizar(organizacion_id, '<modulo>.<accion>')` para escribir.
2. **Quien decide los permisos es la base de datos.** La interfaz solo esconde lo que no se puede
   usar. Las páginas llaman a `exigirPermiso()` (`src/lib/negocio.ts`) para responder 404.
3. **Los permisos viven en la tabla `permisos_rol`**, formato `<modulo>.<accion>`. Un permiso nuevo
   es una migración que lo inserta para los roles que correspondan.
4. **Cada cambio de esquema es una migración nueva** en `supabase/migrations/` (nunca editar una ya
   aplicada ni tocar producción a mano). Después se regeneran los tipos en
   `src/lib/supabase/database.types.ts`.
5. **Cada tabla nueva lleva pruebas de aislamiento** en `supabase/tests/`: otro negocio no la ve ni
   la escribe, y cada rol solo hace lo que debe.
6. La app **no emite facturas ni tickets** (VeriFactu). Solo registra facturas recibidas.
7. Nada de claves secretas en el cliente. La API de Claude y las claves `service_role` solo en
   servidor.

## Roles

| Rol | Resumen |
| --- | --- |
| dueno | Todo, incluida suscripción, usuarios y ajustes |
| encargado | Todo lo operativo; sin usuarios, ajustes ni suscripción |
| empleado | Ventas, recuentos de stock y subir facturas; no ve costes ni márgenes |
| gestoria | Solo lectura de gastos y facturas, y exportación |

## Entornos

- Supabase de desarrollo: `gestion-dev` (ref `rvcgtlznholelfjdgqvf`, París). Separado del proyecto
  de Alpino's en Streamlit, que no se toca.
- Producción: se crea antes de la Fase 5.

## Comprobaciones antes de cada PR

```
npm run lint
npm run typecheck
npm test
npm run build
npm run test:db   # necesita SUPABASE_DB_URL del proyecto de desarrollo
```

## Forma de trabajar

Una rama y una funcionalidad por PR, con vista previa para probarla en el móvil antes de fusionar.
Diseño móvil primero: botones grandes, navegación abajo, una mano en el mostrador.
