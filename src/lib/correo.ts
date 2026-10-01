import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { registrarDocumento } from "./registrar-documento";

// Lee el buzón de Gmail del negocio por IMAP con una contraseña de aplicación (la misma idea que
// el robot de la app antigua). Cada correo con adjuntos se lee una sola vez: al terminar se le pone
// la etiqueta "gestion-leido" en Gmail, y así se ve qué ha mirado la app y no se repite nada.
// Los adjuntos pasan por el mismo camino que una subida a mano, así que nada entra en las cuentas
// sin que una persona lo revise en la Bandeja (salvo el ticket de cierre, como siempre).

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

// Se queda con los PDF y las fotos que pueden ser una factura o un ticket.
export function adjuntosAprovechables(adjuntos: AdjuntoBruto[]): AdjuntoCorreo[] {
  const salida: AdjuntoCorreo[] = [];
  for (const a of adjuntos) {
    let tipo = a.contentType.toLowerCase();
    if (tipo === "application/octet-stream" && /\.pdf$/i.test(a.filename ?? "")) tipo = "application/pdf";
    if (!EXTENSION[tipo] || a.size > MAX_BYTES || a.size === 0) continue;
    if (tipo !== "application/pdf" && (a.related || a.size < MIN_BYTES_IMAGEN)) continue;
    salida.push({ nombre: a.filename || `adjunto.${EXTENSION[tipo]}`, tipo, bytes: new Uint8Array(a.content) });
  }
  return salida;
}

export type ResultadoCorreo = {
  error?: string;
  nuevos: number; // documentos que han llegado a la Bandeja o al cierre
  repetidos: number;
  sinLeer: number;
  quedan: number; // correos por mirar en la siguiente vuelta
  cursor?: number; // desde dónde seguir en la siguiente vuelta (solo si quedan)
};

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

export async function revisarCorreo(
  supabase: SupabaseClient,
  config: ConfigCorreo,
  presupuestoMs = 40_000,
  tramo?: Tramo,
  antesDe?: number,
): Promise<ResultadoCorreo> {
  const resultado: ResultadoCorreo = { nuevos: 0, repetidos: 0, sinLeer: 0, quedan: 0 };
  const limite = Date.now() + presupuestoMs;
  const cliente = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: config.usuario, pass: config.clave },
    logger: false,
  });
  // Sin este escuchador, un corte de conexión tumba todo el proceso.
  cliente.on("error", () => {});

  try {
    await cliente.connect();
  } catch (e) {
    const rechazado = (e as { authenticationFailed?: boolean }).authenticationFailed;
    return {
      ...resultado,
      error: rechazado
        ? "Gmail no acepta el usuario o la contraseña de aplicación. Revisa GMAIL_USUARIO y GMAIL_CLAVE_APP."
        : "No se pudo conectar con Gmail. Inténtalo de nuevo en un rato.",
    };
  }

  const bloqueo = await cliente.getMailboxLock("INBOX");
  try {
    // Gmail cuenta los días a su manera (zona horaria): se pide un día de margen a cada lado y luego
    // se comprueba el día exacto de cada correo.
    const fechas = tramo
      ? `after:${sumarDias(tramo.desde, -1).replaceAll("-", "/")} before:${sumarDias(tramo.hasta, 2).replaceAll("-", "/")}`
      : `newer_than:${config.dias}d`;
    // Al buscar un tramo a propósito se vuelven a mirar también los correos ya revisados: lo que ya
    // está guardado se ignora solo, y lo que no se pudo leer o se descartó vuelve a la Bandeja.
    const consulta = `has:attachment ${fechas}${tramo ? "" : ` -label:${ETIQUETA_LEIDO}`}${config.etiqueta ? ` label:${config.etiqueta}` : ""}`;
    const todos = ((await cliente.search({ gmailraw: consulta }, { uid: true })) || []).sort((a, b) => b - a);
    // De más nuevo a más viejo; cada vuelta sigue donde acabó la anterior, así no se repite trabajo.
    const uids = antesDe ? todos.filter((u) => u < antesDe) : todos;
    let hechos = 0;
    let ultimo = 0;
    for (const uid of uids) {
      if (Date.now() > limite) break;
      hechos++;
      ultimo = uid;
      const mensaje = await cliente.fetchOne(String(uid), { source: true }, { uid: true });
      if (!mensaje || !mensaje.source) continue;
      const analizado = await simpleParser(mensaje.source);
      if (tramo && analizado.date) {
        const dia = diaEnEspana(analizado.date);
        if (dia < tramo.desde || dia > tramo.hasta) continue; // fuera del tramo: ni se lee ni se marca
      }
      let completo = true;
      for (const adjunto of adjuntosAprovechables(analizado.attachments)) {
        const ruta = `${config.organizacion}/${randomUUID()}.${EXTENSION[adjunto.tipo]}`;
        const subida = await supabase.storage.from("documentos").upload(ruta, adjunto.bytes, { contentType: adjunto.tipo });
        if (subida.error) {
          resultado.sinLeer++;
          completo = false;
          continue;
        }
        const r = await registrarDocumento({
          org: config.organizacion,
          ruta,
          nombre: adjunto.nombre,
          tipoArchivo: adjunto.tipo,
          origen: "correo",
          tiempoIaMs: 45_000,
        });
        if (r.estado === "repetido") resultado.repetidos++;
        else if (r.estado === "metido" || r.estado === "pendiente") resultado.nuevos++;
        else {
          // Error o sin lector: el correo se volverá a mirar en la próxima revisión.
          resultado.sinLeer++;
          completo = false;
        }
      }
      if (completo) await cliente.messageFlagsAdd({ uid: String(uid) }, [ETIQUETA_LEIDO], { uid: true, useLabels: true });
    }
    resultado.quedan = uids.length - hechos;
    if (resultado.quedan > 0) resultado.cursor = ultimo;
  } catch {
    return { ...resultado, error: "Se cortó la lectura del correo. Inténtalo de nuevo." };
  } finally {
    bloqueo.release();
    await cliente.logout().catch(() => {});
  }
  return resultado;
}
