import { Tarjeta } from "@/components/ui";
import { estadoInvitacion } from "@/lib/invitaciones";
import { cargarNegocio } from "@/lib/negocio";
import { NOMBRE_ROL } from "@/lib/permisos";
import { crearClienteServidor } from "@/lib/supabase/server";
import { AnularInvitacion, QuitarMiembro } from "./botones-equipo";
import { Invitar } from "./invitar";

const dia = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long" });

// Quién tiene acceso al negocio y, para el dueño, a quién invitar. Quién puede qué lo decide la base de datos:
// aquí solo se esconde lo que no se puede usar.
export default async function PaginaEquipo({ params }: PageProps<"/n/[org]/equipo">) {
  const { org } = await params;
  const negocio = await cargarNegocio(org);
  const gestiona = negocio.permisos.has("usuarios.gestionar");
  const supabase = await crearClienteServidor();
  const { data: claims } = await supabase.auth.getClaims();
  const yo = claims?.claims.sub;

  const [equipo, invitaciones] = await Promise.all([
    supabase.rpc("equipo_del_negocio", { p_organizacion: org }),
    gestiona
      ? supabase.from("invitaciones").select("id, etiqueta, rol, caduca_en, usada_en").eq("organizacion_id", org).is("usada_en", null).order("creada_en", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);
  const ahora = new Date();

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <h1 className="text-3xl font-bold">Equipo</h1>

      <ul className="flex flex-col gap-3">
        {(equipo.data ?? []).map((m) => {
          const nombre = m.nombre?.trim() || m.correo || "Sin nombre";
          return (
            <li key={m.usuario_id}>
              <Tarjeta className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="break-words text-lg font-semibold">
                    {nombre}
                    {m.usuario_id === yo && <span className="font-normal text-texto-suave"> (tú)</span>}
                  </span>
                  <span className="shrink-0 text-base text-texto-suave">{NOMBRE_ROL[m.rol]}</span>
                </div>
                {m.correo && m.nombre?.trim() && <span className="break-words text-sm text-texto-suave">{m.correo}</span>}
                {gestiona && m.usuario_id !== yo && <QuitarMiembro org={org} usuario={m.usuario_id} nombre={nombre} />}
              </Tarjeta>
            </li>
          );
        })}
      </ul>

      {gestiona && (
        <>
          <h2 className="text-2xl font-bold">Invitar</h2>
          <Tarjeta>
            <Invitar org={org} />
          </Tarjeta>

          {(invitaciones.data ?? []).length > 0 && (
            <>
              <h2 className="text-xl font-bold">Invitaciones sin usar</h2>
              <ul className="flex flex-col gap-3">
                {(invitaciones.data ?? []).map((inv) => {
                  const estado = estadoInvitacion(inv, ahora);
                  return (
                    <li key={inv.id}>
                      <Tarjeta className="flex flex-col gap-2">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="break-words text-lg font-semibold">{inv.etiqueta}</span>
                          <span className="shrink-0 text-base text-texto-suave">{NOMBRE_ROL[inv.rol]}</span>
                        </div>
                        <span className={`text-sm ${estado === "caducada" ? "text-peligro" : "text-texto-suave"}`}>
                          {estado === "caducada" ? "Caducada" : `Vale hasta el ${dia.format(new Date(inv.caduca_en))}`}
                        </span>
                        <AnularInvitacion org={org} invitacion={inv.id} />
                      </Tarjeta>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  );
}
