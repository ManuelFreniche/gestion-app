"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Boton, Campo, Etiqueta } from "@/components/ui";
import type { DetalleCorreo, ResultadoCorreo } from "@/lib/correo";
import { acumuladoVacio, resumenCorreo, sumarVuelta } from "@/lib/resumen-correo";
import { tramosRapidos } from "@/lib/tramos-rapidos";

// Cada cuánto se revisa solo el correo al abrir la Bandeja.
const ENTRE_REVISIONES_MS = 10 * 60 * 1000;
const VUELTAS_MAX = 6;
const VUELTAS_MAX_TRAMO = 25;

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

// Revisiones en marcha en esta pestaña, por negocio: si la persona sale de la Bandeja y vuelve mientras el
// servidor sigue leyendo, no se lanza otra revisión encima de la primera.
const enMarchaPorNegocio = new Set<string>();
// Dónde se quedó la última revisión incompleta (por negocio y búsqueda): "pulsa otra vez" sigue desde ahí.
const dondeSeQuedo = new Map<string, number>();

const ICONO: Record<DetalleCorreo["resultado"], string> = { nuevo: "✓", repetido: "=", fallo: "⚠", omitido: "–" };

// Pide una vuelta al servidor y siempre devuelve algo que se pueda contar: aunque el servidor se corte
// o conteste otra cosa, el motivo llega a la pantalla.
async function pedirVuelta(cuerpo: Record<string, unknown>): Promise<{ resultado?: ResultadoCorreo; fallo?: string }> {
  let respuesta: Response;
  try {
    respuesta = await fetch("/api/correo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cuerpo) });
  } catch {
    return { fallo: "No hay conexión con el servidor. Comprueba tu internet e inténtalo de nuevo." };
  }
  const texto = await respuesta.text().catch(() => "");
  try {
    return { resultado: JSON.parse(texto) as ResultadoCorreo };
  } catch {
    return {
      fallo:
        respuesta.status === 504 || respuesta.status === 408
          ? "El servidor tardó demasiado en contestar (504). Pulsa otra vez: sigue por donde se quedó."
          : `El servidor contestó algo inesperado (código ${respuesta.status}). Pulsa otra vez.`,
    };
  }
}

export function RevisarCorreo({ org, hoy }: { org: string; hoy: string }) {
  const router = useRouter();
  const [estado, setEstado] = useState<"reposo" | "revisando">("reposo");
  const [mensaje, setMensaje] = useState("");
  const [fallo, setFallo] = useState(false);
  const [detalle, setDetalle] = useState<DetalleCorreo[]>([]);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState(hoy);
  const revisar = useCallback(
    async (tramo?: { desde: string; hasta: string }) => {
      if (enMarchaPorNegocio.has(org)) return;
      enMarchaPorNegocio.add(org);
      const busqueda = `${org}|${tramo ? `${tramo.desde}|${tramo.hasta}` : "reciente"}`;
      setEstado("revisando");
      setFallo(false);
      setDetalle([]);
      setMensaje(tramo ? "Buscando facturas y cierres en ese tramo de tu correo…" : "Buscando documentos nuevos en tu correo…");
      let acumulado = acumuladoVacio();
      let antesDe: number | undefined = dondeSeQuedo.get(busqueda);
      let error: string | undefined;
      let quedan = 0;
      let cursor: number | undefined;
      try {
        for (let vuelta = 0; vuelta < (tramo ? VUELTAS_MAX_TRAMO : VUELTAS_MAX); vuelta++) {
          const { resultado: r, fallo: caida } = await pedirVuelta({ org, ...tramo, antesDe });
          if (!r) {
            error = caida;
            break;
          }
          acumulado = sumarVuelta(acumulado, r);
          quedan = r.quedan;
          cursor = r.cursor;
          if (r.error) {
            error = r.error;
            break;
          }
          router.refresh();
          if (r.quedan === 0 || !r.cursor) break;
          antesDe = r.cursor;
          setMensaje(`Leyendo el correo… ${plural(acumulado.nuevos, "documento nuevo", "documentos nuevos")} hasta ahora.`);
        }
        if (acumulado.nuevos > 0 || acumulado.repetidos > 0) router.refresh();
        if (!tramo && !error) {
          try {
            sessionStorage.setItem(`correo-${org}`, String(Date.now()));
          } catch {
            // Sin almacenamiento, se revisará en la próxima visita.
          }
        }
        // Si no ha dado tiempo a todo, la próxima pulsación sigue por donde se quedó; si se terminó, empieza de nuevo.
        if (quedan > 0 && cursor) dondeSeQuedo.set(busqueda, cursor);
        else dondeSeQuedo.delete(busqueda);
        setDetalle(acumulado.detalle);
        setFallo(Boolean(error));
        const faltan = quedan > 0 ? ` Aún quedan ${plural(quedan, "correo", "correos")} por mirar: pulsa otra vez para seguir donde se quedó.` : "";
        setMensaje(error ? `${error}${acumulado.nuevos > 0 ? ` Antes de fallar llegaron ${plural(acumulado.nuevos, "documento nuevo", "documentos nuevos")} a la Bandeja.` : ""}` : `${resumenCorreo(acumulado, tramo)}${faltan}`);
      } catch {
        setFallo(true);
        setMensaje("No se pudo revisar el correo. Comprueba la conexión e inténtalo de nuevo.");
      } finally {
        enMarchaPorNegocio.delete(org);
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
          {mensaje || "Los cierres de caja y las facturas que lleguen a tu correo aparecerán aquí."}
        </p>
        {detalle.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-texto-suave underline">Ver qué pasó con cada correo ({detalle.length})</summary>
            <ul className="mt-2 flex flex-col gap-2">
              {detalle.map((d, i) => (
                <li key={i} className={d.resultado === "fallo" ? "text-peligro" : "text-texto-suave"}>
                  <span className="font-semibold">
                    {ICONO[d.resultado]} {d.correo}
                  </span>
                  {d.archivo ? ` · ${d.archivo}` : ""}
                  {d.nota ? <span className="block">{d.nota}</span> : null}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
      <Boton variante="secundario" className="h-14 text-base" disabled={estado === "revisando"} onClick={() => void revisar()}>
        {estado === "revisando" ? "Revisando…" : "Revisar correo ahora"}
      </Boton>
      <details className="rounded-lg border border-borde px-4 py-3">
        <summary className="cursor-pointer text-base font-medium">Buscar documentos entre dos fechas</summary>
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-base text-texto-suave">
            Trae a la Bandeja los documentos de los correos recibidos en ese tramo (y del día siguiente, porque el cierre de caja suele llegar pasada la medianoche), también los que ya revisé antes y no se llegaron a meter. Los que ya están metidos no se repiten.
          </p>
          <div className="flex flex-wrap gap-2">
            {tramosRapidos(hoy).map((t) => (
              <button
                key={t.nombre}
                type="button"
                onClick={() => {
                  setDesde(t.desde);
                  setHasta(t.hasta);
                }}
                className="h-11 rounded-lg border border-borde px-3 text-base"
              >
                {t.nombre}
              </button>
            ))}
          </div>
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
