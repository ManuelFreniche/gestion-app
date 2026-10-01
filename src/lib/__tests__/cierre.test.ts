import { describe, expect, it } from "vitest";
import { esFecha, hoyEn, leerImporte, leerImporteConSigno, sumarDias } from "../cierre";

describe("leerImporte", () => {
  it("entiende coma y punto decimal", () => {
    expect(leerImporte("512,40")).toBe(512.4);
    expect(leerImporte("512.40")).toBe(512.4);
    expect(leerImporte("512")).toBe(512);
  });

  it("entiende miles y el símbolo del euro", () => {
    expect(leerImporte("1.234,50 €")).toBe(1234.5);
    expect(leerImporte("1,234.50")).toBe(1234.5);
  });

  it("rechaza lo que no es un importe", () => {
    expect(leerImporte("")).toBeNull();
    expect(leerImporte("mucho")).toBeNull();
    expect(leerImporte("-5")).toBeNull();
    expect(leerImporte("12,345")).toBeNull();
  });
});

describe("fechas", () => {
  it("hoy depende de la zona horaria del negocio", () => {
    const instante = new Date("2026-09-30T23:30:00Z");
    expect(hoyEn("Europe/Madrid", instante)).toBe("2026-10-01");
    expect(hoyEn("America/Mexico_City", instante)).toBe("2026-09-30");
  });

  it("valida y suma días", () => {
    expect(esFecha("2026-09-30")).toBe(true);
    expect(esFecha("30/09/2026")).toBe(false);
    expect(sumarDias("2026-09-30", 1)).toBe("2026-10-01");
    expect(sumarDias("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("leerImporteConSigno", () => {
  it("admite un menos delante para los abonos", () => {
    expect(leerImporteConSigno("-121,00")).toBe(-121);
    expect(leerImporteConSigno("−1.234,50")).toBe(-1234.5);
    expect(leerImporteConSigno("121,00")).toBe(121);
  });
  it("rechaza lo que no es un importe", () => {
    expect(leerImporteConSigno("-")).toBeNull();
    expect(leerImporteConSigno("--5")).toBeNull();
  });
});
