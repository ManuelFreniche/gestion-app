import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { esFecha, euros } from "./cierre";
import { VERSION_LECTURA_CIERRE } from "./cierres-bandeja";
import { facturaDesdeReglas, leerFactura, leerFacturasPorPaginas, type FacturaDatos } from "./factura";
import { esModeloLigero, hayIA, leerDocumentoConIA, type CausaFallo, type IngresoDia } from "./leer-documento-ia";
import { textoPorLineas } from "./pdf-lineas";
import { crearClienteServidor } from "./supabase/server";
import { contrastarLecturaIA, leerTicketCierre, revisarTicket, type TicketCierre } from "./ticket-cierre";

// Resultado de subir un documento: se lee, se guarda como tarjeta pendiente y una persona la revisa.
export type ResultadoSubida = {
  error?: string;
  estado?: "metido" | "pendiente" | "repetido" | "necesitaOcr";
  detalle?: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function textoDelPdf(bytes: Uint8Array): Promise<string> {
  return textoPorLineas(bytes);
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

const AVISO_SIN_CUPO = "Google no da cupo gratuito a la clave del lector inteligente (responde «límite 0»): hasta que se arregle la clave, hay que escribir los datos mirando el documento.";

// Qué decirle a la persona cuando el lector de Google no ha podido leer ahora mismo: con palabras, sin jerga,
// y lo que de verdad le sirve (cuándo volver a probar). Nada se ha guardado, así que no hay nada que limpiar.
export function mensajeFalloIA(causa: CausaFallo | undefined, motivoTecnico?: string): string {
  const detalle = motivoTecnico ? ` (Detalle técnico: ${motivoTecnico.replace(/\s+/g, " ").slice(0, 140)})` : "";
  switch (causa) {
    case "dia":
      return `Hoy se ha agotado el cupo gratuito del lector de Google: se renueva hacia las 9:00 de la mañana (hora de España). No se ha guardado nada; vuelve a intentarlo después de esa hora.${detalle}`;
    case "minuto":
      return `El lector de Google pide esperar un momento (límite por minuto). No se ha guardado nada: vuelve a intentarlo en un minuto.${detalle}`;
    case "saturado":
      return `Los servidores de Google están saturados ahora mismo. No se ha guardado nada: inténtalo de nuevo en unos minutos.${detalle}`;
    default:
      return `El lector de Google no ha podido leerlo ahora mismo (sin conexión, archivo muy largo o servicio caído). No se ha guardado nada: vuelve a intentarlo en unos minutos.${detalle}`;
  }
}

export type Interpretacion =
  | { error: string }
  | { necesitaOcr: true }
  | {
      tipo: "cierre" | "factura" | "ingresos";
      // Lo que se guarda en documentos_entrantes.datos (incluye `aviso` cuando algo no se pudo leer bien).
      datos: Record<string, unknown>;
      // Texto completo para quien acaba de subir el archivo (lo leído y lo que falte).
      detalle?: string;
    };

// Lee un documento (PDF o foto) y decide qué es: el ticket de cierre de caja, facturas o una hoja de
// ingresos. No toca la base de datos: quien lo llama guarda el resultado o limpia el archivo.
export async function interpretarDocumento(entrada: {
  bytes: Uint8Array;
  tipoArchivo: string;
  // Texto que el navegador ya ha leído del documento por OCR (fotos y escaneos).
  texto?: string;
  // Texto de cada página del PDF, para separar las facturas cuando no hay IA.
  paginas?: string[];
  // Páginas como JPEG en base64, cuando el documento es una foto o un PDF escaneado.
  imagenes?: string[];
  // El navegador ya ha probado el OCR local: no volver a pedirlo.
  ocrHecho?: boolean;
  // Tiempo máximo para la lectura con IA (por defecto, el de una subida manual).
  tiempoIaMs?: number;
}): Promise<Interpretacion> {
  const { bytes, tipoArchivo } = entrada;
  const ia = hayIA();
  const esPdf = tipoArchivo === "application/pdf";
  const imagenes = (entrada.imagenes ?? []).slice(0, 8);
  // El texto de un PDF se saca siempre aquí, ordenado por posición: el que manda el navegador sale en el
  // orden interno del PDF, que en el ticket de caja pone las cifras antes que sus etiquetas. El del
  // navegador solo vale para lo que no tiene texto (fotos y escaneos leídos con OCR).
  let textoLeido = "";
  if (esPdf) {
    try {
      textoLeido = (await textoDelPdf(bytes)).slice(0, 20_000);
    } catch {
      // PDF sin texto legible.
    }
  }
  if (!textoLeido.trim()) textoLeido = (entrada.texto ?? "").slice(0, 20_000);
  let lectura: TicketCierre | null = textoLeido ? leerTicketCierre(textoLeido) : null;

  // Un PDF con esta pinta es el cierre de caja aunque no se haya podido leer: se guarda como cierre para revisarlo.
  const pareceCierre = /total\s+tickets|estado\s+de\s+la\s+caja/i.test(textoLeido);
  // Lo que la persona debe mirar de la lectura del cierre (se guarda con la tarjeta).
  let avisosCierre: string[] = [];
  // Una lectura por reglas cuyas cifras no cuadran entre sí no es fiable: se prueba con el lector de IA, y si
  // este no puede, se enseña igualmente (con el aviso) en vez de dejar la tarjeta en blanco.
  let lecturaDudosa: { ticket: TicketCierre; avisos: string[] } | null = null;
  if (lectura) {
    const revision = revisarTicket(textoLeido, lectura);
    if (revision.fiable) avisosCierre = revision.avisos;
    else {
      lecturaDudosa = { ticket: lectura, avisos: revision.avisos };
      lectura = null;
    }
  }

  let facturas: FacturaDatos[] = [];
  let ingresos: IngresoDia[] = [];
  let motivoFallo: string | undefined;
  let lector: "ia" | "reglas" = "reglas";
  let modeloLigero = false;
  // Quién ha leído (modelo de IA) y lo que la IA avisó de lo leído; la IA pudo decir que no es ni factura ni cierre.
  let modelo: string | undefined;
  let avisosIA: string[] = [];
  let iaDijoOtro = false;
  let sinCupoIA = false;
  if (!lectura && ia) {
    const respuesta = await leerDocumentoConIA({ texto: textoLeido, imagenes, archivo: { bytes, tipo: tipoArchivo } }, entrada.tiempoIaMs);
    motivoFallo = respuesta.motivo;
    sinCupoIA = respuesta.causa === "sin-cupo";
    modeloLigero = esModeloLigero(respuesta.modelo);
    if (!respuesta.documento && respuesta.transitorio && !pareceCierre) {
      // El fallo es del proveedor (límite gratuito, saturación): no se guarda una lectura a medias.
      // Sin guardar nada, un correo no se marca como leído y se vuelve a intentar más tarde.
      return { error: mensajeFalloIA(respuesta.causa, motivoFallo) };
    }
    if (respuesta.documento?.ticket) {
      // La IA no se acepta a ciegas: la fecha es la impresa en el PDF y su venta tiene que salir en el texto.
      const contrastada = contrastarLecturaIA(textoLeido, respuesta.documento.ticket);
      const revision = revisarTicket(textoLeido, contrastada.ticket);
      lectura = contrastada.ticket;
      avisosCierre = [...contrastada.avisos, ...revision.avisos];
      if (modeloLigero) avisosCierre.push("La ha leído el lector más sencillo (se agotó el cupo gratuito del principal): comprueba bien los importes.");
    } else if (respuesta.documento && !pareceCierre) {
      facturas = respuesta.documento.facturas;
      ingresos = respuesta.documento.ingresos;
      lector = "ia";
      modelo = respuesta.modelo;
      avisosIA = respuesta.documento.avisos ?? [];
      iaDijoOtro = respuesta.documento.tipo === "otro";
    }
    // Si el PDF es un cierre y la IA lo tomó por facturas, se ignora: un cierre nunca es una factura.
  }
  if (!lectura && lecturaDudosa) {
    lectura = lecturaDudosa.ticket;
    avisosCierre = lecturaDudosa.avisos;
  }
  // Sin IA (o si no ha sacado nada): reglas de texto, separando las facturas por páginas.
  if (!lectura && !pareceCierre && !iaDijoOtro && facturas.length === 0 && ingresos.length === 0 && textoLeido.trim()) {
    const porPaginas = leerFacturasPorPaginas(entrada.paginas ?? []);
    const reglas = porPaginas.length === 0 ? leerFactura(textoLeido) : null;
    if (porPaginas.length > 0) facturas = porPaginas;
    else if (reglas) facturas = [facturaDesdeReglas(reglas)];
  }

  // Sin IA y sin texto (foto o PDF escaneado): el navegador debe hacer antes el OCR local.
  if (!lectura && facturas.length === 0 && ingresos.length === 0 && !ia && !textoLeido.trim() && !entrada.ocrHecho) {
    return { necesitaOcr: true };
  }

  const soloIngresos = ingresos.length > 0 && facturas.length === 0;
  // Lo que no es un cierre de caja ni una hoja de ingresos va como factura (en blanco si no se pudo leer):
  // una foto que no se lee nunca debe acabar como una venta.
  const tipo = lectura || pareceCierre ? "cierre" : soloIngresos ? "ingresos" : "factura";
  const sinIA = !ia && "El lector inteligente no está activado (falta la clave GEMINI_API_KEY en Vercel): así solo leo bien PDFs con texto claro.";
  const resumenIngresos =
    ingresos.length > 0 &&
    `${plural(ingresos.length, "día de ingresos", "días de ingresos")} · total ${euros(ingresos.reduce((t, d) => t + d.venta, 0))}.`;

  // `problemas` es lo que la persona debe saber al revisar la tarjeta (se guarda con ella);
  // `detalle` añade lo leído, para quien acaba de subir el archivo.
  let problemas: string[];
  let leido: (string | false)[] = [];
  if (lectura) {
    problemas = avisosCierre;
  } else if (tipo === "factura" || tipo === "ingresos") {
    leido = [
      facturas.length > 0 &&
        `Leída: ${plural(facturas.length, "factura o gasto", "facturas o gastos")} · total ${euros(facturas.reduce((t, f) => t + (f.importe ?? 0), 0))}.`,
      resumenIngresos,
      tipo === "ingresos" || facturas.length > 0 ? "Revísalo abajo y decide qué se mete." : false,
    ];
    problemas = [
      tipo !== "ingresos" && facturas.length === 0 && "No he conseguido leer los datos: escríbelos mirando el documento.",
      sinCupoIA && AVISO_SIN_CUPO,
      iaDijoOtro && facturas.length === 0 && ingresos.length === 0 && "El lector cree que esto no es una factura ni un cierre de caja. Si es así, descártalo con «No meter».",
      ...avisosIA,
      modeloLigero &&
        "Se agotó el cupo gratuito del lector principal y la ha leído uno más sencillo: comprueba bien los importes antes de meterla.",
      sinIA,
      motivoFallo,
    ].filter((p): p is string => Boolean(p));
  } else {
    problemas = [
      "No se pudo leer solo: no reconozco el formato del ticket.",
      sinCupoIA && AVISO_SIN_CUPO,
      !textoLeido.trim() && "No se encontró texto en el documento.",
      sinIA,
      motivoFallo,
    ].filter((p): p is string => Boolean(p));
  }

  const datos: Record<string, unknown> = {};
  if (tipo === "cierre") datos.version_lectura = VERSION_LECTURA_CIERRE;
  if (lectura) {
    datos.venta = lectura.venta;
    if (lectura.efectivo !== null) datos.efectivo = lectura.efectivo;
    if (lectura.banco !== null) datos.banco = lectura.banco;
    if (lectura.fecha) datos.fecha = lectura.fecha;
  } else if (facturas.length > 0 || ingresos.length > 0) {
    if (facturas.length > 0) datos.facturas = facturas;
    if (ingresos.length > 0) datos.ingresos = ingresos;
    datos.lector = lector;
    if (modelo) datos.modelo = modelo;
  }
  // Para poder ver qué texto se leyó cuando el formato no se reconoce o una lectura sale mal.
  if (textoLeido.trim() && (tipo === "cierre" || (!lectura && facturas.length === 0 && ingresos.length === 0))) {
    datos.texto_leido = textoLeido.replace(/\s+/g, " ").trim().slice(0, 1500);
  }
  if (motivoFallo) datos.motivo_ia = motivoFallo.slice(0, 300);
  if (problemas.length > 0) datos.aviso = problemas.join(" ").slice(0, 600);

  const detalle = [...leido, ...problemas].filter(Boolean).join(" ");
  return { tipo, datos, ...(detalle && { detalle }) };
}

// Los días de Ventas que cubre un documento: el de su cierre o los de su hoja de ingresos.
function diasDelDocumento(datos: unknown): string[] {
  const d = (datos ?? {}) as { fecha?: unknown; ingresos?: { fecha?: unknown }[] };
  const dias = [d.fecha, ...(Array.isArray(d.ingresos) ? d.ingresos.map((i) => i?.fecha) : [])].filter((f): f is string => typeof f === "string" && esFecha(f));
  return [...new Set(dias)].slice(0, 400);
}

// ¿Tiene este documento aprobado algo guardado en Ventas o en Facturas? Si se borró lo que metió, el
// documento queda "aprobado" sin nada detrás y no hay forma de volver a revisarlo. Ojo: Ventas guarda solo el
// último documento que tocó cada día, así que si otro documento pisó el suyo, el día sigue estando cubierto.
async function tieneRegistros(supabase: Awaited<ReturnType<typeof crearClienteServidor>>, org: string, doc: { id: string; datos: unknown }): Promise<boolean> {
  const dias = diasDelDocumento(doc.datos);
  const [cierres, facturas, porDia] = await Promise.all([
    supabase.from("cierres_diarios").select("id", { count: "exact", head: true }).eq("documento_id", doc.id),
    supabase.from("facturas_recibidas").select("id", { count: "exact", head: true }).eq("documento_id", doc.id),
    dias.length > 0
      ? supabase.from("cierres_diarios").select("id", { count: "exact", head: true }).eq("organizacion_id", org).in("fecha", dias)
      : Promise.resolve({ count: 0, error: null }),
  ]);
  // Si no se puede comprobar, se supone que sí los tiene: mejor no repetir que duplicar.
  if (cierres.error || facturas.error || porDia.error) return true;
  return (cierres.count ?? 0) + (facturas.count ?? 0) + (porDia.count ?? 0) > 0;
}

// El archivo ya está en Storage (lo sube el navegador). Aquí se interpreta lo que el navegador
// ha leído (texto del PDF o fotos de sus páginas), se calcula su huella para no meter dos veces
// lo mismo y se saca el ticket de cierre o las facturas con sus líneas.
// Nada se mete solo: todo queda en la bandeja para que una persona lo revise y lo acepte.
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
    .select("id, estado, tipo, datos")
    .eq("organizacion_id", org)
    .eq("huella", huella)
    .maybeSingle();
  const ia = hayIA();
  let huerfano = false;
  if (anterior) {
    const d = (anterior.datos ?? {}) as { venta?: unknown; facturas?: unknown[]; ingresos?: unknown[]; lector?: unknown; version_lectura?: unknown };
    // Una lectura hecha con reglas (sin IA) se repite si ahora hay IA: suele ser incompleta. Un cierre leído por una
    // versión anterior del lector tampoco se da por bueno: se vuelve a leer.
    const leido =
      (d.venta !== undefined && d.version_lectura === VERSION_LECTURA_CIERRE) ||
      (Array.isArray(d.ingresos) && d.ingresos.length > 0) ||
      (Array.isArray(d.facturas) && d.facturas.length > 0 && (d.lector === "ia" || !ia));
    huerfano = anterior.estado === "aprobado" && !(await tieneRegistros(supabase, org, anterior));
    if ((anterior.estado === "aprobado" && !huerfano) || (anterior.estado === "pendiente" && leido)) {
      await supabase.storage.from("documentos").remove([ruta]);
      return { estado: "repetido" };
    }
    // Lo que se descartó (extractos del banco, publicidad…) no vuelve solo ni gasta el cupo gratuito de la IA:
    // se recupera desde «Descartados». Los cierres de caja sí vuelven, porque se leen sin IA y suelen
    // descartarse por salir mal leídos.
    if (anterior.estado === "descartado" && anterior.tipo !== "cierre") {
      await supabase.storage.from("documentos").remove([ruta]);
      return { estado: "repetido", detalle: "Lo habías descartado antes: no lo vuelvo a traer. Si lo quieres, recupéralo en «Descartados», más abajo." };
    }
  }

  const interpretacion = await interpretarDocumento({ ...entrada, bytes });
  if ("error" in interpretacion) {
    await supabase.storage.from("documentos").remove([ruta]);
    return { error: interpretacion.error };
  }
  if ("necesitaOcr" in interpretacion) {
    await supabase.storage.from("documentos").remove([ruta]);
    return { estado: "necesitaOcr" };
  }
  const { tipo, datos } = interpretacion;

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

  let recuperado: string | false = false;
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
        .in("estado", huerfano ? ["descartado", "pendiente", "aprobado"] : ["descartado", "pendiente"]);
      if (errorRecuperar || !anterior) return { estado: "repetido" };
      if (anterior.estado === "descartado") recuperado = "Lo habías descartado: lo he vuelto a poner en la bandeja.";
      else if (anterior.estado === "pendiente") recuperado = "Estaba leído con una versión anterior del lector: lo he vuelto a leer.";
      else if (huerfano) recuperado = "Estaba dado por metido, pero ya no hay nada suyo en tus cuentas: lo he vuelto a poner en la bandeja.";
    } else if (error.code === "42501") {
      return { error: "No tienes permiso para subir documentos." };
    } else {
      return { error: "No se pudo guardar el documento. Inténtalo de nuevo." };
    }
  }

  revalidatePath(`/n/${org}/bandeja`);

  // Nada se mete solo: ni facturas ni cierres. Una persona revisa y acepta cada cosa en la Bandeja.
  const detalle = [recuperado, interpretacion.detalle].filter(Boolean).join(" ");
  return { estado: "pendiente", ...(detalle && { detalle }) };
}

