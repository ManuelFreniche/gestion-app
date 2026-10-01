import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { extractText, getDocumentProxy } from "unpdf";
import { esFecha, euros, fechaLarga, hoyEn } from "./cierre";
import { facturaDesdeReglas, leerFactura, leerFacturasPorPaginas, type FacturaDatos } from "./factura";
import { esModeloLigero, hayIA, leerDocumentoConIA, type IngresoDia } from "./leer-documento-ia";
import { crearClienteServidor } from "./supabase/server";
import { leerTicketCierre, ticketCoherente, type TicketCierre } from "./ticket-cierre";

// Resultado de subir un documento: si se leyó bien, el cierre o las facturas se meten solos.
export type ResultadoSubida = {
  error?: string;
  estado?: "metido" | "pendiente" | "repetido" | "necesitaOcr";
  detalle?: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function textoDelPdf(bytes: Uint8Array): Promise<string> {
  // pdf.js se queda con el buffer que recibe: se le pasa una copia para poder reutilizar el original.
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

// El archivo ya está en Storage (lo sube el navegador). Aquí se interpreta lo que el navegador
// ha leído (texto del PDF o fotos de sus páginas), se calcula su huella para no meter dos veces
// lo mismo y se saca el ticket de cierre o las facturas con sus líneas.
// Lo que se lee con seguridad se mete solo; lo dudoso queda en la bandeja para revisarlo.
export async function registrarDocumento(entrada: {
  org: string;
  ruta: string;
  nombre: string;
  tipoArchivo: string;
  // Día a usar si el ticket no trae fecha. Solo se envía cuando se sube un único archivo.
  fecha?: string;
  // Texto que el navegador ya ha leído del documento (PDF u OCR).
  texto?: string;
  // Texto de cada página del PDF, para separar las facturas cuando no hay IA.
  paginas?: string[];
  // Páginas como JPEG en base64, cuando el documento es una foto o un PDF escaneado.
  imagenes?: string[];
  // El navegador ya ha probado el OCR local: no volver a pedirlo.
  ocrHecho?: boolean;
  // De dónde viene el documento (por defecto, subido a mano).
  origen?: "subida" | "correo";
  // Tiempo máximo para la lectura con IA (por defecto, el de una subida manual).
  tiempoIaMs?: number;
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

  // Antes de gastar tiempo en leerlo: si ya está metido o ya leído y esperando, se ignora.
  const { data: anterior } = await supabase
    .from("documentos_entrantes")
    .select("id, estado, datos")
    .eq("organizacion_id", org)
    .eq("huella", huella)
    .maybeSingle();
  const ia = hayIA();
  if (anterior) {
    const d = (anterior.datos ?? {}) as { venta?: unknown; facturas?: unknown[]; ingresos?: unknown[]; lector?: unknown };
    // Una lectura hecha con reglas (sin IA) se repite si ahora hay IA: suele ser incompleta.
    const leido =
      d.venta !== undefined ||
      (Array.isArray(d.ingresos) && d.ingresos.length > 0) ||
      (Array.isArray(d.facturas) && d.facturas.length > 0 && (d.lector === "ia" || !ia));
    if (anterior.estado === "aprobado" || (anterior.estado === "pendiente" && leido)) {
      await supabase.storage.from("documentos").remove([ruta]);
      return { estado: "repetido" };
    }
  }

  const esPdf = tipoArchivo === "application/pdf";
  const imagenes = (entrada.imagenes ?? []).slice(0, 8);
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

  // Una lectura por reglas cuyas cifras no cuadran se descarta: se prueba con el lector de IA.
  if (lectura && !ticketCoherente(lectura)) lectura = null;
  let sospechoso = false;

  let facturas: FacturaDatos[] = [];
  let ingresos: IngresoDia[] = [];
  let motivoFallo: string | undefined;
  let lector: "ia" | "reglas" = "reglas";
  let modeloLigero = false;
  if (!lectura && ia) {
    const respuesta = await leerDocumentoConIA({ texto: textoLeido, imagenes, archivo: { bytes, tipo: tipoArchivo } }, entrada.tiempoIaMs);
    motivoFallo = respuesta.motivo;
    modeloLigero = esModeloLigero(respuesta.modelo);
    if (!respuesta.documento && respuesta.transitorio) {
      // El fallo es del proveedor (límite gratuito, saturación): no se guarda una lectura a medias.
      // Sin guardar nada, un correo no se marca como leído y se vuelve a intentar más tarde.
      await supabase.storage.from("documentos").remove([ruta]);
      return {
        error:
          `El lector de Google no ha podido leerlo ahora mismo (límite gratuito agotado, saturado o archivo muy largo). No se ha guardado nada: vuelve a intentarlo en unos minutos.${motivoFallo ? ` Motivo técnico: ${motivoFallo.slice(0, 200)}` : ""}`,
      };
    }
    if (respuesta.documento?.ticket) {
      lectura = respuesta.documento.ticket;
      sospechoso = !ticketCoherente(lectura);
    }
    else if (respuesta.documento) {
      facturas = respuesta.documento.facturas;
      ingresos = respuesta.documento.ingresos;
      lector = "ia";
    }
  }
  // Sin IA (o si no ha sacado nada): reglas de texto, separando las facturas por páginas.
  if (!lectura && facturas.length === 0 && ingresos.length === 0 && textoLeido.trim()) {
    const porPaginas = leerFacturasPorPaginas(entrada.paginas ?? []);
    const reglas = porPaginas.length === 0 ? leerFactura(textoLeido) : null;
    if (porPaginas.length > 0) facturas = porPaginas;
    else if (reglas) facturas = [facturaDesdeReglas(reglas)];
  }

  // Sin IA y sin texto (foto o PDF escaneado): el navegador debe hacer antes el OCR local.
  if (!lectura && facturas.length === 0 && ingresos.length === 0 && !ia && !textoLeido.trim() && !entrada.ocrHecho) {
    await supabase.storage.from("documentos").remove([ruta]);
    return { estado: "necesitaOcr" };
  }

  const soloIngresos = ingresos.length > 0 && facturas.length === 0;
  const tipo = lectura
    ? "cierre"
    : soloIngresos
      ? "ingresos"
      : facturas.length > 0 || textoLeido.trim() || imagenes.length > 0
        ? "factura"
        : "cierre";
  const sinIA = !ia && "El lector inteligente no está activado (falta la clave GEMINI_API_KEY en Vercel): así solo leo bien PDFs con texto claro.";
  const resumenIngresos =
    ingresos.length > 0 &&
    `${plural(ingresos.length, "día de ingresos", "días de ingresos")} · total ${euros(ingresos.reduce((t, d) => t + d.venta, 0))}.`;
  const aviso = lectura
    ? sospechoso
      ? "Las cifras del cierre no cuadran (la venta es menor que lo cobrado en efectivo y banco). Compruébalas con el PDF antes de meterlas."
      : undefined
    : tipo === "factura" || tipo === "ingresos"
      ? [
          facturas.length > 0 &&
            `Leída: ${plural(facturas.length, "factura o gasto", "facturas o gastos")} · total ${euros(facturas.reduce((t, f) => t + (f.importe ?? 0), 0))}.`,
          resumenIngresos,
          tipo === "ingresos" || facturas.length > 0
            ? "Revísalo abajo y decide qué se mete."
            : "No he conseguido leer los datos: escríbelos mirando el documento.",
          modeloLigero &&
            "Se agotó el cupo gratuito del lector principal y la ha leído uno más sencillo: comprueba bien los importes antes de meterla.",
          sinIA,
          motivoFallo,
        ]
          .filter(Boolean)
          .join(" ")
      : [
          "No se pudo leer solo: no reconozco el formato del ticket.",
          !textoLeido.trim() && "No se encontró texto en el documento.",
          sinIA,
          motivoFallo,
        ]
          .filter(Boolean)
          .join(" ");

  const datos: Record<string, unknown> = {};
  if (lectura) {
    datos.venta = lectura.venta;
    if (lectura.efectivo !== null) datos.efectivo = lectura.efectivo;
    if (lectura.banco !== null) datos.banco = lectura.banco;
    if (lectura.fecha) datos.fecha = lectura.fecha;
  } else if (facturas.length > 0 || ingresos.length > 0) {
    if (facturas.length > 0) datos.facturas = facturas;
    if (ingresos.length > 0) datos.ingresos = ingresos;
    datos.lector = lector;
  } else if (textoLeido.trim()) {
    // Para poder ver qué texto se leyó cuando el formato no se reconoce.
    datos.texto_leido = textoLeido.replace(/\s+/g, " ").trim().slice(0, 1500);
  }
  if (motivoFallo) datos.motivo_ia = motivoFallo.slice(0, 300);

  // Sin .select(): quien sube pero no revisa (p. ej. un empleado) no puede leer la fila.
  const { error } = await supabase.from("documentos_entrantes").insert({
    organizacion_id: org,
    tipo,
    origen: entrada.origen ?? "subida",
    archivo_ruta: ruta,
    archivo_nombre: nombre.slice(0, 200),
    archivo_tipo: tipoArchivo,
    huella,
    datos: datos as never,
  });

  let recuperado = false;
  if (error) {
    if (error.code === "23505") {
      // La copia recién subida sobra: el original ya está guardado.
      await supabase.storage.from("documentos").remove([ruta]);
      // Lo descartado no se vuelve a descartar solo: vuelve a la bandeja para que decidas.
      // Un pendiente sin leer se actualiza con lo leído ahora.
      const { error: errorRecuperar } = await supabase
        .from("documentos_entrantes")
        .update({ estado: "pendiente", revisado_en: null, revisado_por: null, tipo, datos: datos as never })
        .eq("organizacion_id", org)
        .eq("huella", huella)
        .in("estado", ["descartado", "pendiente"]);
      if (errorRecuperar || !anterior) return { estado: "repetido" };
      recuperado = anterior.estado === "descartado";
    } else if (error.code === "42501") {
      return { error: "No tienes permiso para subir documentos." };
    } else {
      return { error: "No se pudo guardar el documento. Inténtalo de nuevo." };
    }
  }

  revalidatePath(`/n/${org}/bandeja`);

  // Solo el ticket de cierre se mete solo. Las facturas las mete siempre una persona.
  if (lectura !== null) {
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

    // Ticket de cierre: solo con la venta leída, el día conocido y un único local.
    const fecha = typeof datos.fecha === "string" ? datos.fecha : entrada.fecha;
    const venta = typeof datos.venta === "number" ? datos.venta : undefined;
    if (tipo === "cierre" && !sospechoso && venta !== undefined && esFecha(fecha) && locales.data?.length === 1 && fecha <= hoy) {
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
        return { estado: "metido", detalle: `Metido en el cierre · ${fechaLarga(fecha)}: ${euros(venta)}` };
      }
      // Sin permiso para aprobar (p. ej. un empleado), queda pendiente de revisión.
    }
  }

  const detalle = [recuperado && "Lo habías descartado: lo he vuelto a poner en la bandeja.", aviso].filter(Boolean).join(" ");
  return { estado: "pendiente", ...(detalle && { detalle }) };
}
