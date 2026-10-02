import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { registrarDocumento } from "./registrar-documento";

// Lee el buzón de Gmail del negocio por IMAP con una contraseña de aplicación (la misma idea que
// el robot de la app antigua). Cada correo con adjuntos se lee una sola vez: al terminar se le pone
// la etiqueta "gestion-leido" en Gmail, y así se ve qué ha mirado la app y no se repite nada.
// Los adjuntos pasan por el mismo camino que una subida a mano, así que nada entra en las cuentas
// sin que una persona lo revise en la Bandeja.

const ETIQUETA_LEIDO = "gestion-leido";
const EXTENSION: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
};
const MAX_BYTES = 12 * 1024 * 1024;
// Las imágenes pequeñas suelen ser logos y firmas, no facturas.
const MIN_BYTES_IMAGEN = 40 * 1024;
// La ruta tiene 60 s (maxDuration): no se empieza otro correo pasado el presupuesto, y ninguna lectura
// con IA puede alargarse más allá del límite duro.
const LIMITE_DURO_MS = 54_000;
const MAX_DETALLES = 40;
// Con menos tiempo que esto no se empieza a leer otro adjunto.
const MARGEN_ADJUNTO_MS = 8_000;

export type ConfigCorreo = { usuario: string; clave: string; organizacion: string; etiqueta?: string; dias: number };

// Un buzón por ahora: el del cliente cero. Las claves viven solo en las variables de entorno del servidor.
export function configCorreo(): ConfigCorreo | null {
  const usuario = process.env.GMAIL_USUARIO?.trim();
  const clave = process.env.GMAIL_CLAVE_APP?.replace(/\s/g, "");
  const organizacion = process.env.CORREO_ORGANIZACION?.trim();
  if (!usuario || !clave || !organizacion) return null;
  const etiqueta = process.env.CORREO_ETIQUETA?.trim().replace(/[^\p{L}\p{N}_-]/gu, "-");
  const dias = Math.min(60, Math.max(1, Number(process.env.CORREO_DIAS) || 14));
  return { usuario, clave, organizacion, ...(etiqueta && { etiqueta }), dias };
}

// Para explicar en la Bandeja por qué el correo no está conectado (solo nombres, nunca valores).
export function faltanVariablesCorreo(org: string): string[] {
  const faltan = ["GMAIL_USUARIO", "GMAIL_CLAVE_APP", "CORREO_ORGANIZACION"].filter((n) => !process.env[n]?.trim());
  if (faltan.length === 0 && process.env.CORREO_ORGANIZACION?.trim() !== org) faltan.push("CORREO_ORGANIZACION (no es el id de este negocio)");
  return faltan;
}

export type AdjuntoCorreo = { nombre: string; tipo: string; bytes: Uint8Array };

type AdjuntoBruto = { filename?: string; contentType: string; size: number; content: Buffer; related?: boolean };

const TIPO_POR_EXTENSION: Record<string, string> = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic" };
const SINONIMOS: Record<string, string> = { "application/x-pdf": "application/pdf", "application/acrobat": "application/pdf", "image/jpg": "image/jpeg", "image/pjpeg": "image/jpeg" };

