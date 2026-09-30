import Link from "next/link";
import { cargarNegocio } from "@/lib/negocio";
import { modulosVisibles, NOMBRE_ROL } from "@/lib/permisos";
import { crearClienteServidor } from "@/lib/supabase/server";
import { MenuNegocios } from "@/app/negocios/menu";

// Marco común de un negocio: cabecera y navegación con solo los módulos que el rol permite.
// En el móvil la navegación va abajo, al alcance del pulgar.
export default async function LayoutNegocio({ children, params }: LayoutProps<"/n/[org]">) {
  const { org } = await params;
  const negocio = await cargarNegocio(org);
  const supabase = await crearClienteServidor();
  const { data: filas } = await supabase.from("organizaciones").select("id, nombre").order("nombre");
  const negocios = filas ?? [];
  const modulos = modulosVisibles(negocio.permisos, negocio.modulosActivos);
  const enlaces = [
    { href: `/n/${org}`, nombre: "Inicio" },
    ...modulos.map((m) => ({ href: `/n/${org}/${m.clave}`, nombre: m.nombre })),
    { href: `/n/${org}/equipo`, nombre: "Equipo" },
  ];

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <aside className="hidden w-56 shrink-0 flex-col gap-1 border-r border-borde bg-superficie p-4 md:flex">
        <Link href="/negocios?todos=1" className="mb-2 rounded-lg px-3 py-2 text-sm hover:bg-fondo">
          ← Mis negocios
        </Link>
        <MenuNegocios actual={org} negocios={negocios} prefijo="escritorio-" />
        <Link href={`/n/${org}`} className="mt-3 truncate font-semibold">
          {negocio.nombre}
        </Link>
        <p className="mb-4 text-xs text-texto-suave">{NOMBRE_ROL[negocio.rol]}</p>
        {enlaces.map((e) => (
          <Link key={e.href} href={e.href} className="rounded-lg px-3 py-2 text-sm hover:bg-fondo">
            {e.nombre}
          </Link>
        ))}
      </aside>

      <header className="flex items-center justify-between border-b border-borde bg-superficie px-4 py-3 md:hidden">
        <div className="flex min-w-0 items-center gap-1">
          <Link href="/negocios?todos=1" aria-label="Mis negocios" className="rounded-lg px-3 py-2 text-lg hover:bg-fondo">
            ←
          </Link>
          <Link href={`/n/${org}`} className="min-w-0 truncate font-semibold">
            {negocio.nombre}
          </Link>
        </div>
        <MenuNegocios actual={org} negocios={negocios} prefijo="movil-" />
      </header>

      <main className="flex-1 p-4 pb-24 md:p-8">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 flex gap-1 overflow-x-auto border-t border-borde bg-superficie px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:hidden">
        {enlaces.map((e) => (
          <Link
            key={e.href}
            href={e.href}
            className="shrink-0 rounded-lg px-3 py-2 text-sm whitespace-nowrap hover:bg-fondo"
          >
            {e.nombre}
          </Link>
        ))}
      </nav>
    </div>
  );
}
