"use client";

import { useState, useTransition } from "react";
import { Aviso, Boton } from "@/components/ui";
import { protegerAccion } from "@/lib/enviar-formulario";
import { descartarRepetidosAccion } from "./acciones";

const descartarSeguro = protegerAccion(descartarRepetidosAccion);

// Quita de «Por revisar» lo que está repetido (misma factura o mismo cierre que otro), conservando el primero.
export function DescartarRepetidos({ org }: { org: string }) {
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const [trabajando, empezar] = useTransition();

  return (
    <div className="flex flex-col gap-2">
      <Boton
        variante="secundario"
        className="h-14 text-base"
        disabled={trabajando}
        onClick={() =>
          empezar(async () => {
            const datos = new FormData();
            datos.set("org", org);
            const r = await descartarSeguro({}, datos);
            setError(r.error ?? "");
            setMensaje("mensaje" in r && r.mensaje ? r.mensaje : "");
          })
        }
      >
        {trabajando ? "Buscando repetidos…" : "Descartar repetidos"}
      </Boton>
      {error && <Aviso>{error}</Aviso>}
      {mensaje && (
        <p role="status" className="rounded-lg bg-fondo px-3 py-2 text-base font-medium">
          {mensaje}
        </p>
      )}
    </div>
  );
}
