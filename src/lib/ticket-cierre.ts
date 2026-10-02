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
export function leerFecha(texto: string): string | null {
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

function fechaIso(texto: string, etiqueta: string): string | null {
  const m = texto.match(new RegExp(`${etiqueta}\\s*:?\\s*(\\d{2})[/.-](\\d{2})[/.-](\\d{4})\\b`, "i"));
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

const redondear = (n: number) => Math.round(n * 100) / 100;

const eur = (n: number) => n.toFixed(2).replace(".", ",") + " €";

export type RevisionTicket = {
  // false: las cifras no cuadran entre sí (lo normal cuando el texto llega desordenado): no hay que fiarse de ellas.
  fiable: boolean;
  // Cosas que la persona debe mirar al revisar la tarjeta.
  avisos: string[];
};

// Comprueba la lectura contra el propio ticket. Lo que no puede ser (efectivo + tarjeta + pendientes distinto
// del total de tickets) hace que la lectura no sea fiable; lo que puede tener explicación (el "Total Cobrado"
// incluye cobros de otros días, facturas a crédito, redondeos) solo avisa: la lectura se enseña igualmente,
// con el aviso, para que la persona la compare con el PDF.
export function revisarTicket(textoPdf: string, t: TicketCierre): RevisionTicket {
  const texto = textoPdf.replace(/\s+/g, " ");
  const avisos: string[] = [];
  let fiable = true;

  const tickets = valorDe(texto, "Total Tickets");
  const efectivo = valorDe(texto, "Tickets Efectivo");
  const banco = valorDe(texto, "Tickets Banco");
  const pendientes = valorDe(texto, "Tickets Pendientes") ?? 0;
  if (tickets !== null && efectivo !== null && banco !== null && Math.abs(efectivo + banco + pendientes - tickets) > 0.05) {
    fiable = false;
    avisos.push(`Las cifras del ticket no cuadran entre sí: efectivo ${eur(efectivo)} + tarjeta ${eur(banco)} + pendientes ${eur(pendientes)} no suman el total ${eur(tickets)}. Compruébalas con el PDF.`);
  }
  if (!ticketCoherente(t)) {
    fiable = false;
    avisos.push("La venta es menor que lo cobrado en efectivo y banco. Compruébalas con el PDF antes de meterlas.");
  }

  const cobrado = valorDe(texto, "Total Cobrado");
  if (fiable && cobrado !== null && Math.abs(t.venta - cobrado - pendientes) > 0.05) {
    avisos.push(`El "Total cobrado" del ticket (${eur(cobrado)}) no coincide con la venta leída (${eur(t.venta)}). Puede ser normal (cobros de otro día, cuentas pendientes de cobrar), pero compruébalo con el PDF.`);
  }

  const inicial = fechaIso(texto, "fecha\\s+inicial");
  const final = fechaIso(texto, "fecha\\s+final");
  if (inicial && final && (Date.parse(final) - Date.parse(inicial)) / 86_400_000 > 1) {
    avisos.push(`Este cierre abarca varios días (del ${inicial.split("-").reverse().join("/")} al ${final.split("-").reverse().join("/")}): la venta es la suma de todos.`);
  }
  return { fiable, avisos };
}

// Todos los importes con formato "1.234,56" que aparecen en el texto.
export function importesDelTexto(textoPdf: string): number[] {
  const importes: number[] = [];
  for (const m of textoPdf.matchAll(/-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2}/g)) importes.push(numero(m[0]));
  return importes;
}

// La lectura de la IA no se acepta a ciegas: su venta tiene que aparecer en el texto del PDF y la fecha
// que vale es la que está impresa como "Fecha inicial", no la que la IA crea ver.
export function contrastarLecturaIA(textoPdf: string, t: TicketCierre): { ticket: TicketCierre; avisos: string[] } {
  const avisos: string[] = [];
  const ticket = { ...t };
  if (textoPdf.trim()) {
    const fechaImpresa = leerFecha(textoPdf.replace(/\s+/g, " "));
    if (fechaImpresa) ticket.fecha = fechaImpresa;
    const importes = importesDelTexto(textoPdf);
    if (importes.length > 0 && !importes.some((i) => Math.abs(i - ticket.venta) < 0.005)) {
      avisos.push(`La venta que ha leído la IA (${eur(ticket.venta)}) no aparece en el texto del PDF: compruébala.`);
    }
  }
  ticket.venta = redondear(ticket.venta);
  return { ticket, avisos };
}
