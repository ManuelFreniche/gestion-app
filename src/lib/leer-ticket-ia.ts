import { esFecha, leerImporteConSigno } from "./cierre";
import type { TicketCierre } from "./ticket-cierre";

// Utilidades para interpretar las respuestas de los modelos de IA (ver leer-documento-ia.ts).

// Un número como lo devuelve el modelo: 12.5, "12.5", "1.234,56", "331,80 €" o "(121,00)" (negativo).
// Lo que no se entiende es null, no 0.
export function numeroFlexible(valor: unknown): number | null {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  if (typeof valor !== "string") return null;
  const t = valor.trim();
  const entreParentesis = /^\(\s*([^()]+?)\s*\)$/.exec(t);
  // "0.500" es medio (una cantidad), no quinientos: con cero delante, el punto es decimal.
  const decimalConCero = /^(-?0)\.(\d{3})$/.exec(t);
  const n = decimalConCero ? Number(`${decimalConCero[1]}.${decimalConCero[2]}`) : leerImporteConSigno(entreParentesis ? entreParentesis[1] : t);
  if (n === null || !Number.isFinite(n)) return null;
  return entreParentesis && n > 0 ? -n : n;
}

// Una fecha como la devuelve el modelo: "2026-08-28" o "28/08/2026" (también con guiones o puntos y año de
// dos cifras). Devuelve aaaa-mm-dd, o null si no es una fecha de verdad.
export function fechaFlexible(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const t = valor.trim();
  if (esFecha(t)) return fechaReal(t) ? t : null;
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(t);
  if (!m) return null;
  const anio = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const iso = `${anio}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return fechaReal(iso) ? iso : null;
}

// Descarta días que no existen (31 de febrero).
function fechaReal(iso: string): boolean {
  const d = new Date(`${iso}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

function importe(valor: unknown): number | null {
  const n = numeroFlexible(valor);
  return n !== null && n >= 0 && n < 1_000_000 ? Math.round(n * 100) / 100 : null;
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
    fecha: fechaFlexible(datos.fecha),
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
    detalle = String(bruto).replace(/\s+/g, " ").slice(0, 200);
  } catch {
    // Sin detalle.
  }
  return `${proveedor} respondió ${respuesta.status}${detalle ? `: ${detalle}` : ""}.`;
}
