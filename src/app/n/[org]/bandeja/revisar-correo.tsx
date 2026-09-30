"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Boton, Campo, Etiqueta } from "@/components/ui";
import type { ResultadoCorreo } from "@/lib/correo";

// Cada cuánto se revisa solo el correo al abrir la Bandeja.
const ENTRE_REVISIONES_MS = 10 * 60 * 1000;
const VUELTAS_MAX = 6;
const VUELTAS_MAX_TRAMO = 25;

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export function RevisarCorreo({ org, hoy }: { org: string; hoy: string }) {
  const router = useRouter();
  const [estado, setEstado] = useState<"reposo" | "revisando">("reposo");
  const [mensaje, setMensaje] = useState("");
  const [fallo, setFallo] = useState(false);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState(hoy);
  const enMarcha = useRef(false);

  const revisar = useCallback(
    async (tramo?: { desde: string; hasta: string }) => {
      if (enMarcha.current) return;
      enMarcha.current = true;
      setEstado("revisando");
      setFallo(false);
      setMensaje(tramo ? "Buscando facturas en ese tramo de tu correo…" : "Buscando facturas nuevas en tu correo…");
      let nuevos = 0;
      let sinLeer = 0;
      let antesDe: number | undefined;
      try {
        for (let vuelta = 0; vuelta < (tramo ? VUELTAS_MAX_TRAMO : VUELTAS_MAX); vuelta++) {
          const respuesta = await fetch("/api/correo", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ org, ...tramo, antesDe }),
          });
          const r = (await respuesta.json()) as ResultadoCorreo;
          if (r.error) {
            setFallo(true);
            setMensaje(r.error);
            return;
          }
          nuevos += r.nuevos;
          sinLeer += r.sinLeer;
          router.refresh();
          if (r.quedan === 0 || !r.cursor) break;
          antesDe = r.cursor;
          setMensaje(`Leyendo el correo… ${plural(nuevos, "documento nuevo", "documentos nuevos")} hasta ahora.`);
        }
        if (!tramo) {
          try {
            sessionStorage.setItem(`correo-${org}`, String(Date.now()));
          } catch {
            // Sin almacenamiento, se revisará en la próxima visita.
          }
        }
        setMensaje(
          (nuevos > 0
            ? `Correo revisado: ${plural(nuevos, "documento nuevo", "documentos nuevos")} por revisar aquí abajo.`
            : tramo
              ? "Correo revisado: no hay facturas nuevas en ese tramo."
              : "Correo revisado: no hay facturas nuevas.") +
            (sinLeer > 0 ? ` ${plural(sinLeer, "adjunto no se pudo leer", "adjuntos no se pudieron leer")}; se reintentará.` : ""),
        );
      } catch {
        setFallo(true);
        setMensaje("No se pudo revisar el correo. Comprueba la conexión e inténtalo de nuevo.");
      } finally {
        enMarcha.current = false;
        setEstado("reposo");
      }
    },
    [org, router],
  );

  useEffect(() => {
    let ultima = 0;
    try {
      ultima = Number(sessionStorage.getItem(`correo-${org}`)) || 0;
    } catch {
      // Sin almacenamiento: se revisa siempre al abrir.
    }
    if (Date.now() - ultima <= ENTRE_REVISIONES_MS) return;
    const temporizador = setTimeout(() => void revisar(), 0);
    return () => clearTimeout(temporizador);
  }, [org, revisar]);

  const tramoOk = Boolean(desde) && Boolean(hasta) && desde <= hasta;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-bold">Correo</h2>
        <p aria-live="polite" className={`text-base ${fallo ? "text-peligro" : "text-texto-suave"}`}>
          {mensaje || "Las facturas que lleguen a tu correo aparecerán aquí."}
        </p>
      </div>
      <Boton variante="secundario" className="h-14 text-base" disabled={estado === "revisando"} onClick={() => void revisar()}>
        {estado === "revisando" ? "Revisando…" : "Revisar correo ahora"}
      </Boton>
      <details className="rounded-lg border border-borde px-4 py-3">
        <summary className="cursor-pointer text-base font-medium">Buscar facturas entre dos fechas</summary>
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-base text-texto-suave">
            Trae a la Bandeja las facturas de los correos recibidos en ese tramo (los que ya revisé antes no se repiten).
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <Etiqueta htmlFor="correo-desde">Desde</Etiqueta>
              <Campo id="correo-desde" type="date" value={desde} max={hoy} onChange={(e) => setDesde(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <Etiqueta htmlFor="correo-hasta">Hasta</Etiqueta>
              <Campo id="correo-hasta" type="date" value={hasta} max={hoy} onChange={(e) => setHasta(e.target.value)} />
            </div>
          </div>
          <Boton className="h-14 text-base" disabled={estado === "revisando" || !tramoOk} onClick={() => void revisar({ desde, hasta })}>
            Buscar en ese tramo
          </Boton>
        </div>
      </details>
    </div>
  );
}
