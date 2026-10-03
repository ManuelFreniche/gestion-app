"use client";

import { useActionState, useState } from "react";
import { Aviso, Boton, Campo, Etiqueta } from "@/components/ui";
import { enviar, protegerAccion } from "@/lib/enviar-formulario";
import { ROLES_INVITABLES } from "@/lib/invitaciones";
import { crearInvitacionAccion, type EstadoEquipo } from "./acciones";

const crearSegura = protegerAccion(crearInvitacionAccion);

// Crea el enlace de invitación y lo enseña para copiarlo o mandarlo por el móvil (WhatsApp, correo...).
export function Invitar({ org }: { org: string }) {
  const [estado, accion, enviando] = useActionState<EstadoEquipo, FormData>(crearSegura, {});
  const [copiado, setCopiado] = useState(false);

  const copiar = async (enlace: string) => {
    try {
      await navigator.clipboard.writeText(enlace);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  };
  const compartir = (enlace: string, etiqueta: string) => {
    if (navigator.share) void navigator.share({ title: "Invitación a Gestión", text: `${etiqueta}, te invito a nuestro negocio en Gestión:`, url: enlace }).catch(() => {});
  };

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={(e) => enviar(e, accion)} className="flex flex-col gap-4">
        <input type="hidden" name="org" value={org} />
        <div className="flex flex-col gap-1.5">
          <Etiqueta htmlFor="etiqueta">¿Para quién es?</Etiqueta>
          <Campo id="etiqueta" name="etiqueta" placeholder="Marta, Gestoría López…" maxLength={80} required />
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-base font-medium">¿Qué va a poder hacer?</legend>
          {ROLES_INVITABLES.map((r, i) => (
            <label key={r.rol} className="flex items-start gap-3 rounded-xl border border-borde px-4 py-3 has-[:checked]:border-primario">
              <input type="radio" name="rol" value={r.rol} defaultChecked={i === 1} className="mt-1 size-5 accent-primario" />
              <span className="flex flex-col">
                <span className="text-base font-medium">{r.nombre}</span>
                <span className="text-sm text-texto-suave">{r.explicacion}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <Aviso>{estado.error}</Aviso>
        <Boton type="submit" className="h-14 text-base" disabled={enviando}>
          {enviando ? "Creando…" : "Crear enlace de invitación"}
        </Boton>
      </form>

      {estado.enlace && (
        <div role="status" className="flex flex-col gap-3 rounded-xl bg-fondo px-4 py-4">
          <p className="text-base font-semibold">Enlace para {estado.etiqueta}</p>
          <input
            readOnly
            value={estado.enlace}
            onFocus={(e) => e.currentTarget.select()}
            aria-label="Enlace de invitación"
            className="h-12 w-full rounded-lg border border-borde bg-white px-3 text-sm"
          />
          <div className="flex gap-2">
            <Boton variante="principal" className="h-14 flex-1 text-base" onClick={() => copiar(estado.enlace!)}>
              {copiado ? "Copiado" : "Copiar enlace"}
            </Boton>
            {typeof navigator !== "undefined" && "share" in navigator && (
              <Boton variante="secundario" className="h-14 flex-1 text-base" onClick={() => compartir(estado.enlace!, estado.etiqueta ?? "")}>
                Enviar…
              </Boton>
            )}
          </div>
          <p className="text-sm text-texto-suave">
            Solo lo verás ahora. Sirve para una persona y caduca en 7 días. Si lo pierdes, anúlalo y crea otro.
          </p>
        </div>
      )}
    </div>
  );
}
