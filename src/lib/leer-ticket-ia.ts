import { esFecha } from "./cierre";
import type { TicketCierre } from "./ticket-cierre";

// Utilidades para interpretar las respuestas de los modelos de IA (ver leer-documento-ia.ts).

function importe(valor: unknown): number | null {
  return typeof valor === "number" && Number.isFinite(valor) && valor >= 0 && valor < 1_000_000
    ? Math.round(valor * 100) / 100
    : null;
}

// Convierte lo que devuelve el modelo en un ticket validado (o null si no hay venta).
export function ticketDesdeRespuesta(entrada: unknown): TicketCierre | null {
  if (typeof entrada !== "object" || entrada === null) return null;
  const datos = entrada as Record<string, unknown>;
  const venta = importe(datos.venta);
  if (venta === null) return null;
  return {
    venta,
    efectivo: importe(datos.efectivo),
    banco: importe(datos.banco),
    ticketMedio: null,
    fecha: typeof datos.fecha === "string" && esFecha(datos.fecha) ? datos.fecha : null,
  };
}

// La API de NVIDIA limita las imágenes en línea (~180.000 caracteres en base64).
const MAX_BASE64_NVIDIA = 170_000;

export async function imagenPequena(bytes: Uint8Array): Promise<string | null> {
  const { default: sharp } = await import("sharp");
  for (const [lado, calidad] of [[1400, 75], [1000, 65], [800, 55]]) {
    const jpg = await sharp(bytes).rotate().resize(lado, lado, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: calidad }).toBuffer();
    const base64 = jpg.toString("base64");
    if (base64.length <= MAX_BASE64_NVIDIA) return base64;
  }
  return null;
}

// Extrae el primer objeto JSON del texto que devuelve el modelo.
export function jsonDeTexto(texto: string): unknown {
  const inicio = texto.indexOf("{");
  const fin = texto.lastIndexOf("}");
  if (inicio < 0 || fin <= inicio) return null;
  try {
    return JSON.parse(texto.slice(inicio, fin + 1));
  } catch {
    return null;
  }
}

// Resumen corto del error que devuelve una API, sin datos sensibles.
export async function motivoHttp(proveedor: string, respuesta: Response): Promise<string> {
  let detalle = "";
  try {
    const texto = await respuesta.text();
    const json = jsonDeTexto(texto) as { error?: { message?: string } | string; detail?: string; message?: string } | null;
    const bruto = typeof json?.error === "string" ? json.error : (json?.error?.message ?? json?.detail ?? json?.message ?? texto);
    detalle = String(bruto).replace(/\s+/g, " ").slice(0, 120);
  } catch {
    // Sin detalle.
  }
  return `${proveedor} respondió ${respuesta.status}${detalle ? `: ${detalle}` : ""}.`;
}
