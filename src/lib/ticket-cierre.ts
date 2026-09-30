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

function leerFecha(texto: string): string | null {
  const coincidencia = texto.match(/\b(\d{2})[/.-](\d{2})[/.-](\d{4})\b/);
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
