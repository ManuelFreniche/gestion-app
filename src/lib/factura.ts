// Lee una factura de proveedor a partir del texto del PDF o del OCR: proveedor, fecha e importe.
// Es la misma idea que el robot de la app antigua: reglas de texto, sin IA y sin coste.
// Si un dato no aparece, queda vacío y la persona lo escribe al revisarla en la bandeja.

export const CATEGORIAS = ["Materia prima", "Suministros", "Alquiler", "Nóminas", "Gasolina", "Otros"] as const;
export type Categoria = (typeof CATEGORIAS)[number];

export type FacturaLeida = {
  proveedor: string | null;
  categoria: Categoria;
  importe: number | null;
  fecha: string | null; // aaaa-mm-dd
  numero: string | null;
};

// Proveedores conocidos de la heladería: palabra clave (sin tildes, en minúsculas) → nombre y categoría.
// Se añaden líneas cuando aparece un proveedor nuevo.
const PROVEEDORES_CONOCIDOS: [RegExp, string, Categoria][] = [
  [/cafes?\s+salvador/, "Cafés Salvador e Hijos", "Materia prima"],
  [/disbesa|ramilo\s*1985/, "Disbesa", "Materia prima"],
  [/supermercados?\s+champion/, "Supermercados Champion", "Materia prima"],
  [/elisabel/, "Elisabel Frutos Secos y Golosinas", "Materia prima"],
  [/ferreteria\s+dial|diaz\s+hernandez/, "Ferretería Dial", "Otros"],
  [/ferreteria\s+la\s+cadena/, "Ferretería La Cadena Centro", "Otros"],
  [/recambios\s+indalo|electro\s+recambios/, "Electro Recambios Indalo", "Otros"],
  [/indalpesa/, "Indalpesa", "Materia prima"],
  [/indalques/, "Indalques", "Materia prima"],
  [/leroy\s*merlin/, "Leroy Merlín", "Suministros"],
  [/panaderia\s+del\s+rosal/, "Panadería del Rosal", "Materia prima"],
  [/comercial\s+dragon/, "Comercial Dragon", "Suministros"],
  [/master\s+gift\s+import|\bmgi\b/, "MGI Tiendas", "Suministros"],
  [/brico\s*depot/, "Brico Depot", "Otros"],
  [/relindas|albiceleste\s+foods/, "Relindas / Albiceleste Foods", "Materia prima"],
  [/gimenez\s+asnar/, "Pablo M. Giménez Asnar", "Materia prima"],
  [/euromania/, "Euromania", "Materia prima"],
  [/sercodi/, "Sercodi", "Materia prima"],
  [/gm\s*cash/, "GM Cash", "Materia prima"],
  [/hogar\s*hotel|hoalve/, "Hogar Hotel", "Suministros"],
  [/barema/, "Barema Almería", "Otros"],
  [/carrefour/, "Carrefour", "Materia prima"],
];

const IMPORTE = String.raw`(-?\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|-?\d+[.,]\d{2})`;
// Detrás de la palabra "total" también se admite el espacio como separador de miles ("1 581,00 €").
const IMPORTE_TOTAL = String.raw`(-?\d{1,3}(?:[.,\u00a0 ]\d{3})*[.,]\d{2}|-?\d+[.,]\d{2})`;

// Patrones de "total", por orden de prioridad (gana el primero que aparezca).
const PATRONES_TOTAL = [
  String.raw`total\s+a\s+pagar[:\s]*${IMPORTE_TOTAL}`,
  String.raw`total\s+impuestos\s+inclu[ií]dos[:\s]*${IMPORTE_TOTAL}`,
  String.raw`total\s+factura[:\s]*${IMPORTE_TOTAL}`,
  String.raw`total\s+eur(?:os)?[:\s]*${IMPORTE_TOTAL}`,
  String.raw`total\s+t[il]i?\s*\(eur\)[:\s]*${IMPORTE_TOTAL}`,
  String.raw`total[:\s]+${IMPORTE_TOTAL}\s*€`,
  String.raw`importe\s+total[:\s]*${IMPORTE_TOTAL}`,
];

export function quitarTildes(texto: string): string {
  return texto.normalize("NFD").replace(/\p{Mn}/gu, "");
}

