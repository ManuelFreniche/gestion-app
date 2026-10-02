"use client";

import { useState, useTransition } from "react";
import { Aviso, Boton } from "@/components/ui";
import { protegerAccion } from "@/lib/enviar-formulario";
import { releerDocumentoAccion } from "./acciones";

const releerSeguro = protegerAccion(releerDocumentoAccion);

export type Descartado = { id: string; nombre: string; tipo: string; recibido: string; descartado: string };

const TIPO: Record<string, string> = { cierre: "Cierre de caja", factura: "Factura o gasto", ingresos: "Hoja de ingresos" };

// Lo que se descartó: se puede recuperar. "Volver a leer" abre el archivo guardado con el lector actual
// y lo pone otra vez en la Bandeja, sin pasar por el correo.
export function Descartados({ org, documentos }: { org: string; documentos: Descartado[] }) {
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [progreso, setProgreso] = useState("");
  const [trabajando, empezar] = useTransition();

  if (documentos.length === 0) return null;
  const cierres = documentos.filter((d) => d.tipo === "cierre");

  const releer = async (d: Descartado) => {
    const datos = new FormData();
    datos.set("org", org);
    datos.set("documento", d.id);
    const r = await releerSeguro({}, datos);
    setErrores((e) => {
      const siguiente = { ...e };
      if (r.error) siguiente[d.id] = r.error;
      else delete siguiente[d.id];
      return siguiente;
    });
    return !r.error;
  };

  return (
    <details className="rounded-xl border border-borde px-4 py-3">
      <summary className="cursor-pointer text-base font-medium">
        Descartados recientes ({documentos.length}){cierres.length > 0 ? ` · ${cierres.length} ${cierres.length === 1 ? "cierre de caja" : "cierres de caja"}` : ""}
      </summary>
      <div className="mt-3 flex flex-col gap-3">
        <p className="text-base text-texto-suave">
          Si descartaste algo por error o salió mal leído, vuelve a leerlo: se pondrá otra vez en la Bandeja para que lo revises.
        </p>
        {cierres.length > 1 && (
          <Boton
            variante="secundario"
            className="h-14 text-base"
            disabled={trabajando}
            onClick={() =>
              empezar(async () => {
                let hechos = 0;
                for (const d of cierres) {
                  setProgreso(`Leyendo ${hechos + 1} de ${cierres.length}…`);
                  if (await releer(d)) hechos++;
                }
                setProgreso(`Listo: ${hechos} de ${cierres.length} cierres vueltos a leer. Los tienes arriba, en la Bandeja.`);
              })
            }
          >
            {trabajando ? progreso || "Leyendo…" : `Volver a leer los ${cierres.length} cierres de caja`}
          </Boton>
        )}
        {!trabajando && progreso && <p className="text-base text-texto-suave">{progreso}</p>}
        <ul className="flex flex-col gap-2">
          {documentos.map((d) => (
            <li key={d.id} className="flex flex-col gap-1 rounded-lg border border-borde px-3 py-2">
              <span className="break-words text-base font-medium">{d.nombre}</span>
              <span className="text-sm text-texto-suave">
                {TIPO[d.tipo] ?? d.tipo} · recibido {d.recibido} · descartado {d.descartado}
              </span>
              {errores[d.id] && <Aviso>{errores[d.id]}</Aviso>}
              <button type="button" disabled={trabajando} onClick={() => empezar(async () => void (await releer(d)))} className="self-start text-base underline disabled:opacity-50">
                Volver a leer
              </button>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
