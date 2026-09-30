import { describe, expect, it } from "vitest";
import { facturaFiable, type FacturaDatos } from "../factura";
import { documentoDesdeRespuesta } from "../leer-documento-ia";

describe("documentoDesdeRespuesta", () => {
  it("lee varias facturas con sus líneas", () => {
    const d = documentoDesdeRespuesta({
      tipo: "facturas",
      ticket: null,
      facturas: [
        {
          proveedor: "Puleva",
          numero: "A-1",
          fecha: "2026-08-01",
          base_imponible: 20,
          total: 22,
          categoria: "Materia prima",
          lineas: [{ descripcion: "Leche entera 1L", cantidad: 20, unidad: "ud", precio_unitario: 1, importe: 20 }],
        },
        { proveedor: "Puleva", fecha: "2026-08-15", total: 11, categoria: "Inventada", lineas: [] },
      ],
    });
    expect(d?.tipo).toBe("facturas");
    expect(d?.facturas).toHaveLength(2);
    expect(d?.facturas[0]).toMatchObject({ proveedor: "Puleva", importe: 22, base: 20, categoria: "Materia prima" });
    expect(d?.facturas[0].lineas[0]).toEqual({ descripcion: "Leche entera 1L", cantidad: 20, unidad: "ud", precio_unitario: 1, importe: 20 });
    expect(d?.facturas[1].categoria).toBe("Otros");
  });

  it("reconoce un ticket de cierre", () => {
    const d = documentoDesdeRespuesta({ tipo: "ticket_cierre", ticket: { venta: 136.7, efectivo: 10.8, banco: 125.9, fecha: "2026-09-29" }, facturas: [] });
    expect(d?.tipo).toBe("ticket_cierre");
    expect(d?.ticket?.venta).toBe(136.7);
  });

  it("descarta datos absurdos y líneas sin importe", () => {
    const d = documentoDesdeRespuesta({
      tipo: "facturas",
      facturas: [{ proveedor: "X", fecha: "no-es-fecha", total: -5, lineas: [{ descripcion: "a", importe: null }, { descripcion: "", importe: 3 }] }],
    });
    expect(d?.facturas[0].fecha).toBeUndefined();
    expect(d?.facturas[0].importe).toBeUndefined();
    expect(d?.facturas[0].lineas).toHaveLength(0);
  });

  it("sin nada útil, el documento es 'otro'", () => {
    expect(documentoDesdeRespuesta({ tipo: "facturas", facturas: [{}] })?.tipo).toBe("otro");
    expect(documentoDesdeRespuesta("basura")).toBeNull();
  });
});

describe("facturaFiable", () => {
  const base: FacturaDatos = { proveedor: "Puleva", fecha: "2026-08-01", importe: 22, base: 20, categoria: "Materia prima", lineas: [] };
  const linea = (importe: number) => ({ descripcion: "Leche", importe });

  it("acepta una factura completa sin líneas", () => {
    expect(facturaFiable(base, "2026-09-30")).toBe(true);
  });
  it("acepta líneas que suman la base o el total", () => {
    expect(facturaFiable({ ...base, lineas: [linea(12), linea(8)] }, "2026-09-30")).toBe(true);
    expect(facturaFiable({ ...base, base: undefined, lineas: [linea(22)] }, "2026-09-30")).toBe(true);
  });
  it("rechaza líneas que no cuadran", () => {
    expect(facturaFiable({ ...base, lineas: [linea(12), linea(3)] }, "2026-09-30")).toBe(false);
  });
  it("rechaza lo incompleto o con fecha futura", () => {
    expect(facturaFiable({ ...base, proveedor: undefined }, "2026-09-30")).toBe(false);
    expect(facturaFiable({ ...base, fecha: undefined }, "2026-09-30")).toBe(false);
    expect(facturaFiable({ ...base, importe: undefined }, "2026-09-30")).toBe(false);
    expect(facturaFiable(base, "2026-07-01")).toBe(false);
  });
});
