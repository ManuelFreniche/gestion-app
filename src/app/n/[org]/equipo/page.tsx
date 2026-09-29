import { Tarjeta } from "@/components/ui";
import { cargarNegocio } from "@/lib/negocio";
import { NOMBRE_ROL } from "@/lib/permisos";
import { crearClienteServidor } from "@/lib/supabase/server";

// Quién tiene acceso al negocio. Las invitaciones llegan en la Fase 4.
export default async function PaginaEquipo({ params }: PageProps<"/n/[org]/equipo">) {
  const { org } = await params;
  const negocio = await cargarNegocio(org);
  const supabase = await crearClienteServidor();
  const { data: miembros } = await supabase
    .from("miembros")
    .select("usuario_id, rol, creado_en")
    .eq("organizacion_id", org)
    .order("creado_en");

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Equipo</h1>
      <Tarjeta className="p-0">
        <ul className="divide-y divide-borde">
          {miembros?.map((m) => (
            <li key={m.usuario_id} className="flex items-center justify-between px-5 py-3">
              <span className="font-mono text-xs text-texto-suave">{m.usuario_id.slice(0, 8)}</span>
              <span className="text-sm">{NOMBRE_ROL[m.rol]}</span>
            </li>
          ))}
        </ul>
      </Tarjeta>
      {negocio.permisos.has("usuarios.gestionar") && (
        <p className="text-sm text-texto-suave">Podrás invitar a tu equipo y a tu gestoría en la Fase 4.</p>
      )}
    </div>
  );
}