// ¿Tiene datos leídos de verdad (cifras del cierre, facturas o ingresos) y no solo un aviso?
function traeLectura(datos: unknown): boolean {
  const d = (datos ?? {}) as { venta?: unknown; facturas?: unknown; ingresos?: unknown };
  return d.venta !== undefined || (Array.isArray(d.facturas) && d.facturas.length > 0) || (Array.isArray(d.ingresos) && d.ingresos.length > 0);
}

// Vuelve a leer un documento que ya está guardado (pendiente o descartado) con el lector actual y lo
// deja pendiente en la bandeja con lo leído. No hace falta pasar otra vez por el correo.
export async function releerDocumento(entrada: { org: string; id: string; tiempoIaMs?: number }): Promise<ResultadoSubida> {
  const { org, id } = entrada;
  if (!UUID.test(org) || !UUID.test(id)) return { error: "Algo ha ido mal. Recarga la página e inténtalo de nuevo." };

  const supabase = await crearClienteServidor();
  const { data: fila } = await supabase
    .from("documentos_entrantes")
    .select("id, archivo_ruta, archivo_tipo, datos")
    .eq("id", id)
    .eq("organizacion_id", org)
    .in("estado", ["pendiente", "descartado"])
    .maybeSingle();
  if (!fila) return { error: "Este documento ya no se puede volver a leer: recarga la página." };

  const descarga = await supabase.storage.from("documentos").download(fila.archivo_ruta);
  if (descarga.error || !descarga.data) return { error: "No se pudo abrir el archivo guardado." };
  const bytes = new Uint8Array(await descarga.data.arrayBuffer());

  const interpretacion = await interpretarDocumento({ bytes, tipoArchivo: fila.archivo_tipo, ocrHecho: true, tiempoIaMs: entrada.tiempoIaMs ?? 45_000 });
  if ("error" in interpretacion) return { error: interpretacion.error };
  if ("necesitaOcr" in interpretacion) {
    return { error: "Este archivo es una foto o un escaneo y no tengo con qué leerlo ahora. Escribe los datos mirando el documento." };
  }
  // Si ya había algo leído y esta vez no sale nada, se queda como estaba: volver a leer no debe borrar lo que se tenía.
  if (traeLectura(fila.datos) && !traeLectura(interpretacion.datos)) {
    return { error: "No he podido leerlo esta vez, así que se queda como estaba. Inténtalo de nuevo en unos minutos." };
  }

  const { error } = await supabase
    .from("documentos_entrantes")
    .update({ estado: "pendiente", revisado_en: null, revisado_por: null, tipo: interpretacion.tipo, datos: interpretacion.datos as never })
    .eq("id", id)
    .eq("organizacion_id", org)
    .in("estado", ["pendiente", "descartado"]);
  if (error) return { error: "No se pudo guardar lo leído. Inténtalo de nuevo." };

  revalidatePath(`/n/${org}/bandeja`);
  return { estado: "pendiente", ...(interpretacion.detalle && { detalle: interpretacion.detalle }) };
}
