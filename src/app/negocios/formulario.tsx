"use client";

import { useActionState } from "react";
import { Aviso, Boton, Campo, Etiqueta } from "@/components/ui";
import { crearNegocio, type EstadoAlta } from "./acciones";

export function FormularioNegocio({ prefijo = "" }: { prefijo?: string }) {
  const [estado, accion, enviando] = useActionState<EstadoAlta, FormData>(crearNegocio, {});

  return (
    <form action={accion} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Etiqueta htmlFor={`${prefijo}nombre`}>Nombre del negocio</Etiqueta>
        <Campo id={`${prefijo}nombre`} name="nombre" placeholder="Heladería Alpino's" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Etiqueta htmlFor={`${prefijo}local`}>Primer local</Etiqueta>
        <Campo id={`${prefijo}local`} name="local" placeholder="Principal" />
      </div>
      <Aviso>{estado.error}</Aviso>
      <Boton type="submit" disabled={enviando}>
        Crear negocio
      </Boton>
    </form>
  );
}
