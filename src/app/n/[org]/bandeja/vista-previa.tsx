"use client";

import { useEffect, useRef, useState } from "react";

// Enseña el documento dentro de la propia pantalla, sin descargarlo.
// Los PDF se dibujan con pdf.js porque los móviles no siempre saben abrirlos en la página.
export function VistaPrevia({ url, tipo, nombre }: { url: string; tipo: string; nombre: string }) {
  const paginas = useRef<HTMLDivElement>(null);
  const [fallo, setFallo] = useState(false);
  const [cargando, setCargando] = useState(tipo === "application/pdf");

  useEffect(() => {
    if (tipo !== "application/pdf") return;
    let cancelado = false;
    const destino = paginas.current;

    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();
        const pdf = await pdfjs.getDocument({ url }).promise;
        const ancho = destino?.clientWidth || 320;

        for (let n = 1; n <= Math.min(pdf.numPages, 3); n++) {
          const pagina = await pdf.getPage(n);
          const base = pagina.getViewport({ scale: 1 });
          const vista = pagina.getViewport({
            scale: (ancho / base.width) * Math.min(window.devicePixelRatio || 1, 2),
          });
          const lienzo = document.createElement("canvas");
          lienzo.width = vista.width;
          lienzo.height = vista.height;
          lienzo.style.width = "100%";
          lienzo.style.height = "auto";
          lienzo.setAttribute("aria-label", `${nombre}, página ${n}`);
          await pagina.render({ canvas: lienzo, viewport: vista }).promise;
          if (cancelado) return;
          destino?.appendChild(lienzo);
        }
        if (!cancelado) setCargando(false);
      } catch {
        if (!cancelado) {
          setFallo(true);
          setCargando(false);
        }
      }
    })();

    return () => {
      cancelado = true;
      destino?.replaceChildren();
    };
  }, [url, tipo, nombre]);

  if (tipo !== "application/pdf") {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- URL firmada y temporal de Storage
      <img src={url} alt={nombre} className="max-h-[70vh] w-full rounded-lg border border-borde object-contain" />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {cargando && <p className="text-sm text-texto-suave">Abriendo el documento…</p>}
      {fallo && (
        <p className="text-sm text-peligro">
          No se pudo mostrar aquí.{" "}
          <a href={url} target="_blank" rel="noreferrer" className="underline">
            Abrirlo en otra pestaña
          </a>
        </p>
      )}
      <div ref={paginas} className="flex flex-col gap-2 overflow-hidden rounded-lg border border-borde bg-white" />
    </div>
  );
}
