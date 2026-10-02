// PDF mínimos hechos a mano para las pruebas. Cada pieza es [texto, x, y] y se dibuja en el orden dado,
// que puede no ser el de lectura (así lo hacen algunos programas de caja).
export function pdf(piezas: [string, number, number][], alto = 400): Uint8Array {
  const flujo = piezas.map(([t, x, y]) => `BT /F1 10 Tf ${x} ${y} Td (${t.replace(/[()\\]/g, "\\$&")}) Tj ET`).join("\n");
  const objetos = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 ${alto}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>`,
    `<< /Length ${flujo.length} >>\nstream\n${flujo}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let salida = "%PDF-1.4\n";
  const posiciones: number[] = [];
  objetos.forEach((o, i) => {
    posiciones.push(salida.length);
    salida += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = salida.length;
  salida += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (const p of posiciones) salida += `${String(p).padStart(10, "0")} 00000 n \n`;
  salida += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(salida);
}

const coma = (n: number) => n.toFixed(2).replace(".", ",");

// El PDF "Cierres de caja" del programa de caja, con su orden de dibujo real: primero todas las cifras
// y después todas las etiquetas, de modo que el texto "en bruto" sale desordenado.
export function cierreComoPdf(c: { efectivo: number; banco: number; fechaInicial?: string; fechaFinal?: string; pendientes?: number; facturasBanco?: number }): Uint8Array {
  const pendientes = c.pendientes ?? 0;
  const facturasBanco = c.facturasBanco ?? 0;
  const ticketsTotal = c.efectivo + c.banco + pendientes;
  const cobrado = c.efectivo + c.banco;
  // [etiqueta, cifra | null]
  const filas: [string, string | null][] = [
    ["CIERRE DE LA CAJA 1", null],
    ["Fecha inicial:", c.fechaInicial ?? null],
    ["Fecha final:", c.fechaFinal ?? null],
    ["Usuario: MANUEL", null],
    ["ESTADO DE LA CAJA", null],
    ["Saldo Inicial Caja", "0,00"],
    ["Cobrado Efectivo", coma(c.efectivo)],
    ["Ticket", coma(c.efectivo)],
    ["Pendientes", "0,00"],
    ["Cobrado Bancos", coma(c.banco)],
    ["Ticket", coma(c.banco)],
    ["Pendientes", "0,00"],
    ["Total Cobrado", coma(cobrado)],
    ["Saldo Final Caja", coma(c.efectivo)],
    ["VENTAS DEL DIA - MANIPULACION", null],
    ["Tickets Efectivo", coma(c.efectivo)],
    ["Tickets Banco", coma(c.banco)],
    ["Tickets Pendientes", coma(pendientes)],
    ["Total Tickets", coma(ticketsTotal)],
    ["Facturas Efectivo", "0,00"],
    ["Facturas Banco", coma(facturasBanco)],
    ["Total Facturas", coma(facturasBanco)],
    ["Ticket/Factura Media", "9,76"],
  ];
  const y = (i: number) => 560 - i * 14;
  const cifras = filas.flatMap(([, v], i) => (v ? [[v, 230, y(i)] as [string, number, number]] : [])).reverse();
  const etiquetas = filas.map(([e], i) => [e, 20, y(i)] as [string, number, number]);
  return pdf([...cifras, ...etiquetas], 600);
}
