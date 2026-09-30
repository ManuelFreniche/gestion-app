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
};

export async function revisarCorreo(
  supabase: SupabaseClient,
  config: ConfigCorreo,
  presupuestoMs = 40_000,
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
    const consulta = `has:attachment newer_than:${config.dias}d -label:${ETIQUETA_LEIDO}${config.etiqueta ? ` label:${config.etiqueta}` : ""}`;
    const uids = ((await cliente.search({ gmailraw: consulta }, { uid: true })) || []).sort((a, b) => b - a);
    let hechos = 0;
    for (const uid of uids) {
      if (Date.now() > limite) break;
      hechos++;
      const mensaje = await cliente.fetchOne(String(uid), { source: true }, { uid: true });
      if (!mensaje || !mensaje.source) continue;
      const analizado = await simpleParser(mensaje.source);
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
  } catch {
    return { ...resultado, error: "Se cortó la lectura del correo. Inténtalo de nuevo." };
  } finally {
    bloqueo.release();
    await cliente.logout().catch(() => {});
  }
  return resultado;
}
