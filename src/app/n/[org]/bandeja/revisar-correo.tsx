"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Boton } from "@/components/ui";
import type { ResultadoCorreo } from "@/lib/correo";

// Cada cuánto se revisa solo el correo al abrir la Bandeja.
const ENTRE_REVISIONES_MS = 10 * 60 * 1000;
const VUELTAS_MAX = 6;

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export function RevisarCorreo({ org }: { org: string }) {
  const router = useRouter();
  const [estado, setEstado] = useState<"reposo" | "revisando">("reposo");
  const [mensaje, setMensaje] = useState("");
  const [fallo, setFallo] = useState(false);
  const enMarcha = useRef(false);

  const revisar = useCallback(async () => {
    if (enMarcha.current) return;
    enMarcha.current = true;
    setEstado("revisando");
    setFallo(false);
    setMensaje("Buscando facturas nuevas en tu correo…");
    let nuevos = 0;
    let sinLeer = 0;
    try {
      for (let vuelta = 0; vuelta < VUELTAS_MAX; vuelta++) {
        const respuesta = await fetch("/api/correo", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ org }),
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
        if (r.quedan === 0) break;
        setMensaje(`Leyendo el correo… ${plural(nuevos, "documento nuevo", "documentos nuevos")} hasta ahora.`);
      }
      try {
        sessionStorage.setItem(`correo-${org}`, String(Date.now()));
      } catch {
        // Sin almacenamiento, se revisará en la próxima visita.
      }
      setMensaje(
        (nuevos > 0
          ? `Correo revisado: ${plural(nuevos, "documento nuevo", "documentos nuevos")} por revisar aquí abajo.`
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
  }, [org, router]);

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
    </div>
  );
}
