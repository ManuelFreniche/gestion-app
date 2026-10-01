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
const MAX_INGRESOS = 366;

export type EntradaIA = {
  texto: string;
  imagenes: string[]; // páginas como JPEG en base64
  archivo?: { bytes: Uint8Array; tipo: string }; // el documento original, que Gemini lee entero
};
// Un día de una hoja de ingresos: lo vendido ese día.
// `filas` solo aparece si la hoja traía varias filas del mismo día y se han sumado.
export type IngresoDia = { fecha: string; venta: number; efectivo?: number; banco?: number; filas?: number };
// Un mismo archivo puede traer de todo: facturas y gastos (alquiler, nóminas, gasolina) por un lado
// y los ingresos por días por otro.
export type DocumentoIA = {
  tipo: "ticket_cierre" | "facturas" | "ingresos" | "mixto" | "otro";
  ticket: TicketCierre | null;
  facturas: FacturaDatos[];
  ingresos: IngresoDia[];
};
// `transitorio`: el fallo es del proveedor (límite gratuito, saturación, red), no del documento.
export type LecturaDocumento = { documento: DocumentoIA | null; motivo?: string; transitorio?: boolean; modelo?: string };

const esTransitorio = (motivo: string) => /respondió (429|500|502|503|504)|No se pudo consultar/.test(motivo);

export function hayIA(): boolean {
  return Boolean(process.env.GEMINI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.NVIDIA_API_KEY);
}

const DESCRIPCION = `Esto es un documento de un negocio (una heladería/obrador) en España. Puede traer UNA O VARIAS de estas cosas, que debes separar:
- "ticket": el ticket "Estado de la caja" de cierre de UN día. Da venta (Total Tickets + Total Facturas), efectivo, banco (tarjeta) y fecha (aaaa-mm-dd solo si se ve claro).
- "facturas": facturas, albaranes y OTROS GASTOS, una entrada por cada documento de gasto distinto:
  · facturas o albaranes de proveedores (un mismo archivo puede traer muchas, una por página o seguidas);
  · el recibo o factura del ALQUILER del local (categoria "Alquiler"; proveedor = el casero o la inmobiliaria);
  · NÓMINAS de empleados (categoria "Nóminas"; proveedor = nombre del trabajador; total = líquido a percibir);
  · tickets de GASOLINA o combustible (categoria "Gasolina"; proveedor = la gasolinera).
- "ingresos": una hoja, tabla o resumen de ingresos/ventas con VARIOS días (por ejemplo, todo un mes). Devuelve UNA entrada por día: fecha (aaaa-mm-dd; si solo ves día y mes, usa el año del documento), venta (total ingresado ese día), y efectivo y banco/tarjeta solo si la hoja los distingue. No devuelvas filas de totales ni subtotales del mes, ni días sin importe.
Si el archivo mezcla cosas (por ejemplo facturas, una nómina y la hoja de ingresos), devuelve cada una en su lista. Si no hay nada de una lista, devuélvela vacía.
El documento puede tener VARIAS PÁGINAS: lee todas. Una factura puede ocupar varias páginas (entonces es una sola entrada, con un solo total), y una página puede traer una factura entera. Nunca dejes documentos sin devolver ni mezcles dos en una entrada.
Para cada factura o gasto: proveedor (quien vende o cobra, NO el cliente; Alpino's / Manuel Freniche es el cliente), numero, fecha (aaaa-mm-dd), base_imponible, total (con IVA, el importe a pagar), categoria (Materia prima: alimentos y bebidas para vender o elaborar; Suministros: material, envases, limpieza, luz, agua; Alquiler; Nóminas; Gasolina; Otros) y lineas.
Cada línea: descripcion (producto, corta), cantidad, unidad (ud, kg, l, caja…), precio_unitario (sin IVA, por unidad, como figura en la factura) e importe (de la línea, sin IVA).
Si un documento es una factura de ABONO, rectificativa o nota de crédito (devuelve dinero), pon en NEGATIVO su total, su base y los importes de sus líneas (precio_unitario siempre positivo).
Importes como números con punto decimal. Si un dato no se ve con claridad, pon null. No inventes nada. Si no hay líneas legibles, deja lineas vacío.`;

