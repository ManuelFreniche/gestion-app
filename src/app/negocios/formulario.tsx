"use client";

import { useActionState } from "react";
import { Aviso, Boton, Campo, Etiqueta } from "@/components/ui";
import { crearNegocio, type EstadoAlta } from "./acciones";

export function FormularioNegocio() {
  const [estado, accion, enviando] = useActionState<EstadoAlta, FormData>(crearNegocio, {});

  return (
    <form action={accion} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Etiqueta htmlFor="nombre">Nombre del negocio</Etiqueta>
        <Campo id="nombre" name="nombre" placeholder="Heladería Alpino's" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Etiqueta htmlFor="local">Primer local</Etiqueta>
        <Campo id="local" name="local" placeholder="Principal" />
      </div>
      <Aviso>{estado.error}</Aviso>
      <Boton type="submit" disabled={enviando}>
        Crear negocio
      </Boton>
    </form>
  );
}
