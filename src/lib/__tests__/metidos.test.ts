import { describe, expect, it } from "vitest";
import { mensajeDeshecho, resumenMetido, type DiaMetido, type FacturaMetida } from "../metidos";

const doc = (id: string, tipo = "cierre") => ({ id, tipo, nombre: `${id}.pdf` });
const dia = (documentoId: string, fecha: string, venta: number): DiaMetido => ({ documentoId, fecha, venta });
const factura = (documentoId: string, proveedor: string, importe: number, pagada = false): FacturaMetida => ({
  documentoId,
  proveedor,
  importe,
  pagada,
});

// Intl con es-ES pone un espacio duro antes del símbolo del euro.
const sinEspaciosDuros = (texto: string) => texto.replace(/ /g, " ");

describe("resumenMetido", () => {
  it("dice el día y la venta de un cierre", () => {
    const r = resumenMetido(doc("a"), [dia("a", "2026-09-30", 220.6)], []);
    expect(r.que.map(sinEspaciosDuros)).toEqual(["Ventas del 30/09/2026: 220,60 €"]);
    expect(r.etiqueta).toBe("Cierre de caja");
    expect(r.sinNada).toBe(false);
    expect(r.hayPagadas).toBe(false);
  });

  it("resume una hoja de ingresos con varios días, de la primera a la última fecha", () => {
    const r = resumenMetido(
      doc("h", "ingresos"),
      [dia("h", "2026-09-03", 100), dia("h", "2026-09-01", 50.5), dia("h", "2026-09-02", 25.25)],
      [],
    );
    expect(r.que.map(sinEspaciosDuros)).toEqual(["3 días de ventas, del 01/09/2026 al 03/09/2026: 175,75 € en total"]);
    expect(r.etiqueta).toBe("Hoja de ingresos");
  });

  it("solo cuenta lo que es de ese documento", () => {
    const r = resumenMetido(doc("a"), [dia("a", "2026-09-30", 10), dia("otro", "2026-09-29", 999)], [factura("otro", "X", 5)]);
    expect(r.que.map(sinEspaciosDuros)).toEqual(["Ventas del 30/09/2026: 10,00 €"]);
  });

  it("resume las facturas con el total y los proveedores", () => {
    const una = resumenMetido(doc("f", "factura"), [], [factura("f", "Lactalis", 121)]);
    expect(una.que.map(sinEspaciosDuros)).toEqual(["1 factura: 121,00 € (Lactalis)"]);

    const varias = resumenMetido(
      doc("f", "factura"),
      [],
      [factura("f", "Lactalis", 100), factura("f", "Lactalis", 50), factura("f", "Coca-Cola", 25), factura("f", "Endesa", 10)],
    );
    expect(varias.que.map(sinEspaciosDuros)).toEqual(["4 facturas: 185,00 € (Lactalis, Coca-Cola y otros)"]);
  });

  it("resta los abonos del total", () => {
    const r = resumenMetido(doc("f", "factura"), [], [factura("f", "Lactalis", 100), factura("f", "Lactalis", -40)]);
    expect(r.que.map(sinEspaciosDuros)).toEqual(["2 facturas: 60,00 € (Lactalis)"]);
  });

  it("avisa si alguna factura está pagada", () => {
    const r = resumenMetido(doc("f", "factura"), [], [factura("f", "A", 10), factura("f", "B", 20, true)]);
    expect(r.hayPagadas).toBe(true);
  });

  it("marca sin nada cuando otro documento ocupó su lugar", () => {
    const r = resumenMetido(doc("a"), [dia("otro", "2026-09-30", 10)], []);
    expect(r.que).toEqual([]);
    expect(r.sinNada).toBe(true);
  });

  it("no pierde un tipo que no conoce", () => {
    expect(resumenMetido(doc("a", "raro"), [], []).etiqueta).toBe("raro");
  });
});

describe("mensajeDeshecho", () => {
  it("cuenta lo que se quitó", () => {
    expect(mensajeDeshecho({ cierres: 1, facturas: 0 })).toBe(
      "Hecho. He quitado 1 día de Ventas de tus cuentas. El documento está otra vez arriba, en «Por revisar».",
    );
    expect(mensajeDeshecho({ cierres: 3, facturas: 2 })).toBe(
      "Hecho. He quitado 3 días de Ventas y 2 facturas de tus cuentas. El documento está otra vez arriba, en «Por revisar».",
    );
    expect(mensajeDeshecho({ facturas: 1 })).toContain("He quitado 1 factura de tus cuentas.");
  });

  it("dice que no había nada cuando no se quitó nada", () => {
    expect(mensajeDeshecho({ cierres: 0, facturas: 0 })).toContain("No había nada suyo en tus cuentas.");
    expect(mensajeDeshecho(null)).toContain("No había nada suyo en tus cuentas.");
  });
});