// "1.234,56" o "1234.56" → 1234.56
export function limpiarImporte(texto: string): number | null {
  let t = texto.replace(/[\s\u00a0]/g, "");
  if (t.includes(",") && t.includes(".")) {
    // El último separador es el decimal.
    t = t.lastIndexOf(",") > t.lastIndexOf(".") ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  } else if (t.includes(",")) {
    t = t.replace(",", ".");
  }
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

export function detectarProveedor(texto: string): { nombre: string; categoria: Categoria } | null {
  const plano = quitarTildes(texto.toLowerCase());
  for (const [patron, nombre, categoria] of PROVEEDORES_CONOCIDOS) {
    if (!patron.test(plano)) continue;
    // El casero del local también es proveedor de mercancía: su recibo del alquiler no es materia prima.
    if (/gimenez\s+asnar/.test(plano) && /alquiler|arrendamiento/.test(plano)) return { nombre, categoria: "Alquiler" };
    return { nombre, categoria };
  }
  return null;
}

export function detectarTotal(texto: string): number | null {
  // Un abono se imprime a veces con el total entre paréntesis: "TOTAL (121,00) €" es -121,00.
  const bajo = texto.toLowerCase().replace(/\(\s*(\d[\d.,\u00a0 ]*\d)\s*\)/g, "-$1");
  for (const patron of PATRONES_TOTAL) {
    const m = bajo.match(new RegExp(patron));
    const valor = m ? limpiarImporte(m[1]) : null;
    if (valor) return valor;
  }
  // Red de seguridad 1: número junto a "total" aunque no lleve el símbolo €
  // (sin confundirlo con la base imponible).
  for (const m of bajo.matchAll(new RegExp(String.raw`total[^\d\n]{0,15}${IMPORTE_TOTAL}`, "g"))) {
    // "Total IVA 0,80" o "Total cuota 0,80" no son el total de la factura.
    if (/^total\s*(iva|i\.v\.a|cuota|impuestos?|retenci)/.test(m[0])) continue;
    const inicio = Math.max(0, (m.index ?? 0) - 25);
    const salto = bajo.lastIndexOf("\n", m.index ?? 0);
    const contexto = bajo.slice(Math.max(inicio, salto + 1), (m.index ?? 0) + m[0].length);
    if (contexto.includes("imponible") || contexto.includes("base")) continue;
    const valor = limpiarImporte(m[1]);
    if (valor) return valor;
  }
  // Red de seguridad 2: el mayor importe que lleve el símbolo €.
  const valores = [...texto.matchAll(new RegExp(`${IMPORTE}\\s*€`, "g"))]
    .map((m) => limpiarImporte(m[1]))
    .filter((v): v is number => v !== null && v > 0);
  return valores.length ? Math.max(...valores) : null;
}

function aIso(dia: number, mes: number, anio: number): string | null {
  if (dia < 1 || dia > 31 || mes < 1 || mes > 12) return null;
  const a = anio < 100 ? 2000 + anio : anio;
  if (a < 2020 || a > 2035) return null;
  const fecha = new Date(Date.UTC(a, mes - 1, dia));
  if (fecha.getUTCMonth() !== mes - 1) return null; // p. ej. 31/02
  return fecha.toISOString().slice(0, 10);
}

export function detectarFecha(texto: string): string | null {
  // 1) "Fecha: dd/mm/aaaa" cerca uno del otro.
  const cerca = texto.match(/fecha\D{0,20}?(\d{1,2})[\s/.-](\d{1,2})[\s/.-](\d{2,4})/i);
  const candidatos: [string, string, string][] = cerca ? [[cerca[1], cerca[2], cerca[3]]] : [];
  // 2) Cualquier fecha con pinta válida (el OCR a veces lee mal el separador).
  for (const m of texto.matchAll(/\b(\d{1,2})[\s/.-](\d{1,2})[\s/.-](\d{4}|\d{2})\b/g)) {
    candidatos.push([m[1], m[2], m[3]]);
  }
  for (const [d, m, a] of candidatos) {
    const iso = aIso(Number(d), Number(m), Number(a));
    if (iso) return iso;
  }
  return null;
}

export function detectarNumero(texto: string): string | null {
  const m = texto.match(/(?:n[uú]m(?:ero)?\.?|n[ºo°]\.?)\s*(?:de\s+)?factura\s*[:#]?\s*([A-Z0-9][\w/-]{2,})|factura\s*(?:n[uú]m(?:ero)?\.?|n[ºo°]\.?)\s*[:#]?\s*([A-Z0-9][\w/-]{2,})/i);
  const valor = m?.[1] ?? m?.[2] ?? null;
  return valor && /\d/.test(valor) ? valor.slice(0, 60) : null;
}

// Devuelve la factura leída, o null si el texto no parece una factura (ni proveedor ni importe).
export function leerFactura(texto: string): FacturaLeida | null {
  const proveedor = detectarProveedor(texto);
  const importe = detectarTotal(texto);
  if (!proveedor && importe === null) return null;
  return {
    proveedor: proveedor?.nombre ?? null,
    categoria: proveedor?.categoria ?? "Otros",
    importe,
    fecha: detectarFecha(texto),
    numero: detectarNumero(texto),
  };
}

// Una línea de producto de una factura (para comparar precios entre proveedores).
export type LineaFactura = {
  descripcion: string;
  cantidad?: number;
  unidad?: string;
  precio_unitario?: number;
  importe: number;
};

// Factura tal como se guarda en los datos del documento y se pasa a `registrar_facturas`.
export type FacturaDatos = {
  proveedor?: string;
  numero?: string;
  fecha?: string; // aaaa-mm-dd
  importe?: number; // total con impuestos
  base?: number; // base imponible, solo para comprobar las líneas
  categoria: Categoria;
  lineas: LineaFactura[];
};

export function facturaDesdeReglas(l: FacturaLeida): FacturaDatos {
  return {
    ...(l.proveedor && { proveedor: l.proveedor }),
    ...(l.numero && { numero: l.numero }),
    ...(l.fecha && { fecha: l.fecha }),
    ...(l.importe !== null && { importe: l.importe }),
    categoria: l.categoria,
    lineas: [],
  };
}

// Identifica una factura para detectar repetidas: proveedor, número y fecha. Sin los tres no hay
// forma fiable de saber si ya existe, así que devuelve null.
// El proveedor se compara sin mayúsculas, tildes, puntuación ni forma societaria: "AFICOS ABOGADOS Y ASESORES S.L."
// y "Aficos Abogados y Asesores SL" son el mismo.
export function proveedorNormalizado(nombre?: string | null): string | undefined {
  const t = quitarTildes((nombre ?? "").toLowerCase())
    .replace(/[.,;:()"']/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s(s ?l ?u?|s ?a ?u?|s ?l ?l|s ?coop|c ?b)$/, "")
    .trim();
  return t || undefined;
}

export function claveFactura(f: { proveedor?: string | null; numero?: string | null; fecha?: string | null }): string | null {
  const proveedor = proveedorNormalizado(f.proveedor);
  const numero = f.numero?.trim().toLowerCase();
  if (!proveedor || !numero || !f.fecha) return null;
  return `${proveedor}|${numero}|${f.fecha}`;
}

// Una factura se mete sola solo si está completa y las líneas cuadran con la base o el total.
// Si algo no cuadra, queda en la bandeja para revisarla.
export function facturaFiable(f: FacturaDatos, hoy: string): boolean {
  // Un abono (importe negativo) se comprueba igual que una factura, con los importes en positivo.
  if (!f.proveedor?.trim() || !f.fecha || f.fecha > hoy || !f.importe) return false;
  if (f.lineas.length === 0) return true;
  const sumaConSigno = f.lineas.reduce((t, l) => t + l.importe, 0);
  // Un importe positivo con líneas negativas (o al revés) es una lectura contradictoria, no un abono.
  if (sumaConSigno !== 0 && Math.sign(sumaConSigno) !== Math.sign(f.importe)) return false;
  const importe = Math.abs(f.importe);
  const suma = Math.abs(sumaConSigno);
  const base = f.base === undefined ? undefined : Math.abs(f.base);
  const margen = 0.05 + 0.01 * f.lineas.length;
  if (base !== undefined && Math.abs(suma - base) <= margen) return true;
  if (Math.abs(suma - importe) <= margen) return true;
  return base === undefined && suma <= importe + margen;
}

// Sin IA, un PDF con varias facturas se separa por páginas: cada página con total y número o fecha
// propios es una factura. Las páginas de continuación (sin total) se ignoran.
export function leerFacturasPorPaginas(paginas: string[]): FacturaDatos[] {
  const salida: FacturaDatos[] = [];
  const vistas = new Set<string>();
  let anterior: FacturaDatos | undefined;
  for (const pagina of paginas) {
    if (pagina.replace(/\s/g, "").length < 30) continue;
    const leida = leerFactura(pagina);
    if (!leida || leida.importe === null || !(leida.numero || leida.fecha)) continue;
    const f = facturaDesdeReglas(leida);
    if (!f.proveedor && anterior?.proveedor) {
      f.proveedor = anterior.proveedor;
      f.categoria = anterior.categoria;
    }
    const clave = `${f.proveedor}|${f.numero}|${f.importe}`;
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    salida.push(f);
    anterior = f;
  }
  return salida;
}
