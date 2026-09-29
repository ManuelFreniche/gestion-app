# Gestión

App de gestión para micronegocios: stock, gastos, facturas recibidas, ventas y márgenes,
con varios negocios y perfiles de usuario (dueño, encargado, empleado y gestoría).

## Arrancar en local

```bash
cp .env.example .env.local   # datos del proyecto Supabase de desarrollo
npm install
npm run dev
```

Abre http://localhost:3000, crea una cuenta y da de alta tu negocio.

## Estructura

- `src/app/login`: entrar y crear cuenta.
- `src/app/negocios`: tus negocios y alta de uno nuevo.
- `src/app/n/[org]`: el panel de un negocio, con los módulos que tu rol permite.
- `src/lib/negocio.ts`: carga el negocio activo y comprueba permisos.
- `supabase/migrations`: el esquema de la base de datos.
- `supabase/tests`: pruebas de aislamiento entre negocios y de permisos por rol.

Las reglas de desarrollo están en [CLAUDE.md](CLAUDE.md).
