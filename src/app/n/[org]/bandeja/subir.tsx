"use client";

import { useRef, useState } from "react";
import { Boton, Campo, Etiqueta } from "@/components/ui";
import { leerTextoEnNavegador } from "@/lib/leer-en-navegador";
import { crearClienteNavegador } from "@/lib/supabase/cliente";
import { registrarDocumento, type ResultadoSubida } from "./acciones";

const EXTENSION: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
};

type Resultado = { nombre: string; tono: "bien" | "revisar" | "error" | "repetido"; texto: string };

// Sube los tickets directamente a Storage (así no importa que la foto pese). Se pueden
// arrastrar varios a la vez. Si el ticket se lee bien, el cierre se mete solo; si no,
// queda en la lista de abajo para revisarlo.
export function SubirTickets({ org, hoy }: { org: string; hoy: string }) {
  const entrada = useRef<HTMLInputElement>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [progreso, setProgreso] = useState<{ hecho: number; total: number } | null>(null);
  const [fecha, setFecha] = useState(hoy);
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const subiendo = progreso !== null;

  async function subir(archivos: File[]) {
    if (archivos.length === 0 || subiendo) return;
    setResultados([]);
    setProgreso({ hecho: 0, total: archivos.length });
    const supabase = crearClienteNavegador();
    const nuevos: Resultado[] = [];

    for (const [indice, archivo] of archivos.entries()) {
      const extension = EXTENSION[archivo.type];
      if (!extension) {
        nuevos.push({ nombre: archivo.name, tono: "error", texto: "Solo se pueden subir PDF o fotos (JPG, PNG)." });
      } else {
        const ruta = `${org}/${crypto.randomUUID()}.${extension}`;
        const subida = await supabase.storage.from("documentos").upload(ruta, archivo, { contentType: archivo.type });
        if (subida.error) {
          nuevos.push({ nombre: archivo.name, tono: "error", texto: "No se pudo subir. Inténtalo de nuevo." });
        } else {
          // El documento se lee aquí, en el dispositivo: es mucho más rápido que hacerlo en el servidor.
          const texto = await Promise.race([
            leerTextoEnNavegador(archivo).catch(() => ""),
            new Promise<string>((resolver) => setTimeout(() => resolver(""), 60_000)),
          ]);
          const resultado: ResultadoSubida = await registrarDocumento({
            org,
            ruta,
            nombre: archivo.name,
            tipoArchivo: archivo.type,
            // Con varios archivos no se puede saber a qué día corresponde cada uno.
            fecha: archivos.length === 1 ? fecha : undefined,
            texto,
          }).catch(() => ({
            error: "Tardó demasiado en leerlo. Recarga la página: si se guardó, estará en la bandeja.",
          }));
          if (resultado.error) nuevos.push({ nombre: archivo.name, tono: "error", texto: resultado.error });
          else if (resultado.estado === "repetido")
            nuevos.push({ nombre: archivo.name, tono: "repetido", texto: "Ya lo tenías: lo he ignorado." });
          else if (resultado.estado === "metido")
            nuevos.push({ nombre: archivo.name, tono: "bien", texto: `Metido en el cierre · ${resultado.detalle}` });
          else nuevos.push({ nombre: archivo.name, tono: "revisar", texto: resultado.detalle ?? "Falta revisarlo: míralo abajo." });
        }
      }
      setProgreso({ hecho: indice + 1, total: archivos.length });
    }

    setResultados(nuevos);
    setProgreso(null);
    if (entrada.current) entrada.current.value = "";
  }

  return (
    <div className="flex flex-col gap-4">
      <input
        ref={entrada}
        type="file"
        accept="application/pdf,image/*"
        multiple
        className="sr-only"
        id="subir-ticket"
        onChange={(e) => subir(Array.from(e.target.files ?? []))}
      />
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastrando(false);
          subir(Array.from(e.dataTransfer.files));
        }}
        className={`flex flex-col items-center gap-3 rounded-xl border-2 border-dashed px-4 py-8 text-center transition ${
          arrastrando ? "border-primario bg-primario/10" : "border-borde"
        }`}
      >
        <p className="font-medium">
          {subiendo
            ? `Leyendo ${Math.min(progreso.hecho + 1, progreso.total)} de ${progreso.total}…`
            : arrastrando
              ? "Suéltalos aquí"
              : "Arrastra aquí los tickets"}
        </p>
        <p className="text-sm text-texto-suave">PDF o foto. Puedes soltar varios a la vez.</p>
        <Boton type="button" disabled={subiendo} onClick={() => entrada.current?.click()} className="h-14 text-base">
          Elegir archivos
        </Boton>
      </div>

      <div className="flex flex-col gap-1.5">
        <Etiqueta htmlFor="fecha-subida" className="text-sm">
          Si subes un solo ticket y no trae fecha, se guarda con este día
        </Etiqueta>
        <Campo id="fecha-subida" type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value || hoy)} />
      </div>

      {resultados.length > 0 && (
        <ul role="status" className="flex flex-col gap-2">
          {resultados.map((r, i) => (
            <li
              key={`${r.nombre}-${i}`}
              className={`rounded-lg px-3 py-2 text-sm ${
                r.tono === "bien"
                  ? "bg-primario/10"
                  : r.tono === "revisar" || r.tono === "repetido"
                    ? "bg-superficie ring-1 ring-borde"
                    : "bg-peligro/10 text-peligro"
              }`}
            >
              <span className="font-medium">{r.nombre}</span>
              <br />
              {r.texto}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
