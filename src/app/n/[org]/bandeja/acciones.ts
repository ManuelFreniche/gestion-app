"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { extractText, getDocumentProxy } from "unpdf";
import { esFecha, leerImporte } from "@/lib/cierre";
import { crearClienteServidor } from "@/lib/supabase/server";
import { leerTicketCierre } from "@/lib/ticket-cierre";

export type EstadoBandeja = { error?: string; ok?: boolean };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function textoDelPdf(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}

// El archivo ya está en Storage (lo sube el navegador). Aquí se lee, se calcula su huella
// para no meter dos veces lo mismo, se intenta sacar la venta del ticket y se deja
// en la bandeja pendiente de revisión.
export async function registrarDocumento(entrada: {
  org: string;
  ruta: string;
  nombre: string;
  tipoArchivo: string;
}): Promise<EstadoBandeja> {
  const { org, ruta, nombre, tipoArchivo } = entrada;
  if (!UUID.test(org) || !ruta.startsWith(`${org}/`)) {
    return { error: "Algo ha ido mal. Recarga la página e inténtalo de nuevo." };
  }

  const supabase = await crearClienteServidor();
  const descarga = await supabase.storage.from("documentos").download(ruta);
  if (descarga.error || !descarga.data) return { error: "No se pudo leer el archivo subido." };

  const bytes = new Uint8Array(await descarga.data.arrayBuffer());
  const huella = createHash("sha256").update(bytes).digest("hex");

  let datos: Record<string, string | number> = {};
  if (tipoArchivo === "application/pdf") {
    try {
      const lectura = leerTicketCierre(await textoDelPdf(bytes));
      if (lectura) {
        datos = { venta: lectura.venta };
        if (lectura.efectivo !== null) datos.efectivo = lectura.efectivo;
        if (lectura.banco !== null) datos.banco = lectura.banco;
        if (lectura.fecha) datos.fecha = lectura.fecha;
      }
    } catch {
      // Si el PDF no se puede leer, la persona escribe los datos a mano al revisarlo.
    }
  }

  const { error } = await supabase.from("documentos_entrantes").insert({
    organizacion_id: org,
    tipo: "cierre",
    origen: "subida",
    archivo_ruta: ruta,
    archivo_nombre: nombre.slice(0, 200),
    archivo_tipo: tipoArchivo,
    huella,
    datos,
  });

  if (error) {
    if (error.code === "23505") return { error: "Este ticket ya estaba en la bandeja." };
    if (error.code === "42501") return { error: "No tienes permiso para subir documentos." };
    return { error: "No se pudo guardar el documento. Inténtalo de nuevo." };
  }

  revalidatePath(`/n/${org}/bandeja`);
  return { ok: true };
}

// Mete el ticket revisado como cierre del día.
export async function aprobarCierre(_: EstadoBandeja, formData: FormData): Promise<EstadoBandeja> {
  const org = String(formData.get("org") ?? "");
  const documento = String(formData.get("documento") ?? "");
  const local = String(formData.get("local") ?? "");
  const fecha = String(formData.get("fecha") ?? "");
  const venta = leerImporte(String(formData.get("venta") ?? ""));
  const efectivoTexto = String(formData.get("efectivo") ?? "").trim();
  const bancoTexto = String(formData.get("banco") ?? "").trim();
  const efectivo = efectivoTexto ? leerImporte(efectivoTexto) : null;
  const banco = bancoTexto ? leerImporte(bancoTexto) : null;

  if (![org, documento, local].every((id) => UUID.test(id)) || !esFecha(fecha)) {
    return { error: "Algo ha ido mal. Recarga la página e inténtalo de nuevo." };
  }
  if (venta === null) return { error: "Escribe la venta del día, por ejemplo 136,70." };
  if ((efectivoTexto && efectivo === null) || (bancoTexto && banco === null)) {
    return { error: "Revisa efectivo y tarjeta: tienen que ser importes, por ejemplo 10,80." };
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("aprobar_cierre", {
    p_documento: documento,
    p_local: local,
    p_fecha: fecha,
    p_venta: venta,
    ...(efectivo !== null && { p_efectivo: efectivo }),
    ...(banco !== null && { p_banco: banco }),
  });

  if (error) {
    return {
      error:
        error.code === "P0002"
          ? "Este ticket ya se revisó. Recarga la página."
          : error.code === "42501"
            ? "No tienes permiso para meter cierres."
            : "No se pudo meter el cierre. Inténtalo de nuevo.",
    };
  }

  revalidatePath(`/n/${org}/bandeja`);
  revalidatePath(`/n/${org}/ventas`);
  return { ok: true };
}

// Deja el documento fuera: no entra en las cuentas y sale de la bandeja.
export async function descartarDocumento(_: EstadoBandeja, formData: FormData): Promise<EstadoBandeja> {
  const org = String(formData.get("org") ?? "");
  const documento = String(formData.get("documento") ?? "");
  if (!UUID.test(org) || !UUID.test(documento)) return { error: "Algo ha ido mal. Recarga la página." };

  const supabase = await crearClienteServidor();
  const { error } = await supabase
    .from("documentos_entrantes")
    .update({ estado: "descartado", revisado_en: new Date().toISOString() })
    .eq("id", documento)
    .eq("organizacion_id", org)
    .eq("estado", "pendiente");

  if (error) return { error: "No se pudo descartar. Inténtalo de nuevo." };

  revalidatePath(`/n/${org}/bandeja`);
  return { ok: true };
}
