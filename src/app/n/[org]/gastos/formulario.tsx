"use client";

import { useActionState, useRef } from "react";
import { Aviso, Boton, Campo, Etiqueta } from "@/components/ui";
import { CATEGORIAS } from "@/lib/factura";
import { apuntarGasto, borrarGasto, type EstadoGasto } from "./acciones";

export function FormularioGasto({ org, hoy }: { org: string; hoy: string }) {
  const formulario = useRef<HTMLFormElement>(null);
  const [estado, accion, enviando] = useActionState<EstadoGasto, FormData>(async (previo, datos) => {
    const resultado = await apuntarGasto(previo, datos);
    if (resultado.guardado) formulario.current?.reset();
    return resultado;
  }, {});

  return (
    <form ref={formulario} action={accion} className="flex flex-col gap-4">
      <input type="hidden" name="org" value={org} />
      <div className="flex flex-col gap-1.5">
        <Etiqueta htmlFor="concepto" className="text-base">¿En qué ha sido?</Etiqueta>
        <Campo id="concepto" name="concepto" maxLength={120} placeholder="Alquiler, nóminas, gasolina…" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Etiqueta htmlFor="importe" className="text-base">¿Cuánto?</Etiqueta>
        <div className="flex items-center gap-2">
          <Campo id="importe" name="importe" inputMode="decimal" autoComplete="off" placeholder="0,00" className="h-14 text-2xl font-semibold" required />
          <span className="text-2xl font-semibold">€</span>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Etiqueta htmlFor="categoria" className="text-base">Categoría</Etiqueta>
        <select
          id="categoria"
          name="categoria"
          defaultValue="Otros"
          className="h-11 w-full rounded-lg border border-borde bg-superficie px-3 text-base outline-none focus:ring-2 focus:ring-primario/40"
        >
          {CATEGORIAS.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Etiqueta htmlFor="fecha" className="text-base">Día</Etiqueta>
        <Campo id="fecha" name="fecha" type="date" defaultValue={hoy} max={hoy} required />
      </div>
      <Aviso>{estado.error}</Aviso>
      {estado.guardado && (
        <p role="status" className="rounded-lg bg-primario/10 px-3 py-2 text-sm">Gasto apuntado.</p>
      )}
      <Boton type="submit" disabled={enviando} className="h-14 text-base">
        {enviando ? "Guardando…" : "Apuntar gasto"}
      </Boton>
    </form>
  );
}

export function BotonBorrarGasto({ org, gasto }: { org: string; gasto: string }) {
  return (
    <form
      action={borrarGasto}
      onSubmit={(e) => {
        if (!confirm("¿Borrar este gasto? No se puede deshacer.")) e.preventDefault();
      }}
    >
      <input type="hidden" name="org" value={org} />
      <input type="hidden" name="gasto" value={gasto} />
      <button type="submit" className="text-sm text-peligro underline">Borrar</button>
    </form>
  );
}