// El tipo real de un adjunto: no siempre es el que dice el correo (muchos programas de caja mandan el PDF
// como "application/octet-stream"), así que si el tipo no vale se mira la extensión y, por último, los
// primeros bytes del archivo.
export function tipoDelAdjunto(a: Pick<AdjuntoBruto, "filename" | "contentType" | "content">): string | null {
  const declarado = a.contentType.toLowerCase().split(";")[0].trim();
  const tipo = SINONIMOS[declarado] ?? declarado;
  if (EXTENSION[tipo]) return tipo;
  const extension = /\.([a-z0-9]+)$/i.exec(a.filename ?? "")?.[1]?.toLowerCase();
  if (extension && TIPO_POR_EXTENSION[extension] && (tipo === "application/octet-stream" || tipo === "")) return TIPO_POR_EXTENSION[extension];
  if (tipo === "application/octet-stream" || tipo === "") {
    const cabecera = a.content.subarray(0, 12);
    if (cabecera.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
    if (cabecera[0] === 0xff && cabecera[1] === 0xd8 && cabecera[2] === 0xff) return "image/jpeg";
    if (cabecera.subarray(1, 4).toString("latin1") === "PNG") return "image/png";
  }
  return null;
}

// Se queda con los PDF y las fotos que pueden ser una factura o un ticket.
export function adjuntosAprovechables(adjuntos: AdjuntoBruto[]): AdjuntoCorreo[] {
  const salida: AdjuntoCorreo[] = [];
  for (const a of adjuntos) {
    const tipo = tipoDelAdjunto(a);
    if (!tipo || a.size > MAX_BYTES || a.size === 0) continue;
    if (tipo !== "application/pdf" && (a.related || a.size < MIN_BYTES_IMAGEN)) continue;
    salida.push({ nombre: a.filename || `adjunto.${EXTENSION[tipo]}`, tipo, bytes: new Uint8Array(a.content) });
  }
  return salida;
}

// Un renglón por adjunto revisado, para que se vea qué ha pasado con cada correo.
export type DetalleCorreo = {
  correo: string; // "02/10 · Cierre de caja"
  archivo: string;
  resultado: "nuevo" | "repetido" | "fallo" | "omitido";
  nota?: string;
};

export type ResultadoCorreo = {
  error?: string;
  nuevos: number; // documentos que han llegado a la Bandeja
  repetidos: number; // ya estaban en la Bandeja o ya metidos
  sinLeer: number;
  quedan: number; // correos por mirar en la siguiente vuelta
  cursor?: number; // desde dónde seguir en la siguiente vuelta (solo si quedan)
  encontrados: number; // correos con adjuntos que Gmail ha dado para esta búsqueda
  fueraDeTramo: number; // correos de la búsqueda cuyo día no cae en el tramo pedido
  sinAdjuntos: number; // correos sin ningún PDF ni foto aprovechable
  yaRevisados?: number; // sin tramo y sin nada nuevo: correos recientes que ya se habían revisado
  detalle: DetalleCorreo[];
  version?: string;
};

export function resultadoVacio(): ResultadoCorreo {
  return { nuevos: 0, repetidos: 0, sinLeer: 0, quedan: 0, encontrados: 0, fueraDeTramo: 0, sinAdjuntos: 0, detalle: [] };
}

export type Tramo = { desde: string; hasta: string }; // aaaa-mm-dd, ambos incluidos

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

// Devuelve el tramo si es válido (fechas reales, en orden y de hasta un año), o null.
export function tramoValido(desde: unknown, hasta: unknown): Tramo | null {
  if (typeof desde !== "string" || typeof hasta !== "string" || !FECHA.test(desde) || !FECHA.test(hasta)) return null;
  const d = new Date(`${desde}T00:00:00Z`);
  const h = new Date(`${hasta}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || Number.isNaN(h.getTime()) || d.toISOString().slice(0, 10) !== desde || h.toISOString().slice(0, 10) !== hasta) return null;
  const dias = (h.getTime() - d.getTime()) / 86_400_000;
  return dias >= 0 && dias <= 366 ? { desde, hasta } : null;
}

const sumarDias = (iso: string, dias: number) => new Date(new Date(`${iso}T00:00:00Z`).getTime() + dias * 86_400_000).toISOString().slice(0, 10);

// Día del correo en hora de España, para comparar con el tramo elegido.
const diaEnEspana = (fecha: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(fecha);

const diaCorto = (fecha: Date) => diaEnEspana(fecha).slice(5).split("-").reverse().join("/");

// Lo que se le pide a Gmail. Gmail cuenta los días a su manera (zona horaria): con un tramo se pide un
// día de margen a cada lado y luego se comprueba el día exacto de cada correo. Con un tramo se vuelven
// a mirar también los correos ya revisados: lo que ya está guardado se ignora solo, y lo que no se pudo
// leer o se descartó vuelve a la Bandeja.
export function consultaGmail(config: Pick<ConfigCorreo, "dias" | "etiqueta">, tramo?: Tramo): string {
  const fechas = tramo
    ? `after:${sumarDias(tramo.desde, -1).replaceAll("-", "/")} before:${sumarDias(tramo.hasta, 2).replaceAll("-", "/")}`
    : `newer_than:${config.dias}d`;
  return `has:attachment ${fechas}${tramo ? "" : ` -label:${ETIQUETA_LEIDO}`}${config.etiqueta ? ` label:${config.etiqueta}` : ""}`;
}

const motivoDe = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 160);

export async function revisarCorreo(
  supabase: SupabaseClient,
  config: ConfigCorreo,
  presupuestoMs = 40_000,
  tramo?: Tramo,
  antesDe?: number,
): Promise<ResultadoCorreo> {
  const resultado = resultadoVacio();
  const inicio = Date.now();
  const limite = inicio + presupuestoMs;
  const limiteDuro = inicio + LIMITE_DURO_MS;
  const anotar = (d: DetalleCorreo) => {
    if (resultado.detalle.length < MAX_DETALLES) {
      resultado.detalle.push(d);
      return;
    }
    // Lleno: lo que importa (fallos y archivos que no se leen) desplaza al último renglón corriente.
    if (d.resultado === "fallo" || d.resultado === "omitido") {
      const corriente = resultado.detalle.findLastIndex((x) => x.resultado === "nuevo" || x.resultado === "repetido");
      if (corriente >= 0) resultado.detalle.splice(corriente, 1, d);
    }
  };
  const cliente = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: config.usuario, pass: config.clave },
    logger: false,
    // Si Gmail no contesta, mejor decirlo pronto que dejar la pantalla esperando hasta que se corte sola.
    connectionTimeout: 15_000,
    greetingTimeout: 12_000,
    socketTimeout: 30_000,
  });
  // Sin este escuchador, un corte de conexión tumba todo el proceso.
  cliente.on("error", () => {});

  try {
    await cliente.connect();
  } catch (e) {
    const rechazado = (e as { authenticationFailed?: boolean }).authenticationFailed;
    cliente.close();
    return {
      ...resultado,
      error: rechazado
        ? "Gmail no acepta el usuario o la contraseña de aplicación. Revisa GMAIL_USUARIO y GMAIL_CLAVE_APP."
        : `No se pudo conectar con Gmail (${motivoDe(e)}). Inténtalo de nuevo en un rato.`,
    };
  }

  let bloqueo: Awaited<ReturnType<ImapFlow["getMailboxLock"]>>;
  try {
    bloqueo = await cliente.getMailboxLock("INBOX");
  } catch (e) {
    await cliente.logout().catch(() => cliente.close());
    return { ...resultado, error: `No se pudo abrir la bandeja de entrada de Gmail (${motivoDe(e)}). Inténtalo de nuevo en un rato.` };
  }

  // Sin etiqueta, el correo se repasa otra vez: lo ya guardado se ignora solo.
  const etiquetarLeido = async (uid: number) => {
    try {
      await cliente.messageFlagsAdd({ uid: String(uid) }, [ETIQUETA_LEIDO], { uid: true, useLabels: true });
    } catch {
      // Es solo para no repetir trabajo.
    }
  };

  try {
    const consulta = consultaGmail(config, tramo);
    const encontradosGmail = await cliente.search({ gmailraw: consulta }, { uid: true });
    // imapflow no lanza el error cuando Gmail rechaza la búsqueda: devuelve false. Eso no es "no hay correos".
    if (!Array.isArray(encontradosGmail)) {
      resultado.error = "Gmail no ha podido hacer la búsqueda de correos. Inténtalo de nuevo en un rato.";
      return resultado;
    }
    const todos = [...encontradosGmail].sort((a, b) => b - a);
    resultado.encontrados = todos.length;
    if (todos.length === 0 && !tramo) {
      // Para poder decir "no hay nada nuevo porque ya lo revisé todo" y no solo "no hay nada".
      try {
        const recientes = await cliente.search({ gmailraw: `has:attachment newer_than:${config.dias}d${config.etiqueta ? ` label:${config.etiqueta}` : ""}` }, { uid: true });
        if (Array.isArray(recientes)) resultado.yaRevisados = recientes.length;
      } catch {
        // Es solo para explicar el resultado.
      }
    }
    // De más nuevo a más viejo; cada vuelta sigue donde acabó la anterior, así no se repite trabajo.
    const uids = antesDe ? todos.filter((u) => u < antesDe) : todos;
    let hechos = 0;
    let ultimo = 0;
    for (const uid of uids) {
      if (Date.now() > limite) break;
      hechos++;
      ultimo = uid;
      let etiquetaCorreo = `Correo ${uid}`;
      try {
        const mensaje = await cliente.fetchOne(String(uid), { source: true }, { uid: true });
        if (!mensaje || !mensaje.source) {
          resultado.sinLeer++;
          anotar({ correo: etiquetaCorreo, archivo: "", resultado: "fallo", nota: "Gmail no devolvió el contenido del correo." });
          // Una conexión cortada entre dos comandos no lanza error: devuelve vacío. Seguir marcaría como fallidos todos los demás.
          if (!cliente.usable) {
            resultado.error = "Se cortó la conexión con Gmail. Pulsa otra vez para seguir donde se quedó.";
            break;
          }
          continue;
        }
        const analizado = await simpleParser(mensaje.source);
        if (analizado.date) etiquetaCorreo = `${diaCorto(analizado.date)} · ${(analizado.subject ?? "(sin asunto)").slice(0, 50)}`;
        else if (analizado.subject) etiquetaCorreo = analizado.subject.slice(0, 50);
        if (tramo && analizado.date) {
          // El cierre de caja de un día suele imprimirse pasada la medianoche: su correo lleva la fecha del
          // día siguiente, así que se admite también el día después del último elegido.
          const dia = diaEnEspana(analizado.date);
          if (dia < tramo.desde || dia > sumarDias(tramo.hasta, 1)) {
            resultado.fueraDeTramo++; // ni se lee ni se marca
            continue;
          }
        }
        const adjuntos = adjuntosAprovechables(analizado.attachments);
        // Lo que no se puede leer (una hoja de Excel, un PDF enorme) no desaparece en silencio: se dice.
        for (const a of analizado.attachments.filter((x) => x.filename && !x.related).slice(0, 3)) {
          const tipo = tipoDelAdjunto(a);
          if (!tipo) {
            anotar({ correo: etiquetaCorreo, archivo: a.filename as string, resultado: "omitido", nota: "No es un PDF ni una foto: no sé leer este tipo de archivo. Si es un documento tuyo, súbelo a mano." });
          } else if (a.size > MAX_BYTES) {
            anotar({ correo: etiquetaCorreo, archivo: a.filename as string, resultado: "omitido", nota: `Pesa ${(a.size / 1024 / 1024).toFixed(0)} MB y el máximo son ${MAX_BYTES / 1024 / 1024} MB. Si lo necesitas, súbelo a mano con menos calidad.` });
          }
        }
        if (adjuntos.length === 0) {
          resultado.sinAdjuntos++;
          await etiquetarLeido(uid);
          continue;
        }
        let completo = true;
        let sinTiempo = false;
        for (const adjunto of adjuntos) {
          // Sin tiempo para leer otro adjunto antes de que la función se corte: el correo queda sin marcar y se
          // vuelve a mirar en la siguiente vuelta, que empieza con el tiempo entero.
          if (Date.now() > limiteDuro - MARGEN_ADJUNTO_MS) {
            sinTiempo = true;
            completo = false;
            anotar({ correo: etiquetaCorreo, archivo: adjunto.nombre, resultado: "fallo", nota: "Sin tiempo en esta vuelta: se leerá en la siguiente." });
            break;
          }
          const ruta = `${config.organizacion}/${randomUUID()}.${EXTENSION[adjunto.tipo]}`;
          const subida = await supabase.storage.from("documentos").upload(ruta, adjunto.bytes, { contentType: adjunto.tipo });
          if (subida.error) {
            resultado.sinLeer++;
            completo = false;
            anotar({ correo: etiquetaCorreo, archivo: adjunto.nombre, resultado: "fallo", nota: `No se pudo guardar el archivo (${subida.error.message.slice(0, 80)}).` });
            continue;
          }
          const r = await registrarDocumento({
            org: config.organizacion,
            ruta,
            nombre: adjunto.nombre,
            tipoArchivo: adjunto.tipo,
            origen: "correo",
            // Un escaneo sin texto no se queda sin entrar: llega como tarjeta para escribirla mirando el documento.
            ocrHecho: true,
            tiempoIaMs: Math.max(5_000, Math.min(45_000, limiteDuro - Date.now() - 3_000)),
          });
          if (r.estado === "repetido") {
            resultado.repetidos++;
            anotar({ correo: etiquetaCorreo, archivo: adjunto.nombre, resultado: "repetido", nota: (r.detalle ?? "Ya estaba en la Bandeja o ya metido.").slice(0, 200) });
          } else if (r.estado === "metido" || r.estado === "pendiente") {
            resultado.nuevos++;
            anotar({ correo: etiquetaCorreo, archivo: adjunto.nombre, resultado: "nuevo", ...(r.detalle && { nota: r.detalle.slice(0, 200) }) });
          } else {
            // Error o sin lector: el correo se volverá a mirar en la próxima revisión.
            resultado.sinLeer++;
            completo = false;
            anotar({ correo: etiquetaCorreo, archivo: adjunto.nombre, resultado: "fallo", nota: (r.error ?? "No se pudo leer.").slice(0, 200) });
          }
        }
        if (sinTiempo) {
          // Este correo no se ha terminado: la siguiente vuelta debe empezar por él, no después.
          hechos--;
          ultimo = uid + 1;
          break;
        }
        if (completo) await etiquetarLeido(uid);
      } catch (e) {
        // Un correo raro no debe frenar los demás; si es la conexión la que ha caído, se para.
        resultado.sinLeer++;
        anotar({ correo: etiquetaCorreo, archivo: "", resultado: "fallo", nota: motivoDe(e) });
        if (!cliente.usable) {
          resultado.error = "Se cortó la conexión con Gmail. Pulsa otra vez para seguir donde se quedó.";
          break;
        }
      }
    }
    resultado.quedan = uids.length - hechos;
    if (resultado.quedan > 0) resultado.cursor = ultimo;
  } catch (e) {
    resultado.error = `Se cortó la lectura del correo (${motivoDe(e)}). Inténtalo de nuevo.`;
  } finally {
    bloqueo.release();
    await cliente.logout().catch(() => cliente.close());
  }
  return resultado;
}
