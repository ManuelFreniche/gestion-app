"use client";

import { useRef, useState } from "react";
import { Aviso, Boton } from "@/components/ui";
import { crearClienteNavegador } from "@/lib/supabase/cliente";
import { registrarDocumento } from "./acciones";

const EXTENSION: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
};

// Sube el ticket directamente a Storage (así no importa que la foto pese) y lo deja en la bandeja.
export function SubirTicket({ org }: { org: string }) {
  const entrada = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [mensaje, setMensaje] = useState<{ error?: string; ok?: string }>({});

  async function subir(archivos: FileList | null) {
    if (!archivos || archivos.length === 0) return;
    setSubiendo(true);
    setMensaje({});
    const supabase = crearClienteNavegador();
    let bien = 0;
    let error: string | undefined;

    for (const archivo of Array.from(archivos)) {
      const extension = EXTENSION[archivo.type];
      if (!extension) {
        error = "Solo se pueden subir PDF o fotos (JPG, PNG).";
        continue;
      }
      const ruta = `${org}/${crypto.randomUUID()}.${extension}`;
      const subida = await supabase.storage.from("documentos").upload(ruta, archivo, { contentType: archivo.type });
      if (subida.error) {
        error = "No se pudo subir el archivo. Inténtalo de nuevo.";
        continue;
      }
      const resultado = await registrarDocumento({
        org,
        ruta,
        nombre: archivo.name,
        tipoArchivo: archivo.type,
      });
      if (resultado.error) error = resultado.error;
      else bien += 1;
    }

    setSubiendo(false);
    setMensaje({ error, ok: bien > 0 ? `${bien} subido${bien > 1 ? "s" : ""}. Ya está en la lista de abajo.` : undefined });
    if (entrada.current) entrada.current.value = "";
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={entrada}
        type="file"
        accept="application/pdf,image/*"
        multiple
        className="sr-only"
        id="subir-ticket"
        onChange={(e) => subir(e.target.files)}
      />
      <Boton type="button" className="h-14 text-base" disabled={subiendo} onClick={() => entrada.current?.click()}>
        {subiendo ? "Subiendo…" : "Subir ticket de cierre"}
      </Boton>
      <p className="text-sm text-texto-suave">PDF o foto. Puedes elegir varios a la vez.</p>
      <Aviso>{mensaje.error}</Aviso>
      {mensaje.ok && (
        <p role="status" className="rounded-lg bg-primario/10 px-3 py-2 text-sm">
          {mensaje.ok}
        </p>
      )}
    </div>
  );
}
