// Utilidades del cierre del día: importes escritos a mano y fechas en la zona del negocio.

// Acepta "512", "512,40", "512.40", "1.234,50" y "1,234.50". Devuelve null si no es un
// importe válido o si es ambiguo ("12,345"): mejor pedir que lo corrijan que guardar mal la venta.
export function leerImporte(texto: string): number | null {
  const limpio = texto.trim().replace(/\s|€/g, "");
  let normalizado: string;
  if (limpio.includes(",") && limpio.includes(".")) {
    // El último separador es el decimal.
    normalizado =
      limpio.lastIndexOf(",") > limpio.lastIndexOf(".")
        ? limpio.replace(/\./g, "").replace(",", ".")
        : limpio.replace(/,/g, "");
  } else if (limpio.includes(",")) {
    normalizado = limpio.replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(limpio)) {
    normalizado = limpio.replace(/\./g, "");
  } else {
    normalizado = limpio;
  }
  if (!/^\d+(\.\d{1,2})?$/.test(normalizado)) return null;
  return Number(normalizado);
}

// Como `leerImporte`, pero admite un "-" delante (facturas de abono, que restan).
export function leerImporteConSigno(texto: string): number | null {
  const limpio = texto.trim();
  const negativo = /^[-−–]/.test(limpio);
  const valor = leerImporte(negativo ? limpio.slice(1) : limpio);
  if (valor === null) return null;
  return negativo && valor !== 0 ? -valor : valor;
}

// Fecha de hoy (aaaa-mm-dd) en la zona horaria del negocio.
export function hoyEn(zona: string, ahora = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: zona }).format(ahora);
}

export function esFecha(texto: string | undefined): texto is string {
  return Boolean(texto && /^\d{4}-\d{2}-\d{2}$/.test(texto) && !Number.isNaN(Date.parse(texto)));
}

// Suma días a una fecha aaaa-mm-dd (sin depender de la zona del servidor).
export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function fechaLarga(fecha: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${fecha}T12:00:00Z`));
}

export function euros(importe: number): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(importe);
}
