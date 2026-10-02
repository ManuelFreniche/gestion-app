import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { compararProductos, crearLibroProductos, type LineaProducto } from "../precios-productos";

const linea = (extra: Partial<LineaProducto>): LineaProducto => ({
  descripcion: "Leche entera",
  unidad: "L",
  cantidad: null,
  precio_unitario: 1,
  importe: 1,
  proveedor: "Lactalis",
  fecha: "2026-09-01",
  ...extra,
});

describe("compararProductos", () => {
  it("marca el más barato cuando hay dos proveedores", () => {
    const f = compararProductos([linea({ precio_unitario: 1.2 }), linea({ proveedor: "Covap", precio_unitario: 0.9 })]);
    expect(f.map((x) => [x.proveedor, x.masBarato, x.sobreElMasBarato])).toEqual([
      ["Covap", true, null],
      ["Lactalis", false, 33.3],
    ]);
  });

  it("no marca nada si solo hay un proveedor", () => {
    const [f] = compararProductos([linea({})]);
    expect(f.masBarato).toBe(false);
    expect(f.proveedores).toBe(1);
    expect(f.sobreElMasBarato).toBeNull();
  });

  it("usa el último precio de cada proveedor", () => {
    const f = compararProductos([
      linea({ precio_unitario: 0.5, fecha: "2026-08-01" }),
      linea({ precio_unitario: 1.5, fecha: "2026-09-01" }),
      linea({ proveedor: "Covap", precio_unitario: 1.0 }),
    ]);
    expect(f.find((x) => x.proveedor === "Lactalis")?.precio).toBe(1.5);
    expect(f.find((x) => x.proveedor === "Covap")?.masBarato).toBe(true);
  });

  it("no compara unidades distintas ni distingue tildes, mayúsculas o espacios", () => {
    const f = compararProductos([
      linea({ descripcion: "Azúcar  blanca", unidad: "kg", precio_unitario: 1 }),
      linea({ descripcion: "azucar blanca", unidad: "KG", proveedor: "Makro", precio_unitario: 2 }),
      linea({ descripcion: "azucar blanca", unidad: "ud", proveedor: "Makro", precio_unitario: 0.1 }),
    ]);
    const kg = f.filter((x) => x.unidad.toLowerCase() === "kg");
    expect(kg).toHaveLength(2);
    expect(kg.find((x) => x.precio === 1)?.masBarato).toBe(true);
    expect(f.find((x) => x.unidad === "ud")?.masBarato).toBe(false);
  });

  it("saca el precio del importe y la cantidad si falta el unitario, y salta lo que no tiene precio", () => {
    const f = compararProductos([
      linea({ precio_unitario: null, cantidad: 4, importe: 10 }),
      linea({ descripcion: "Sin precio", precio_unitario: null, cantidad: null, importe: 5 }),
    ]);
    expect(f).toHaveLength(1);
    expect(f[0].precio).toBe(2.5);
  });

  it("si dos proveedores empatan en el más barato, los dos salen marcados", () => {
    const f = compararProductos([linea({}), linea({ proveedor: "Covap" }), linea({ proveedor: "Otro", precio_unitario: 2 })]);
    expect(f.filter((x) => x.masBarato)).toHaveLength(2);
  });

  it("pone primero los productos comparables", () => {
    const f = compararProductos([linea({ descripcion: "Aceite" }), linea({ descripcion: "Leche" }), linea({ descripcion: "Leche", proveedor: "Covap" })]);
    expect(f[0].producto).toBe("Leche");
    expect(f[f.length - 1].producto).toBe("Aceite");
  });
});

describe("crearLibroProductos", () => {
  it("pinta de verde la fila más barata y no las demás", async () => {
    const filas = compararProductos([linea({ precio_unitario: 1.2 }), linea({ proveedor: "Covap", precio_unitario: 0.9 })]);
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load((await crearLibroProductos("Alpino's", filas)) as never);
    const h = libro.getWorksheet("Productos y precios")!;
    const verde = (fila: number) => (h.getRow(fila).getCell(1).fill as ExcelJS.FillPattern | undefined)?.fgColor?.argb;
    expect(h.getRow(2).getCell(3).value).toBe("Covap");
    expect(verde(2)).toBe("FFC6EFCE");
    expect(verde(3)).toBeUndefined();
    expect(h.getRow(2).getCell(6).value).toBe("Más barato");
  });
});
