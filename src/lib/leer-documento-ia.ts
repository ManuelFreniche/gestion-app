import { esFecha } from "./cierre";
import { CATEGORIAS, type Categoria, type FacturaDatos, type LineaFactura } from "./factura";
import { imagenPequena, jsonDeTexto, motivoHttp, ticketDesdeRespuesta } from "./leer-ticket-ia";
import type { TicketCierre } from "./ticket-cierre";

// Lee con IA un documento entero (texto del PDF o fotos de sus páginas) y devuelve, de una vez,
// si es un ticket de cierre o una o varias facturas con sus líneas de producto.
// Solo se usa en el servidor: las claves nunca llegan al navegador.

const MODELO_CLAUDE = "claude-haiku-4-5-20251001";
const MODELO_NVIDIA_TEXTO = "meta/llama-3.3-70b-instruct";
const MODELO_NVIDIA_VISION = "meta/llama-3.2-90b-vision-instruct";
const MAX_FACTURAS = 30;
const MAX_LINEAS = 80;

export type EntradaIA = { texto: string; imagenes: string[] }; // imágenes: JPEG en base64
export type DocumentoIA = { tipo: "ticket_cierre" | "facturas" | "otro"; ticket: TicketCierre | null; facturas: FacturaDatos[] };
export type LecturaDocumento = { documento: DocumentoIA | null; motivo?: string };

export function hayIA(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.NVIDIA_API_KEY);
}

const DESCRIPCION = `Esto es un documento de un negocio (una heladería/obrador) en España. Puede ser:
- "ticket_cierre": el ticket "Estado de la caja" de cierre del día. Da en "ticket": venta (Total Tickets + Total Facturas), efectivo, banco (tarjeta) y fecha (aaaa-mm-dd solo si se ve claro).
- "facturas": una o VARIAS facturas o albaranes de proveedores (un mismo archivo puede traer muchas, una por página o seguidas). Devuelve UNA entrada por cada factura o albarán distinto.
- "otro": cualquier otra cosa.
Para cada factura: proveedor (quien vende, NO el cliente; Alpino's / Manuel Freniche es el cliente), numero, fecha (aaaa-mm-dd), base_imponible, total (con IVA, el importe a pagar), categoria (Materia prima: alimentos y bebidas para vender o elaborar; Suministros: material, envases, limpieza, luz, agua; Alquiler; Nóminas; Otros) y lineas.
Cada línea: descripcion (producto, corta), cantidad, unidad (ud, kg, l, caja…), precio_unitario (sin IVA, por unidad, como figura en la factura) e importe (de la línea, sin IVA).
Importes como números con punto decimal. Si un dato no se ve con claridad, pon null. No inventes nada. Si no hay líneas legibles, deja lineas vacío.`;

const ESQUEMA = {
  type: "object",
  properties: {
    tipo: { type: "string", enum: ["ticket_cierre", "facturas", "otro"] },
    ticket: {
      type: ["object", "null"],
      properties: {
        venta: { type: ["number", "null"] },
        efectivo: { type: ["number", "null"] },
        banco: { type: ["number", "null"] },
        fecha: { type: ["string", "null"] },
      },
    },
    facturas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          proveedor: { type: ["string", "null"] },
          numero: { type: ["string", "null"] },
          fecha: { type: ["string", "null"] },
          base_imponible: { type: ["number", "null"] },
          total: { type: ["number", "null"] },
          categoria: { type: "string", enum: [...CATEGORIAS] },
          lineas: {
            type: "array",
            items: {
              type: "object",
              properties: {
                descripcion: { type: "string" },
                cantidad: { type: ["number", "null"] },
                unidad: { type: ["string", "null"] },
                precio_unitario: { type: ["number", "null"] },
                importe: { type: ["number", "null"] },
              },
              required: ["descripcion", "importe"],
            },
          },
        },
        required: ["proveedor", "fecha", "total", "lineas"],
      },
    },
  },
  required: ["tipo", "facturas"],
};

function numero(v: unknown, max = 1_000_000): number | undefined {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v < max ? Math.round(v * 10_000) / 10_000 : undefined;
}
const dinero = (v: unknown) => {
  const n = numero(v);
  return n === undefined ? undefined : Math.round(n * 100) / 100;
};
function texto(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.replace(/\s+/g, " ").trim().slice(0, max);
  return t || undefined;
}

// Convierte lo que devuelve el modelo en un documento validado.
export function documentoDesdeRespuesta(entrada: unknown): DocumentoIA | null {
  if (typeof entrada !== "object" || entrada === null) return null;
  const datos = entrada as Record<string, unknown>;
  const ticket = ticketDesdeRespuesta(datos.ticket);
  const facturas: FacturaDatos[] = [];
  for (const bruta of Array.isArray(datos.facturas) ? datos.facturas.slice(0, MAX_FACTURAS) : []) {
    if (typeof bruta !== "object" || bruta === null) continue;
    const f = bruta as Record<string, unknown>;
    const lineas: LineaFactura[] = [];
    for (const l of Array.isArray(f.lineas) ? f.lineas.slice(0, MAX_LINEAS) : []) {
      if (typeof l !== "object" || l === null) continue;
      const fila = l as Record<string, unknown>;
      const descripcion = texto(fila.descripcion, 200);
      const importe = dinero(fila.importe);
      if (!descripcion || importe === undefined) continue;
      const cantidad = numero(fila.cantidad, 1_000_000_000);
      const unidad = texto(fila.unidad, 20);
      const precio = numero(fila.precio_unitario);
      lineas.push({
        descripcion,
        importe,
        ...(cantidad !== undefined && { cantidad }),
        ...(unidad && { unidad }),
        ...(precio !== undefined && { precio_unitario: precio }),
      });
    }
    const proveedor = texto(f.proveedor, 120);
    const numeroFactura = texto(f.numero, 60);
    const fecha = typeof f.fecha === "string" && esFecha(f.fecha) ? f.fecha : undefined;
    const total = dinero(f.total);
    const base = dinero(f.base_imponible);
    if (!proveedor && total === undefined && lineas.length === 0) continue;
    const categoria = (CATEGORIAS as readonly string[]).includes(String(f.categoria)) ? (f.categoria as Categoria) : "Otros";
    facturas.push({
      ...(proveedor && { proveedor }),
      ...(numeroFactura && { numero: numeroFactura }),
      ...(fecha && { fecha }),
      ...(total !== undefined && { importe: total }),
      ...(base !== undefined && { base }),
      categoria,
      lineas,
    });
  }
  const tipo = datos.tipo === "ticket_cierre" && ticket ? "ticket_cierre" : facturas.length ? "facturas" : "otro";
  return { tipo, ticket: tipo === "ticket_cierre" ? ticket : null, facturas: tipo === "facturas" ? facturas : [] };
}

