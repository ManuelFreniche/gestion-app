import { describe, expect, it } from "vitest";
import { detectarFecha, detectarTotal, leerFactura, leerFacturasPorPaginas, limpiarImporte } from "../factura";

describe("limpiarImporte", () => {
  it("entiende los formatos habituales", () => {
    expect(limpiarImporte("1.234,56")).toBe(1234.56);
    expect(limpiarImporte("1234.56")).toBe(1234.56);
    expect(limpiarImporte("84,5")).toBe(84.5);
    expect(limpiarImporte("1,234.50")).toBe(1234.5);
  });
});

describe("leerFactura", () => {
  it("lee una factura de Leroy Merlin", () => {
    const texto = `LEROY MERLIN ESPAÑA S.L.U.
Factura Nº: A-2026/1234
Fecha: 10/08/2026
Base imponible 69,83 €
IVA 21% 14,67 €
TOTAL A PAGAR 84,50 €`;
    expect(leerFactura(texto)).toEqual({
      proveedor: "Leroy Merlín",
      categoria: "Suministros",
      importe: 84.5,
      fecha: "2026-08-10",
      numero: "A-2026/1234",
    });
  });

  it("no confunde la base imponible con el total", () => {
    const texto = "Indalpesa S.L.\nFecha 03-08-2026\nBase imponible 100,00\nTotal 121,00";
    expect(leerFactura(texto)).toMatchObject({ proveedor: "Indalpesa", importe: 121, fecha: "2026-08-03" });
  });

  it("tolera tildes mal leídas por el OCR", () => {
    expect(leerFactura("CAFES SALVADOR E HIJOS\nTotal factura: 1.234,56")).toMatchObject({
      proveedor: "Cafés Salvador e Hijos",
      importe: 1234.56,
    });
  });

  it("deja vacío lo que no encuentra", () => {
    expect(leerFactura("Proveedor desconocido\nTotal a pagar 50,00 €")).toMatchObject({
      proveedor: null,
      categoria: "Otros",
      importe: 50,
      fecha: null,
    });
  });

  it("no toma por factura un texto cualquiera", () => {
    expect(leerFactura("hola, esto no es nada")).toBeNull();
  });
});

describe("detectarFecha", () => {
  it("rechaza fechas imposibles", () => {
    expect(detectarFecha("31/02/2026")).toBeNull();
    expect(detectarFecha("Emitida el 5/8/26")).toBe("2026-08-05");
  });
});

describe("detectarTotal", () => {
  it("usa el mayor importe con € como último recurso", () => {
    expect(detectarTotal("Línea 10,00 €\nLínea 25,50 €")).toBe(25.5);
  });
});

describe("leerFacturasPorPaginas", () => {
  const pagina = (numero: string, total: string) =>
    `PANADERÍA DEL ROSAL\nFECHA: 20/08/2026 NÚMERO:A ${numero}\nCHAPATA GOLDEN 13,99\nBASE IMPONIBLE 13,99\nTOTAL 14,55 €${total}`;

  it("separa una factura por página y las suma aparte", () => {
    const f = leerFacturasPorPaginas([pagina("1329754", ""), pagina("1329801", "")].map((p, i) => (i ? p.replace("14,55", "20,10") : p)));
    expect(f).toHaveLength(2);
    expect(f.map((x) => x.importe)).toEqual([14.55, 20.1]);
    expect(f[0].proveedor).toBe("Panadería del Rosal");
  });

  it("ignora páginas de continuación y repetidas", () => {
    const f = leerFacturasPorPaginas([pagina("1329754", ""), "Condiciones generales de venta y protección de datos personales del proveedor.", pagina("1329754", "")]);
    expect(f).toHaveLength(1);
  });
});