const FORMA_JSON = `Responde SOLO con un JSON con esta forma: {"tipo": "ticket_cierre"|"facturas"|"ingresos"|"mixto"|"otro", "ticket": {"venta","efectivo","banco","fecha"}|null, "facturas": [{"proveedor","numero","fecha","base_imponible","total","categoria","lineas":[{"descripcion","cantidad","unidad","precio_unitario","importe"}]}], "ingresos": [{"fecha","venta","efectivo","banco"}]}`;

const ESQUEMA = {
  type: "object",
  properties: {
    tipo: { type: "string", enum: ["ticket_cierre", "facturas", "ingresos", "mixto", "otro"] },
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
    ingresos: {
      type: "array",
      items: {
        type: "object",
        properties: {
          fecha: { type: "string" },
          venta: { type: "number" },
          efectivo: { type: ["number", "null"] },
          banco: { type: ["number", "null"] },
        },
        required: ["fecha", "venta"],
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
// Importe de una factura o de sus líneas: en un abono sale negativo.
const dineroConSigno = (v: unknown) => {
  if (typeof v !== "number" || v >= 0) return dinero(v);
  const n = dinero(-v);
  return n === undefined ? undefined : -n;
};
function texto(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.replace(/\s+/g, " ").trim().slice(0, max);
  return t || undefined;
}

// Los días de una hoja de ingresos. Un día sin fecha válida o sin importe se descarta; si la hoja
// trae varias filas del mismo día, se suman y se avisa en `filas`.
export function ingresosDesdeRespuesta(entrada: unknown): IngresoDia[] {
  const porDia = new Map<string, IngresoDia>();
  for (const bruto of Array.isArray(entrada) ? entrada.slice(0, MAX_INGRESOS * 2) : []) {
    if (typeof bruto !== "object" || bruto === null) continue;
    const d = bruto as Record<string, unknown>;
    const venta = dinero(d.venta);
    if (typeof d.fecha !== "string" || !esFecha(d.fecha) || venta === undefined || venta <= 0) continue;
    const efectivo = dinero(d.efectivo);
    const banco = dinero(d.banco);
    const antes = porDia.get(d.fecha);
    if (!antes) {
      porDia.set(d.fecha, { fecha: d.fecha, venta, ...(efectivo !== undefined && { efectivo }), ...(banco !== undefined && { banco }) });
      continue;
    }
    const suma = (a?: number, b?: number) => (a === undefined && b === undefined ? undefined : Math.round(((a ?? 0) + (b ?? 0)) * 100) / 100);
    const e = suma(antes.efectivo, efectivo);
    const b = suma(antes.banco, banco);
    porDia.set(d.fecha, {
      fecha: d.fecha,
      venta: Math.round((antes.venta + venta) * 100) / 100,
      ...(e !== undefined && { efectivo: e }),
      ...(b !== undefined && { banco: b }),
      filas: (antes.filas ?? 1) + 1,
    });
  }
  return [...porDia.values()].sort((a, b) => a.fecha.localeCompare(b.fecha)).slice(0, MAX_INGRESOS);
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
      const importe = dineroConSigno(fila.importe);
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
    const total = dineroConSigno(f.total);
    const base = dineroConSigno(f.base_imponible);
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
  const ingresos = ingresosDesdeRespuesta(datos.ingresos);
  if (datos.tipo === "ticket_cierre" && ticket) return { tipo: "ticket_cierre", ticket, facturas: [], ingresos: [] };
  const tipo = facturas.length && ingresos.length ? "mixto" : facturas.length ? "facturas" : ingresos.length ? "ingresos" : "otro";
  return { tipo, ticket: null, facturas, ingresos };
}


// Gemini (Google AI Studio) tiene un plan gratuito y lee el PDF o la foto originales entera,
// todas las páginas, sin que el navegador prepare nada.
// Cada modelo tiene su propio cupo gratuito: si se agota uno, se prueba el siguiente. El último es
// el más ligero y menos exacto: se avisa en la bandeja cuando es el que ha leído.
const MODELOS_GEMINI = ["gemini-flash-latest", "gemini-2.5-flash", "gemini-2.5-flash-lite"];
export const esModeloLigero = (modelo?: string) => Boolean(modelo && /lite/.test(modelo));

// Qué cupo ha agotado Google: por minuto (basta esperar unos segundos), por día (hasta que
// se renueve, a las 9:00 en España) o ninguno (el modelo no tiene cupo gratuito).
export function analizar429(texto: string): { tipo: "minuto" | "dia" | "sin-cupo"; esperaMs?: number; detalle: string } {
  let json: { error?: { message?: string; details?: { violations?: { quotaId?: string; quotaMetric?: string }[]; retryDelay?: string }[] } } = {};
  try {
    json = JSON.parse(texto);
  } catch {
    // Texto sin formato: se clasifica por su contenido.
  }
  const detalles = json.error?.details ?? [];
  const ids = detalles.flatMap((d) => d.violations ?? []).map((v) => v.quotaId ?? v.quotaMetric ?? "");
  const retraso = detalles.map((d) => d.retryDelay).find(Boolean);
  const segundos = retraso ? Number.parseFloat(retraso) : NaN;
  const detalle = ids.join(", ").slice(0, 160);
  const mensaje = json.error?.message ?? texto;
  if (/limit:\s*0\b/.test(mensaje)) return { tipo: "sin-cupo", detalle };
  if (ids.some((i) => /PerDay/i.test(i))) return { tipo: "dia", detalle };
  return { tipo: "minuto", esperaMs: Number.isFinite(segundos) ? Math.ceil(segundos * 1000) + 1000 : 20_000, detalle };
}
const TIPOS_GEMINI = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"];
const MAX_BYTES_GEMINI = 14 * 1024 * 1024; // la petición admite 20 MB con el base64

async function conGemini(entrada: EntradaIA, clave: string, ms: number): Promise<LecturaDocumento> {
  const partes: unknown[] = [];
  const { archivo } = entrada;
  if (archivo && TIPOS_GEMINI.includes(archivo.tipo) && archivo.bytes.length <= MAX_BYTES_GEMINI) {
    partes.push({ inline_data: { mime_type: archivo.tipo, data: Buffer.from(archivo.bytes).toString("base64") } });
  } else if (entrada.imagenes.length > 0) {
    for (const data of entrada.imagenes) partes.push({ inline_data: { mime_type: "image/jpeg", data } });
  }
  partes.push({
    text: `${DESCRIPCION}\n\n${FORMA_JSON}${
      partes.length === 0 && entrada.texto.trim() ? `\n\nTexto extraído del documento:\n"""\n${entrada.texto.slice(0, 30_000)}\n"""` : ""
    }`,
  });

  const limite = Date.now() + ms;
  const llamar = async (modelo: string, sinPensar: boolean): Promise<Response> =>
    fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": clave },
      body: JSON.stringify({
        contents: [{ parts: partes }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 16_000,
          responseMimeType: "application/json",
          ...(sinPensar && { thinkingConfig: { thinkingBudget: 0 } }),
        },
      }),
      signal: AbortSignal.timeout(Math.max(1000, limite - Date.now())),
    });

  try {
    // Google a veces responde "demasiada demanda" (503) o agota el cupo gratuito (429): se espera lo
    // que pida cuando es por minuto, y si es del día se pasa a otro modelo, que tiene su propio cupo.
    const modelos = process.env.GEMINI_MODELO ? [process.env.GEMINI_MODELO] : [...MODELOS_GEMINI];
    let respuesta: Response | undefined;
    let motivo429: string | undefined;
    let modeloUsado = modelos[0];
    let esperas = 0;
    for (let intento = 0; intento < 10 && modelos.length > 0; intento++) {
      const modelo = modelos[0];
      modeloUsado = modelo;
      respuesta = await llamar(modelo, true);
      // Algunos modelos no admiten desactivar el razonamiento: se repite sin ese ajuste.
      if (respuesta.status === 400) respuesta = await llamar(modelo, false);
      if (respuesta.ok) break;
      if (respuesta.status === 404) {
        modelos.shift(); // ese modelo ya no existe
        continue;
      }
      if (respuesta.status === 429) {
        const analisis = analizar429(await respuesta.clone().text());
        motivo429 = `${modelo}: cupo ${analisis.tipo === "dia" ? "del día" : analisis.tipo === "minuto" ? "por minuto" : "gratuito inexistente"}${analisis.detalle ? ` (${analisis.detalle})` : ""}`;
        if (analisis.tipo === "minuto" && esperas < 3 && analisis.esperaMs !== undefined && Date.now() + analisis.esperaMs < limite - 20_000) {
          esperas++;
          await new Promise((r) => setTimeout(r, analisis.esperaMs));
          continue;
        }
        modelos.shift(); // cupo agotado: se prueba el siguiente modelo
        continue;
      }
      if (![500, 502, 503, 504].includes(respuesta.status) || Date.now() > limite - 4000) break;
      await new Promise((r) => setTimeout(r, 1500));
    }
    if (!respuesta) return { documento: null, motivo: "No se pudo consultar a Gemini." };
    if (!respuesta.ok) {
      const base = await motivoHttp("Gemini", respuesta);
      return { documento: null, motivo: motivo429 ? `${base} Cupo gratuito agotado en todos los modelos. ${motivo429}.` : base };
    }
    const cuerpo = (await respuesta.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const texto = (cuerpo.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
    const documento = documentoDesdeRespuesta(jsonDeTexto(texto));
    return documento ? { documento, modelo: modeloUsado } : { documento: null, motivo: "Gemini no devolvió datos legibles." };
  } catch (e) {
    return { documento: null, motivo: `No se pudo consultar a Gemini (${e instanceof Error ? e.message.slice(0, 80) : "error"}).` };
  }
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
        text: `${DESCRIPCION}\n\n${FORMA_JSON}${
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

// Orden: Gemini (gratis), Claude (de pago) y NVIDIA (gratis pero solo para pruebas). Se usa el
// primero con clave y, si no lee nada, el siguiente.
// Un PDF largo (decenas de páginas y facturas) tarda más de 45 s en leerse: se da todo el tiempo que
// permite la función (300 s) repartido entre los proveedores.
export async function leerDocumentoConIA(entrada: EntradaIA, ms = 250_000): Promise<LecturaDocumento> {
  const motivos: string[] = [];
  const hasta = Date.now() + ms;
  const proveedores: [string | undefined, (e: EntradaIA, clave: string, ms: number) => Promise<LecturaDocumento>][] = [
    [process.env.GEMINI_API_KEY, conGemini],
    [process.env.ANTHROPIC_API_KEY, conClaude],
    [process.env.NVIDIA_API_KEY, conNvidia],
  ];
  for (const [clave, leer] of proveedores) {
    if (!clave) continue;
    const lectura = await leer(entrada, clave, Math.max(5_000, hasta - Date.now()));
    if (lectura.documento) return lectura;
    if (lectura.motivo) motivos.push(lectura.motivo);
  }
  return {
    documento: null,
    ...(motivos.length > 0 && { motivo: motivos.join(" "), transitorio: motivos.every(esTransitorio) }),
  };
}
