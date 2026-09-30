"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { extractText, getDocumentProxy } from "unpdf";
import { esFecha, euros, fechaLarga, hoyEn, leerImporte } from "@/lib/cierre";
import { crearClienteServidor } from "@/lib/supabase/server";
import { leerTicketConIA } from "@/lib/leer-ticket-ia";
import { leerTicketCierre, type TicketCierre } from "@/lib/ticket-cierre";

export type EstadoBandeja = { error?: string; ok?: boolean };

// Resultado de subir un documento: si se leyó bien, el cierre se mete solo.
export type ResultadoSubida = {
  error?: string;
  estado?: "metido" | "pendiente" | "repetido";
  detalle?: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function textoDelPdf(bytes: Uint8Array): Promise<string> {
  // pdf.js se queda con el buffer que recibe: se le pasa una copia para poder reutilizar el original.
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}

// El archivo ya está en Storage (lo sube el navegador). Aquí se lee, se calcula su huella
// para no meter dos veces lo mismo y se intenta sacar la venta del ticket.
// Si se leyó la venta y se sabe el día y el local, el cierre se mete solo; si no, el
// documento queda en la bandeja para que una persona lo revise.
export async function registrarDocumento(entrada: {
  org: string;
  ruta: string;
  nombre: string;
  tipoArchivo: string;
  // Día a usar si el ticket no trae fecha. Solo se envía cuando se sube un único archivo.
  fecha?: string;
  // Texto que el navegador ya ha leído del documento (PDF u OCR).
  texto?: string;
}): Promise<ResultadoSubida> {
  const { org, ruta, nombre, tipoArchivo } = entrada;
  if (!UUID.test(org) || !ruta.startsWith(`${org}/`)) {
    return { error: "Algo ha ido mal. Recarga la página e inténtalo de nuevo." };
  }

  const supabase = await crearClienteServidor();
  const descarga = await supabase.storage.from("documentos").download(ruta);
  if (descarga.error || !descarga.data) return { error: "No se pudo leer el archivo subido." };

  const bytes = new Uint8Array(await descarga.data.arrayBuffer());
  const huella = createHash("sha256").update(bytes).digest("hex");

  // El navegador ya ha leído el documento (texto del PDF u OCR): aquí solo se interpreta.
  // Si no llegó texto, se prueba con el texto del PDF y, como último recurso, con IA de visión.
  const esPdf = tipoArchivo === "application/pdf";
  let textoLeido = (entrada.texto ?? "").slice(0, 20_000);
  let lectura: TicketCierre | null = textoLeido ? leerTicketCierre(textoLeido) : null;
  if (!lectura && !textoLeido.trim() && esPdf) {
    try {
      textoLeido = await textoDelPdf(bytes);
      lectura = leerTicketCierre(textoLeido);
    } catch {
      // PDF sin texto legible.
    }
  }
  let motivoFallo: string | undefined;
  if (!lectura && textoLeido.trim().length < 80) {
    const ia = await leerTicketConIA(bytes, tipoArchivo, 15_000);
    lectura = ia.ticket;
    motivoFallo = ia.motivo;
  }
  const avisoLectura = lectura
    ? undefined
    : [
        "No se pudo leer solo: no reconozco el formato del ticket.",
        !textoLeido.trim() && "No se encontró texto en el documento.",
        motivoFallo,
      ]
        .filter(Boolean)
        .join(" ");

  const datos: Record<string, string | number> = {};
  if (lectura) {
    datos.venta = lectura.venta;
    if (lectura.efectivo !== null) datos.efectivo = lectura.efectivo;
    if (lectura.banco !== null) datos.banco = lectura.banco;
    if (lectura.fecha) datos.fecha = lectura.fecha;
  } else if (textoLeido.trim()) {
    // Para poder ver qué texto se leyó cuando el formato no se reconoce.
    datos.texto_leido = textoLeido.replace(/\s+/g, " ").trim().slice(0, 1500);
  }

  // Sin .select(): quien sube pero no revisa (p. ej. un empleado) no puede leer la fila.
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

  let recuperado = false;
  if (error) {
    if (error.code === "23505") {
      // La copia recién subida sobra: el original ya está guardado.
      await supabase.storage.from("documentos").remove([ruta]);
      const { data: previo } = await supabase
        .from("documentos_entrantes")
        .select("id, estado")
        .eq("organizacion_id", org)
        .eq("huella", huella)
        .maybeSingle();
      if (previo?.estado === "descartado" || (previo?.estado === "pendiente" && lectura)) {
        // Lo descartado no se vuelve a descartar solo: vuelve a la bandeja para que decidas.
        // Si ahora se lee y antes no, se actualizan los datos leídos.
        const { error: errorRecuperar } = await supabase
          .from("documentos_entrantes")
          .update({
            estado: "pendiente",
            revisado_en: null,
            revisado_por: null,
            ...(Object.keys(datos).length > 0 && { datos }),
          })
          .eq("id", previo.id);
        if (errorRecuperar) return { estado: "repetido" };
        recuperado = previo.estado === "descartado";
      } else {
        return { estado: "repetido" };
      }
    } else if (error.code === "42501") {
      return { error: "No tienes permiso para subir documentos." };
    } else {
      return { error: "No se pudo guardar el documento. Inténtalo de nuevo." };
    }
  }

  revalidatePath(`/n/${org}/bandeja`);

  // Aprobación automática: solo con la venta leída, el día conocido y un único local.
  const fecha = typeof datos.fecha === "string" ? datos.fecha : entrada.fecha;
  const venta = typeof datos.venta === "number" ? datos.venta : undefined;
  if (venta !== undefined && esFecha(fecha)) {
    const { data: fila } = await supabase
      .from("documentos_entrantes")
      .select("id")
      .eq("organizacion_id", org)
      .eq("huella", huella)
      .maybeSingle();
    if (!fila) return { estado: "pendiente" };

    const [locales, ajustes] = await Promise.all([
      supabase.from("locales").select("id").eq("organizacion_id", org),
      supabase.from("ajustes_organizacion").select("zona_horaria").eq("organizacion_id", org).maybeSingle(),
    ]);
    const hoy = hoyEn(ajustes.data?.zona_horaria ?? "Europe/Madrid");
    if (locales.data?.length === 1 && fecha <= hoy) {
      const { error: errorAprobar } = await supabase.rpc("aprobar_cierre", {
        p_documento: fila.id,
        p_local: locales.data[0].id,
        p_fecha: fecha,
        p_venta: venta,
        ...(typeof datos.efectivo === "number" && { p_efectivo: datos.efectivo }),
        ...(typeof datos.banco === "number" && { p_banco: datos.banco }),
      });
      if (!errorAprobar) {
        revalidatePath(`/n/${org}/ventas`);
        return { estado: "metido", detalle: `${fechaLarga(fecha)}: ${euros(venta)}` };
      }
      // Sin permiso para aprobar (p. ej. un empleado), queda pendiente de revisión.
    }
  }

  const detalle = [recuperado && "Lo habías descartado: lo he vuelto a poner en la bandeja.", avisoLectura]
    .filter(Boolean)
    .join(" ");
  return { estado: "pendiente", ...(detalle && { detalle }) };
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
