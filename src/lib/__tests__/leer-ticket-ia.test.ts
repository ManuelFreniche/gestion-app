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
    const t = ticketDesdeRespuesta({ venta: 50, efectivo: -3, banco: "12", fecha: "ayer" });
    expect(t).toMatchObject({ venta: 50, efectivo: null, banco: null, fecha: null });
  });
});