async function conClaude(entrada: EntradaIA, clave: string, ms: number): Promise<LecturaDocumento> {
  const contenido: unknown[] = entrada.imagenes.map((data) => ({
    type: "image",
    source: { type: "base64", media_type: "image/jpeg", data },
  }));
  contenido.push({
    type: "text",
    text: `${DESCRIPCION}${entrada.texto.trim() ? `\n\nTexto extraído del documento (puede tener errores de lectura):\n"""\n${entrada.texto.slice(0, 20_000)}\n"""` : ""}`,
  });
  try {
    const respuesta = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": clave, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: process.env.CLAUDE_MODELO || MODELO_CLAUDE,
        max_tokens: 8000,
        tools: [{ name: "registrar_documento", description: "Registra lo leído del documento.", input_schema: ESQUEMA }],
        tool_choice: { type: "tool", name: "registrar_documento" },
        messages: [{ role: "user", content: contenido }],
      }),
      signal: AbortSignal.timeout(ms),
    });
    if (!respuesta.ok) return { documento: null, motivo: await motivoHttp("Claude", respuesta) };
    const cuerpo = (await respuesta.json()) as { content?: { type: string; input?: unknown }[] };
    const documento = documentoDesdeRespuesta(cuerpo.content?.find((c) => c.type === "tool_use")?.input);
    return { documento };
  } catch (e) {
    return { documento: null, motivo: `No se pudo consultar a Claude (${e instanceof Error ? e.message.slice(0, 80) : "error"}).` };
  }
}

async function conNvidia(entrada: EntradaIA, clave: string, ms: number): Promise<LecturaDocumento> {
  try {
    const conImagen = entrada.imagenes.length > 0 && entrada.texto.trim().length < 300;
    const contenido: unknown[] = [
      {
        type: "text",
        text: `${DESCRIPCION}\n\nResponde SOLO con un JSON con esta forma: {"tipo": "ticket_cierre"|"facturas"|"otro", "ticket": {"venta","efectivo","banco","fecha"}|null, "facturas": [{"proveedor","numero","fecha","base_imponible","total","categoria","lineas":[{"descripcion","cantidad","unidad","precio_unitario","importe"}]}]}${
          entrada.texto.trim() ? `\n\nTexto extraído del documento:\n"""\n${entrada.texto.slice(0, 12_000)}\n"""` : ""
        }`,
      },
    ];
    if (conImagen) {
      for (const base64 of entrada.imagenes.slice(0, 2)) {
        const pequena = await imagenPequena(new Uint8Array(Buffer.from(base64, "base64")));
        if (pequena) contenido.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${pequena}` } });
      }
    }
    const respuesta = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${clave}` },
      body: JSON.stringify({
        model: process.env.NVIDIA_MODELO || (conImagen ? MODELO_NVIDIA_VISION : MODELO_NVIDIA_TEXTO),
        max_tokens: 4000,
        temperature: 0,
        messages: [{ role: "user", content: conImagen ? contenido : (contenido[0] as { text: string }).text }],
      }),
      signal: AbortSignal.timeout(ms),
    });
    if (!respuesta.ok) return { documento: null, motivo: await motivoHttp("NVIDIA", respuesta) };
    const cuerpo = (await respuesta.json()) as { choices?: { message?: { content?: string } }[] };
    return { documento: documentoDesdeRespuesta(jsonDeTexto(cuerpo.choices?.[0]?.message?.content ?? "")) };
  } catch (e) {
    return { documento: null, motivo: `No se pudo consultar a NVIDIA (${e instanceof Error ? e.message.slice(0, 80) : "error"}).` };
  }
}

// Con clave de Claude se usa Claude (rápido y fiable con tablas); si no, NVIDIA.
export async function leerDocumentoConIA(entrada: EntradaIA, ms = 45_000): Promise<LecturaDocumento> {
  const claude = process.env.ANTHROPIC_API_KEY;
  const nvidia = process.env.NVIDIA_API_KEY;
  if (!claude && !nvidia) return { documento: null };
  if (claude) {
    const lectura = await conClaude(entrada, claude, ms);
    if (lectura.documento || !nvidia) return lectura;
    const otra = await conNvidia(entrada, nvidia, ms);
    return otra.documento ? otra : { documento: null, motivo: [lectura.motivo, otra.motivo].filter(Boolean).join(" ") };
  }
  return conNvidia(entrada, nvidia as string, ms);
}
