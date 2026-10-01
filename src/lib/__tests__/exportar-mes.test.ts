import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { crearLibro, prepararExportacion } from "../exportar-mes";

const factura = (fecha: string, proveedor: string, categoria: string, importe: number) => ({
  fecha, proveedor, numero: null, categoria, importe, estado_pago: "pendiente",
});

describe("prepararExportacion", () => {
  it("ordena por fecha y totaliza en céntimos", () => {
    const d = prepararExportacion(
      [factura("2026-09-10", "B", "Suministros", 0.1), factura("2026-09-02", "A", "Alquiler", 0.2)],
      [{ fecha: "2026-09-03", venta: 1.1, efectivo: null, banco: null }],
    );
    expect(d.facturas.map((f) => f.proveedor)).toEqual(["A", "B"]);
    expect(d.totalGastos).toBe(0.3);
    expect(d.resultado).toBe(0.8);
  });
  it("sin permiso de ventas no hay ingresos ni resultado", () => {
    const d = prepararExportacion([factura("2026-09-02", "A", "Alquiler", 5)], null);
    expect(d.ingresos).toBeNull();
    expect(d.resultado).toBeNull();
  });
});

describe("crearLibro", () => {
  it("genera un xlsx con las hojas esperadas", async () => {
    const d = prepararExportacion([factura("2026-09-02", "A", "Alquiler", 5)], [{ fecha: "2026-09-03", venta: 10, efectivo: 4, banco: 6 }]);
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load((await crearLibro("2026-09", "Alpino's", d)) as never);
    expect(libro.worksheets.map((h) => h.name)).toEqual(["Resumen", "Facturas y gastos", "Ingresos"]);
    expect(libro.getWorksheet("Facturas y gastos")?.getRow(2).getCell(5).value).toBe(5);
  });
});
