import { describe, expect, it } from "vitest";
import { tramosRapidos } from "../tramos-rapidos";

describe("tramosRapidos", () => {
  it("da los últimos 30 días, este mes y el mes pasado", () => {
    expect(tramosRapidos("2026-10-02")).toEqual([
      { nombre: "Últimos 30 días", desde: "2026-09-03", hasta: "2026-10-02" },
      { nombre: "Este mes", desde: "2026-10-01", hasta: "2026-10-02" },
      { nombre: "Mes pasado", desde: "2026-09-01", hasta: "2026-09-30" },
    ]);
  });

  it("el mes pasado de enero es diciembre del año anterior", () => {
    expect(tramosRapidos("2027-01-15")[2]).toEqual({ nombre: "Mes pasado", desde: "2026-12-01", hasta: "2026-12-31" });
  });
});
