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

export async function leerTicketConIA(bytes: Uint8Array, tipo: string): Promise<TicketCierre | null> {
  const clave = process.env.ANTHROPIC_API_KEY;
  if (!clave || !TIPOS_LEIBLES_POR_IA.includes(tipo) || bytes.length > MAX_BYTES) return null;

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
    if (!respuesta.ok) return null;
    const cuerpo = (await respuesta.json()) as { content?: { type: string; input?: unknown }[] };
    return ticketDesdeRespuesta(cuerpo.content?.find((c) => c.type === "tool_use")?.input);
  } catch {
    return null;
  }
}
