import { describe, expect, it } from "vitest";
import { euros } from "../cierre";
import { marcadoPorDefecto, ordenarCierres, problemasFila, valoresIniciales, type CierrePendiente } from "../cierres-bandeja";

const cierre = (extra: Partial<CierrePendiente> = {}): CierrePendiente => ({
  id: "a",
  clave: "a-1",
  nombre: "Cierres de caja.pdf",
  tipoArchivo: "application/pdf",
  url: "https://x/y.pdf",
  recibido: "2 oct",
  fecha: "2026-10-01",
  venta: 331.8,
  efectivo: 55.6,
  banco: 276.2,
  ...extra,
});
const contexto = { hoy: "2026-10-02", repetidoEnLote: false, ventasPorDia: {} as Record<string, number> };

describe("valoresIniciales", () => {
  it("escribe los importes con coma y deja vacío lo que no se leyó", () => {
    expect(valoresIniciales(cierre())).toEqual({ fecha: "2026-10-01", venta: "331,80", efectivo: "55,60", banco: "276,20" });
    expect(valoresIniciales(cierre({ fecha: undefined, venta: undefined, efectivo: undefined, banco: undefined }))).toEqual({ fecha: "", venta: "", efectivo: "", banco: "" });
  });
});

describe("marcadoPorDefecto", () => {
  it("marca solo lo leído entero y sin avisos", () => {
    expect(marcadoPorDefecto(cierre())).toBe(true);
    expect(marcadoPorDefecto(cierre({ fecha: undefined }))).toBe(false);
    expect(marcadoPorDefecto(cierre({ venta: undefined }))).toBe(false);
    expect(marcadoPorDefecto(cierre({ aviso: "Las cifras no cuadran" }))).toBe(false);
  });
});

describe("ordenarCierres", () => {
  it("pone primero los que no tienen fecha y después de más viejo a más nuevo", () => {
    const filas = [{ fecha: "2026-10-01" }, { fecha: undefined }, { fecha: "2026-09-15" }];
    expect(ordenarCierres(filas).map((f) => f.fecha)).toEqual([undefined, "2026-09-15", "2026-10-01"]);
  });
});

describe("problemasFila", () => {
  it("un cierre bien leído no tiene problemas", () => {
    expect(problemasFila(cierre(), valoresIniciales(cierre()), contexto)).toEqual({ bloqueantes: [], avisos: [] });
  });

  it("sin fecha no se puede meter (nunca se usa hoy por su cuenta)", () => {
    const v = valoresIniciales(cierre({ fecha: undefined }));
    expect(problemasFila(cierre({ fecha: undefined }), v, contexto).bloqueantes[0]).toMatch(/Elige el día del cierre/);
  });

  it("no deja un día futuro ni una venta ilegible", () => {
    const v = { ...valoresIniciales(cierre()), fecha: "2026-10-05", venta: "abc" };
    const { bloqueantes } = problemasFila(cierre(), v, contexto);
    expect(bloqueantes).toContain("Es un día futuro: corrige la fecha.");
    expect(bloqueantes).toContain("La venta no es un importe válido.");
  });

  it("avisa si efectivo y tarjeta suman más que la venta", () => {
    const v = { ...valoresIniciales(cierre()), venta: "100" };
    expect(problemasFila(cierre(), v, contexto).avisos[0]).toMatch(/suman más que la venta/);
  });

  it("avisa de lo que ya hay en Ventas ese día y de que se cambiaría", () => {
    const { avisos } = problemasFila(cierre(), valoresIniciales(cierre()), { ...contexto, ventasPorDia: { "2026-10-01": 313.6 } });
    expect(avisos).toEqual([`Ese día ya hay en Ventas ${euros(313.6)}: se cambiaría por este.`]);
  });

  it("no avisa si lo que hay en Ventas es lo mismo", () => {
    expect(problemasFila(cierre(), valoresIniciales(cierre()), { ...contexto, ventasPorDia: { "2026-10-01": 331.8 } }).avisos).toEqual([]);
  });

  it("bloquea un día repetido dentro de la selección y enseña el aviso del lector", () => {
    const r = problemasFila(cierre({ aviso: "Las cifras del cierre no cuadran." }), valoresIniciales(cierre()), { ...contexto, repetidoEnLote: true });
    expect(r.bloqueantes).toContain("Hay otro cierre marcado del mismo día: desmarca uno.");
    expect(r.avisos).toContain("Las cifras del cierre no cuadran.");
  });
});
