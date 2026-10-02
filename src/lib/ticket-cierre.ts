// Lee el "Estado de la caja" que el programa de caja manda por correo al cerrar.
// Trabaja sobre el texto del PDF; si un dato no aparece, devuelve null y la
// persona lo escribe a mano en la bandeja de revisión.

export type TicketCierre = {
  venta: number; // Total tickets + total facturas
  efectivo: number | null;
  banco: number | null;
  ticketMedio: number | null;
  fecha: string | null; // aaaa-mm-dd, solo si el propio texto la trae
};

function numero(texto: string): number {
  return Number(texto.replace(/\./g, "").replace(",", "."));
}

// Busca "<etiqueta> 136,70" y devuelve el número que sigue a la etiqueta.
function valorDe(texto: string, etiqueta: string): number | null {
  const patron = new RegExp(`${etiqueta}\\s*:?\\s*(-?\\d{1,3}(?:\\.\\d{3})*,\\d{2}|-?\\d+,\\d{2})`, "i");
  const coincidencia = texto.match(patron);
  return coincidencia ? numero(coincidencia[1]) : null;
}

// La venta es del día de la "Fecha inicial" (el cierre puede imprimirse pasada la medianoche, ya con
// otra "Fecha final"). Si no hay etiqueta, la primera fecha que aparezca.
function leerFecha(texto: string): string | null {
  const coincidencia =
    texto.match(/fecha\s+inicial\s*:?\s*(\d{2})[/.-](\d{2})[/.-](\d{4})\b/i) ?? texto.match(/\b(\d{2})[/.-](\d{2})[/.-](\d{4})\b/);
  if (!coincidencia) return null;
  const [, dia, mes, anio] = coincidencia;
  const iso = `${anio}-${mes}-${dia}`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

export function leerTicketCierre(textoPdf: string): TicketCierre | null {
  const texto = textoPdf.replace(/\s+/g, " ");
  const tickets = valorDe(texto, "Total Tickets");
  if (tickets === null) return null;

  const facturas = valorDe(texto, "Total Facturas") ?? 0;
  const suma = (a: number | null, b: number | null) =>
    a === null && b === null ? null : Math.round(((a ?? 0) + (b ?? 0)) * 100) / 100;

  return {
    venta: Math.round((tickets + facturas) * 100) / 100,
    efectivo: suma(valorDe(texto, "Tickets Efectivo"), valorDe(texto, "Facturas Efectivo")),
    banco: suma(valorDe(texto, "Tickets Banco"), valorDe(texto, "Facturas Banco")),
    ticketMedio: valorDe(texto, "Ticket/Factura Media"),
    fecha: leerFecha(texto),
  };
}

// La venta del día incluye lo cobrado en efectivo y en banco: si es menor, algo se ha leído mal
// (por ejemplo, un ticket medio tomado por la venta). Mejor revisarlo que guardar una venta falsa.
export function ticketCoherente(t: Pick<TicketCierre, "venta" | "efectivo" | "banco">): boolean {
  if (t.efectivo === null && t.banco === null) return true;
  return t.venta + 0.05 >= (t.efectivo ?? 0) + (t.banco ?? 0);
}

// El ticket trae "Total Cobrado": debe coincidir con la venta (más lo pendiente de cobro). Si el
// texto del PDF llega desordenado, las cifras no cuadran y se descarta la lectura por reglas.
export function cuadraConCobrado(textoPdf: string, t: Pick<TicketCierre, "venta">): boolean {
  const texto = textoPdf.replace(/\s+/g, " ");
  const cobrado = valorDe(texto, "Total Cobrado");
  if (cobrado === null) return true;
  const pendientes = valorDe(texto, "Tickets Pendientes") ?? 0;
  return Math.abs(t.venta - cobrado - pendientes) <= 0.05;
}
