import { describe, expect, it } from "vitest";
import { leerTicketCierre } from "../ticket-cierre";
import { textoPorLineas } from "../pdf-lineas";

// PDF mínimo a mano: cada pieza es [texto, x, y]. Se dibujan en el orden dado, que no es el de lectura.
function pdf(piezas: [string, number, number][]): Uint8Array {
  const flujo = piezas.map(([t, x, y]) => `BT /F1 10 Tf ${x} ${y} Td (${t}) Tj ET`).join("\n");
  const objetos = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
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

describe("textoPorLineas", () => {
  it("ordena por posición aunque el PDF dibuje las cifras antes que las etiquetas", async () => {
    const filas: [string, string][] = [
      ["Tickets Efectivo", "10,80"],
      ["Tickets Banco", "125,90"],
      ["Total Tickets", "136,70"],
      ["Total Facturas", "0,00"],
      ["Ticket/Factura Media", "6,51"],
    ];
    // Primero todas las cifras (de abajo arriba) y después todas las etiquetas.
    const cifras = filas.map(([, v], i) => [v, 220, 360 - i * 20] as [string, number, number]).reverse();
    const etiquetas = filas.map(([e], i) => [e, 20, 360 - i * 20] as [string, number, number]);
    const texto = await textoPorLineas(pdf([...cifras, ...etiquetas]));
    expect(texto.split("\n")[0]).toBe("Tickets Efectivo 10,80");
    expect(leerTicketCierre(texto)).toMatchObject({ venta: 136.7, efectivo: 10.8, banco: 125.9, ticketMedio: 6.51 });
  });
});
