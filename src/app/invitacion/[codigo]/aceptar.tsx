"use client";

import { useActionState } from "react";
import { Aviso, Boton } from "@/components/ui";
import { enviar, protegerAccion } from "@/lib/enviar-formulario";
import { aceptarInvitacionAccion, type EstadoAceptar } from "./acciones";

const aceptarSeguro = protegerAccion(aceptarInvitacionAccion);

export function Aceptar({ codigo }: { codigo: string }) {
  const [estado, accion, enviando] = useActionState<EstadoAceptar, FormData>(aceptarSeguro, {});
  return (
    <form onSubmit={(e) => enviar(e, accion)} className="flex flex-col gap-4">
      <input type="hidden" name="codigo" value={codigo} />
      <Aviso>{estado.error}</Aviso>
      <Boton type="submit" className="h-14 text-base" disabled={enviando}>
        {enviando ? "Entrando…" : "Aceptar invitación"}
      </Boton>
    </form>
  );
}
