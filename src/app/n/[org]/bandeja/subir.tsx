"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Boton, Campo, Etiqueta } from "@/components/ui";
import { leerTextoEnNavegador, prepararDocumento } from "@/lib/leer-en-navegador";
import type { ResultadoSubida } from "@/lib/registrar-documento";
import { crearClienteNavegador } from "@/lib/supabase/cliente";

const EXTENSION: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
};

// Cuántos documentos se leen a la vez.
const A_LA_VEZ = 3;

const conTiempo = <T,>(promesa: Promise<T>, ms: number, alternativa: T) =>
  Promise.race([promesa, new Promise<T>((resolver) => setTimeout(() => resolver(alternativa), ms))]);

type Fase = "cola" | "subiendo" | "leyendo" | "bien" | "revisar" | "repetido" | "error";
type Fila = { nombre: string; fase: Fase; texto?: string };

const TEXTO_FASE: Partial<Record<Fase, string>> = {
  cola: "Esperando su turno…",
  subiendo: "Subiendo el archivo…",
  leyendo: "Leyendo todas las páginas…",
};

function Icono({ fase }: { fase: Fase }) {
  if (fase === "cola") return <span aria-hidden className="size-6 rounded-full border-2 border-borde" />;
  if (fase === "subiendo" || fase === "leyendo")
    return <span aria-hidden className="size-6 animate-spin rounded-full border-2 border-borde border-t-primario" />;
  const [color, simbolo] =
    fase === "bien" ? ["bg-exito text-superficie", "✓"] : fase === "revisar" ? ["bg-primario text-primario-texto", "→"] : fase === "repetido" ? ["bg-texto-suave text-superficie", "="] : ["bg-peligro text-superficie", "!"];
  return (
    <span aria-hidden className={`flex size-6 items-center justify-center rounded-full text-sm font-bold ${color}`}>
      {simbolo}
    </span>
  );
}

// Sube los documentos directamente a Storage (así no importa que pesen), los prepara en este
// dispositivo y el servidor los lee. Se pueden soltar varios a la vez y cada uno muestra en qué
// paso va. Lo leído aparece debajo para que tú decidas si se mete.
export function SubirTickets({ org, hoy }: { org: string; hoy: string }) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [trabajando, setTrabajando] = useState(false);
  const [fecha, setFecha] = useState(hoy);

  const cambiar = (indice: number, cambio: Partial<Fila>) =>
    setFilas((actuales) => actuales.map((f, i) => (i === indice ? { ...f, ...cambio } : f)));

  async function subir(archivos: File[]) {
    if (archivos.length === 0 || trabajando) return;
    setTrabajando(true);
    setFilas(archivos.map((a) => ({ nombre: a.name, fase: "cola" })));
    const supabase = crearClienteNavegador();

    const leerUno = async (archivo: File, indice: number) => {
      const fin = (fase: Fase, texto: string) => cambiar(indice, { fase, texto });
      const extension = EXTENSION[archivo.type];
      if (!extension) return fin("error", "Solo se pueden subir PDF o fotos (JPG, PNG).");

      cambiar(indice, { fase: "subiendo" });
      const ruta = `${org}/${crypto.randomUUID()}.${extension}`;
      const subida = await supabase.storage.from("documentos").upload(ruta, archivo, { contentType: archivo.type });
      if (subida.error) return fin("error", "No se pudo subir. Inténtalo de nuevo.");

      cambiar(indice, { fase: "leyendo" });
      const enviar = (extra: { texto: string; imagenes: string[]; paginas?: string[]; ocrHecho?: boolean }): Promise<ResultadoSubida> =>
        fetch("/api/documentos", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            org,
            ruta,
            nombre: archivo.name,
            tipoArchivo: archivo.type,
            // Con varios archivos no se puede saber a qué día corresponde cada uno.
            fecha: archivos.length === 1 ? fecha : undefined,
            ...extra,
          }),
        })
          .then((r) => r.json() as Promise<ResultadoSubida>)
          .catch(() => ({ error: "Tardó demasiado en leerlo. Recarga la página: si se guardó, estará abajo." }));

      const preparado = await conTiempo(prepararDocumento(archivo).catch(() => null), 30_000, null);
      let resultado = await enviar(preparado ?? { texto: "", imagenes: [] });
      if (resultado.estado === "necesitaOcr") {
        // El servidor no tiene IA configurada: se lee con OCR gratuito en este dispositivo.
        const texto = await conTiempo(leerTextoEnNavegador(archivo).catch(() => ""), 60_000, "");
        resultado = await enviar({ texto, imagenes: [], ocrHecho: true });
      }
      if (resultado.error) fin("error", resultado.error);
      else if (resultado.estado === "repetido") fin("repetido", "Ya la tenías guardada. No hago nada.");
      else if (resultado.estado === "metido") fin("bien", resultado.detalle ?? "Metido.");
      else fin("revisar", resultado.detalle ?? "Léela abajo y decide si la metes.");
      router.refresh(); // las tarjetas de abajo aparecen según se van leyendo
    };

    let siguiente = 0;
    await Promise.all(
      Array.from({ length: Math.min(A_LA_VEZ, archivos.length) }, async () => {
        while (siguiente < archivos.length) {
          const indice = siguiente++;
          await leerUno(archivos[indice], indice);
        }
      }),
    );
    setTrabajando(false);
    if (entrada.current) entrada.current.value = "";
  }

  return (
    <div className="flex flex-col gap-5">
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
        className={`flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition ${
          arrastrando ? "border-primario bg-primario/10" : "border-borde"
        }`}
      >
        <p className="text-xl font-semibold">{arrastrando ? "Suéltalos aquí" : "Sube tus facturas o tickets"}</p>
        <p className="max-w-sm text-base text-texto-suave">
          Elige los archivos (PDF o foto, todos los que quieras). Yo los leo y tú decides cuáles se meten.
        </p>
        <Boton type="button" disabled={trabajando} onClick={() => entrada.current?.click()} className="mt-1 h-16 w-full max-w-xs text-lg">
          {trabajando ? "Leyendo…" : "Elegir archivos"}
        </Boton>
      </div>

      {filas.length > 0 && (
        <ul role="status" className="flex flex-col gap-2">
          {filas.map((f, i) => (
            <li key={`${f.nombre}-${i}`} className="flex items-start gap-3 rounded-xl bg-fondo px-4 py-3 ring-1 ring-borde">
              <Icono fase={f.fase} />
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-base font-medium">{f.nombre}</span>
                <span className={`text-base ${f.fase === "error" ? "text-peligro" : "text-texto-suave"}`}>
                  {f.texto ?? TEXTO_FASE[f.fase]}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <details className="text-base">
        <summary className="cursor-pointer text-texto-suave">Es un ticket de caja sin fecha</summary>
        <div className="mt-2 flex flex-col gap-1.5">
          <Etiqueta htmlFor="fecha-subida" className="text-base">
            Si subes un solo ticket y no trae fecha, se guarda con este día
          </Etiqueta>
          <Campo id="fecha-subida" type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value || hoy)} />
        </div>
      </details>
    </div>
  );
}
