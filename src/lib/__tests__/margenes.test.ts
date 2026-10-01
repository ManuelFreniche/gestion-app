import { describe, expect, it } from "vitest";
import { cambiosDePrecio, resultadoPorMes, ultimosMeses, type LineaCompra } from "../margenes";

const linea = (descripcion: string, fecha: string, precio: number, extra: Partial<LineaCompra> = {}): LineaCompra => ({
  descripcion, unidad: "kg", cantidad: 10, precio_unitario: precio, importe: precio * 10, fecha, proveedor: "Sercodi", ...extra,
});

describe("ultimosMeses", () => {
  it("da n meses acabando en el pedido, también entre años", () => {
    expect(ultimosMeses("2026-02", 4)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });
});

describe("resultadoPorMes", () => {
  it("suma ventas y facturas de cada mes y resta", () => {
    const r = resultadoPorMes(
      ["2026-08", "2026-09"],
      [{ fecha: "2026-08-31", venta: 100.1 }, { fecha: "2026-09-01", venta: 200.2 }, { fecha: "2026-09-02", venta: 0.1 }],
      [{ fecha: "2026-09-05", importe: 50.05 }],
    );
    expect(r[0]).toEqual({ mes: "2026-08", vendido: 100.1, gastado: 0, resultado: 100.1 });
    expect(r[1]).toEqual({ mes: "2026-09", vendido: 200.3, gastado: 50.05, resultado: 150.25 });
  });
});

describe("cambiosDePrecio", () => {
  it("compara la última compra con la anterior", () => {
    const c = cambiosDePrecio([linea("Leche entera", "2026-08-01", 1), linea("Leche entera", "2026-09-01", 1.2)]);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ anterior: 1, actual: 1.2, cambio: 20 });
  });
  it("junta mayúsculas, tildes y espacios", () => {
    const c = cambiosDePrecio([linea("Azúcar  blanca", "2026-08-01", 2), linea("azucar blanca", "2026-09-01", 1)]);
    expect(c[0].cambio).toBe(-50);
  });
  it("ignora un producto comprado una sola vez, el mismo día o con cambios menores del 1 %", () => {
    expect(cambiosDePrecio([linea("Nata", "2026-09-01", 3)])).toEqual([]);
    expect(cambiosDePrecio([linea("Nata", "2026-09-01", 3), linea("Nata", "2026-09-01", 4)])).toEqual([]);
    expect(cambiosDePrecio([linea("Nata", "2026-08-01", 3), linea("Nata", "2026-09-01", 3.01)])).toEqual([]);
  });
  it("saca el precio del importe y la cantidad si falta el unitario", () => {
    const c = cambiosDePrecio([
      linea("Cacao", "2026-08-01", 0, { precio_unitario: null, cantidad: 5, importe: 10 }),
      linea("Cacao", "2026-09-01", 0, { precio_unitario: null, cantidad: 5, importe: 15 }),
    ]);
    expect(c[0]).toMatchObject({ anterior: 2, actual: 3, cambio: 50 });
  });
  it("no mezcla unidades distintas", () => {
    expect(cambiosDePrecio([linea("Fresa", "2026-08-01", 3), linea("Fresa", "2026-09-01", 9, { unidad: "caja" })])).toEqual([]);
  });
});
