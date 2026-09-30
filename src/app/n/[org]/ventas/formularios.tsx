"use client";

import { useActionState } from "react";
import { Aviso, Boton, Campo, Etiqueta } from "@/components/ui";
import { anadirSabores, guardarCierre, type EstadoCierre } from "./acciones";

type Sabor = { id: string; nombre: string };

export function FormularioCierre({
  org,
  local,
  fecha,
  sabores,
  ventaInicial,
  saboresIniciales,
}: {
  org: string;
  local: string;
  fecha: string;
  sabores: Sabor[];
  ventaInicial?: number;
  saboresIniciales: string[];
}) {
  const [estado, accion, enviando] = useActionState<EstadoCierre, FormData>(guardarCierre, {});

  return (
    <form action={accion} className="flex flex-col gap-6">
      <input type="hidden" name="org" value={org} />
      <input type="hidden" name="local" value={local} />
      <input type="hidden" name="fecha" value={fecha} />

      <div className="flex flex-col gap-2">
        <Etiqueta htmlFor="venta" className="text-lg">
          ¿Cuánto habéis vendido?
        </Etiqueta>
        <div className="flex items-center gap-2">
          <Campo
            id="venta"
            name="venta"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0,00"
            defaultValue={ventaInicial?.toString().replace(".", ",")}
            className="h-16 text-3xl font-semibold"
            required
          />
          <span className="text-3xl font-semibold">€</span>
        </div>
      </div>

      {sabores.length > 0 && (
        <fieldset className="flex flex-col gap-3">
          <legend className="text-lg font-medium">¿Se ha acabado alguna tanda completa?</legend>
          <p className="text-sm text-texto-suave">Toca los sabores que sí. Si ninguno, déjalo así.</p>
          <div className="flex flex-wrap gap-2">
            {sabores.map((sabor) => (
              <label key={sabor.id} className="cursor-pointer">
                <input
                  type="checkbox"
                  name="sabores"
                  value={sabor.id}
                  defaultChecked={saboresIniciales.includes(sabor.id)}
                  className="peer sr-only"
                />
                <span className="inline-flex h-12 items-center rounded-full border border-borde bg-superficie px-5 text-base peer-checked:border-primario peer-checked:bg-primario peer-checked:text-primario-texto peer-focus-visible:ring-2 peer-focus-visible:ring-primario/40">
                  {sabor.nombre}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <Aviso>{estado.error}</Aviso>
      {estado.guardado && (
        <p role="status" className="rounded-lg bg-primario/10 px-3 py-2 text-sm">
          Cierre guardado. ¡Buen trabajo!
        </p>
      )}
      <Boton type="submit" disabled={enviando} className="h-14 text-base">
        {enviando ? "Guardando…" : "Guardar cierre"}
      </Boton>
    </form>
  );
}

export function FormularioSabores({ org }: { org: string }) {
  const [estado, accion, enviando] = useActionState<EstadoCierre, FormData>(anadirSabores, {});

  return (
    <form action={accion} className="flex flex-col gap-3">
      <input type="hidden" name="org" value={org} />
      <Etiqueta htmlFor="sabores-nuevos">Escribe tus sabores, separados por comas</Etiqueta>
      <Campo id="sabores-nuevos" name="sabores" placeholder="Fresa, Chocolate, Limón" required />
      <Aviso>{estado.error}</Aviso>
      <Boton type="submit" disabled={enviando}>
        Añadir sabores
      </Boton>
    </form>
  );
}
