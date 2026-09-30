import { esFecha } from "./cierre";
import type { TicketCierre } from "./ticket-cierre";

// Lee con Claude un ticket de cierre que no se puede leer como texto (foto, captura o PDF escaneado).
// Solo se usa en el servidor: la clave nunca llega al navegador.

const MODELO = "claude-haiku-4-5-20251001";
const MAX_BYTES = 5 * 1024 * 1024; // límite de imagen de la API

export const TIPOS_LEIBLES_POR_IA = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

const PROMPT = `Esto es el ticket "Estado de la caja" de cierre del día de un negocio, del programa de caja.
Extrae estos importes en euros, como números con punto decimal:
- venta: Total Tickets + Total Facturas (todo lo vendido en el día).
- efectivo: Tickets Efectivo + Facturas Efectivo.
- banco: Tickets Banco (tarjeta) + Facturas Banco.
- fecha: solo si el ticket muestra claramente el día de las ventas (aaaa-mm-dd); si no, null.
Si un dato no se ve con claridad, pon null. No inventes números.`;

const HERRAMIENTA = {
  name: "registrar_cierre",
  description: "Registra los importes leídos del ticket de cierre.",
  input_schema: {
    type: "object",
    properties: {
      venta: { type: ["number", "null"] },
      efectivo: { type: ["number", "null"] },
      banco: { type: ["number", "null"] },
      fecha: { type: ["string", "null"] },
    },
    required: ["venta", "efectivo", "banco", "fecha"],
  },
};

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

// Modelo de visión gratuito de NVIDIA (build.nvidia.com). Se puede cambiar con NVIDIA_MODELO.
const MODELO_NVIDIA = "meta/llama-3.2-90b-vision-instruct";
// La API de NVIDIA limita las imágenes en línea (~180.000 caracteres en base64).
const MAX_BASE64_NVIDIA = 170_000;

async function imagenPequena(bytes: Uint8Array): Promise<string | null> {
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

export type LecturaIA = { ticket: TicketCierre | null; motivo?: string };

// Resumen corto del error que devuelve una API, sin datos sensibles.
async function motivoHttp(proveedor: string, respuesta: Response): Promise<string> {
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

async function leerConNvidia(bytes: Uint8Array, tipo: string, clave: string): Promise<LecturaIA> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(tipo)) {
    return { ticket: null, motivo: "NVIDIA solo lee imágenes, no PDFs." };
  }
  try {
    const imagen = await imagenPequena(bytes);
    if (!imagen) return { ticket: null, motivo: "La imagen es demasiado grande para NVIDIA." };
    const respuesta = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${clave}` },
      body: JSON.stringify({
        model: process.env.NVIDIA_MODELO || MODELO_NVIDIA,
        max_tokens: 300,
        temperature: 0,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `${PROMPT}\nResponde solo con un JSON: {"venta": number|null, "efectivo": number|null, "banco": number|null, "fecha": string|null}`,
              },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imagen}` } },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(40_000),
    });
    if (!respuesta.ok) return { ticket: null, motivo: await motivoHttp("NVIDIA", respuesta) };
    const cuerpo = (await respuesta.json()) as { choices?: { message?: { content?: string } }[] };
    const ticket = ticketDesdeRespuesta(jsonDeTexto(cuerpo.choices?.[0]?.message?.content ?? ""));
    return ticket ? { ticket } : { ticket: null, motivo: "NVIDIA no encontró la venta en la imagen." };
  } catch (e) {
    return { ticket: null, motivo: `No se pudo consultar a NVIDIA (${e instanceof Error ? e.message.slice(0, 80) : "error"}).` };
  }
}

async function leerConClaude(bytes: Uint8Array, tipo: string, clave: string): Promise<LecturaIA> {
  if (!TIPOS_LEIBLES_POR_IA.includes(tipo)) return { ticket: null, motivo: "Tipo de archivo no compatible." };
  if (bytes.length > MAX_BYTES) return { ticket: null, motivo: "El archivo pesa más de 5 MB." };

  const contenido = {
    type: tipo === "application/pdf" ? "document" : "image",
    source: { type: "base64", media_type: tipo, data: Buffer.from(bytes).toString("base64") },
  };

  try {
    const respuesta = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": clave, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 300,
        tools: [HERRAMIENTA],
        tool_choice: { type: "tool", name: HERRAMIENTA.name },
        messages: [{ role: "user", content: [contenido, { type: "text", text: PROMPT }] }],
      }),
      signal: AbortSignal.timeout(40_000),
    });
    if (!respuesta.ok) return { ticket: null, motivo: await motivoHttp("Claude", respuesta) };
    const cuerpo = (await respuesta.json()) as { content?: { type: string; input?: unknown }[] };
    const ticket = ticketDesdeRespuesta(cuerpo.content?.find((c) => c.type === "tool_use")?.input);
    return ticket ? { ticket } : { ticket: null, motivo: "Claude no encontró la venta en el archivo." };
  } catch (e) {
    return { ticket: null, motivo: `No se pudo consultar a Claude (${e instanceof Error ? e.message.slice(0, 80) : "error"}).` };
  }
}

export async function leerTicketConIA(bytes: Uint8Array, tipo: string): Promise<LecturaIA> {
  // Con clave de NVIDIA (gratis) se usa primero; si no lee nada, se prueba con Claude si hay clave.
  const nvidia = process.env.NVIDIA_API_KEY;
  const claude = process.env.ANTHROPIC_API_KEY;
  if (!nvidia && !claude) {
    return { ticket: null, motivo: "Falta la clave NVIDIA_API_KEY en Vercel (y volver a desplegar para que la use)." };
  }
  let motivo: string | undefined;
  if (nvidia) {
    const lectura = await leerConNvidia(bytes, tipo, nvidia);
    if (lectura.ticket) return lectura;
    motivo = lectura.motivo;
  }
  if (claude) {
    const lectura = await leerConClaude(bytes, tipo, claude);
    return lectura.ticket ? lectura : { ticket: null, motivo: [motivo, lectura.motivo].filter(Boolean).join(" ") };
  }
  return { ticket: null, motivo };
}
