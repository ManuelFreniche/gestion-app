import { describe, expect, it } from "vitest";
import { leerTicketCierre } from "../ticket-cierre";
import { textoPorLineas } from "../pdf-lineas";
import { pdf } from "./ayudas-pdf";

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
