import { describe, expect, it } from "vitest";
import { ticketDesdeRespuesta } from "../leer-ticket-ia";

describe("ticketDesdeRespuesta", () => {
  it("acepta importes y fecha válidos", () => {
    expect(ticketDesdeRespuesta({ venta: 136.7, efectivo: 10.8, banco: 125.9, fecha: "2026-09-29" })).toEqual({
      venta: 136.7,
      efectivo: 10.8,
      banco: 125.9,
      ticketMedio: null,
      fecha: "2026-09-29",
    });
  });
  it("sin venta no hay ticket", () => {
    expect(ticketDesdeRespuesta({ venta: null, efectivo: 1, banco: 1, fecha: null })).toBeNull();
    expect(ticketDesdeRespuesta("hola")).toBeNull();
  });
  it("descarta datos absurdos", () => {
    const t = ticketDesdeRespuesta({ venta: 50, efectivo: -3, banco: "no sé", fecha: "ayer" });
    expect(t).toMatchObject({ venta: 50, efectivo: null, banco: null, fecha: null });
  });
  it("entiende importes y fechas escritos como texto", () => {
    const t = ticketDesdeRespuesta({ venta: "331,80", efectivo: "55,60 €", banco: "276.20", fecha: "01/10/2026" });
    expect(t).toMatchObject({ venta: 331.8, efectivo: 55.6, banco: 276.2, fecha: "2026-10-01" });
  });
});

import { jsonDeTexto } from "../leer-ticket-ia";

describe("jsonDeTexto", () => {
  it("saca el JSON aunque el modelo añada texto", () => {
    expect(jsonDeTexto('Aquí está:\n```json\n{"venta": 12.5}\n```')).toEqual({ venta: 12.5 });
    expect(jsonDeTexto("sin datos")).toBeNull();
  });
});

import { fechaFlexible, numeroFlexible } from "../leer-ticket-ia";

describe("numeroFlexible", () => {
  it("lee números, textos y paréntesis como negativo", () => {
    expect(numeroFlexible(12.5)).toBe(12.5);
    expect(numeroFlexible("12.5")).toBe(12.5);
    expect(numeroFlexible("1.234,56")).toBe(1234.56);
    expect(numeroFlexible("1 581,00 €")).toBe(1581);
    expect(numeroFlexible("(121,00)")).toBe(-121);
    expect(numeroFlexible("-12,5")).toBe(-12.5);
    expect(numeroFlexible("0.500")).toBe(0.5);
    expect(numeroFlexible("331,80 €")).toBe(331.8);
  });
  it("lo que no es un número es null", () => {
    for (const v of ["", "no sé", null, undefined, {}, Number.NaN]) expect(numeroFlexible(v)).toBeNull();
  });
});

describe("fechaFlexible", () => {
  it("acepta aaaa-mm-dd y dd/mm/aaaa", () => {
    expect(fechaFlexible("2026-08-28")).toBe("2026-08-28");
    expect(fechaFlexible("28/08/2026")).toBe("2026-08-28");
    expect(fechaFlexible("1-9-26")).toBe("2026-09-01");
    expect(fechaFlexible("05.10.2026")).toBe("2026-10-05");
  });
  it("rechaza lo que no es una fecha de verdad", () => {
    for (const v of ["ayer", "31/02/2026", "2026-02-31", "", 20260828, null]) expect(fechaFlexible(v)).toBeNull();
  });
});
