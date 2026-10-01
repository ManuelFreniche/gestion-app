import { describe, expect, it } from "vitest";
import { limitesMes, mesElegido, mesVecino, nombreMes, resumirGastos } from "../gastos";

describe("mesElegido", () => {
  it("usa el mes pedido si es válido", () => expect(mesElegido("2026-09", "2026-10-01")).toBe("2026-09"));
  it("usa el de hoy si falta o es inválido", () => {
    expect(mesElegido(undefined, "2026-10-01")).toBe("2026-10");
    expect(mesElegido("2026-13", "2026-10-01")).toBe("2026-10");
    expect(mesElegido("hola", "2026-10-01")).toBe("2026-10");
  });
});

describe("limitesMes", () => {
  it("da el primer día del mes y del siguiente", () => {
    expect(limitesMes("2026-09")).toEqual({ desde: "2026-09-01", hasta: "2026-10-01" });
  });
  it("pasa de diciembre a enero", () => {
    expect(limitesMes("2026-12")).toEqual({ desde: "2026-12-01", hasta: "2027-01-01" });
  });
});

describe("mesVecino", () => {
  it("avanza y retrocede, también entre años", () => {
    expect(mesVecino("2026-09", 1)).toBe("2026-10");
    expect(mesVecino("2026-09", -1)).toBe("2026-08");
    expect(mesVecino("2026-12", 1)).toBe("2027-01");
    expect(mesVecino("2026-01", -1)).toBe("2025-12");
  });
});

describe("nombreMes", () => {
  it("lo escribe en español con mayúscula", () => expect(nombreMes("2026-09")).toBe("Septiembre de 2026"));
});

describe("resumirGastos", () => {
  it("suma por categoría y ordena de mayor a menor", () => {
    const r = resumirGastos([
      { categoria: "Materia prima", importe: 100.1 },
      { categoria: "Alquiler", importe: 650 },
      { categoria: "Materia prima", importe: 200.2 },
    ]);
    expect(r.total).toBe(950.3);
    expect(r.porCategoria).toEqual([
      { categoria: "Alquiler", total: 650 },
      { categoria: "Materia prima", total: 300.3 },
    ]);
  });
  it("sin gastos da cero", () => expect(resumirGastos([])).toEqual({ total: 0, porCategoria: [] }));
  it("no arrastra errores de coma flotante", () => {
    expect(resumirGastos([{ categoria: "Otros", importe: 0.1 }, { categoria: "Otros", importe: 0.2 }]).total).toBe(0.3);
  });
});
