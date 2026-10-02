import { describe, expect, it } from "vitest";
import { leerLoteCierres } from "../lote-cierres";

const LOCAL = "11111111-1111-4111-8111-111111111111";
const DOC_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DOC_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function formulario(filas: Record<string, string>[], comun: Record<string, string> = { local: LOCAL }) {
  const f = new FormData();
  f.set("cantidad", String(filas.length));
  for (const [k, v] of Object.entries(comun)) f.set(k, v);
  filas.forEach((fila, i) => {
    for (const [k, v] of Object.entries(fila)) f.set(`${k}_${i}`, v);
  });
  return f;
}

const fila = (extra: Record<string, string> = {}) => ({ incluir: "on", documento: DOC_A, fecha: "2026-10-01", venta: "331,80", efectivo: "55,60", banco: "276,20", ...extra });

describe("leerLoteCierres", () => {
  it("lee las filas marcadas con sus importes", () => {
    const r = leerLoteCierres(formulario([fila(), fila({ incluir: "off", documento: DOC_B, fecha: "2026-09-30" })]), "2026-10-02");
    expect(r).toEqual({ filas: [{ documento: DOC_A, local: LOCAL, fecha: "2026-10-01", venta: 331.8, efectivo: 55.6, banco: 276.2 }] });
  });

  it("efectivo y tarjeta pueden quedar vacíos", () => {
    const r = leerLoteCierres(formulario([fila({ efectivo: "", banco: "" })]), "2026-10-02");
    expect(r).toMatchObject({ filas: [{ efectivo: null, banco: null }] });
  });

  it("un día sin ventas (0,00) es válido", () => {
    expect(leerLoteCierres(formulario([fila({ venta: "0,00" })]), "2026-10-02")).toMatchObject({ filas: [{ venta: 0 }] });
  });

  it("pide la fecha si falta: nunca se usa 'hoy' por su cuenta", () => {
    expect(leerLoteCierres(formulario([fila({ fecha: "" })]), "2026-10-02")).toEqual({ error: "Elige el día del cierre (fila 1)." });
  });

  it("rechaza un día futuro", () => {
    expect(leerLoteCierres(formulario([fila({ fecha: "2026-10-03" })]), "2026-10-02")).toEqual({
      error: "El 03/10/2026 es un día futuro: corrige la fecha o desmárcalo.",
    });
  });

  it("rechaza una venta ilegible o ambigua", () => {
    expect(leerLoteCierres(formulario([fila({ venta: "12,345" })]), "2026-10-02")).toMatchObject({ error: expect.stringContaining("Escribe la venta del 01/10/2026") });
    expect(leerLoteCierres(formulario([fila({ venta: "" })]), "2026-10-02")).toMatchObject({ error: expect.stringContaining("Escribe la venta") });
  });

  it("rechaza efectivo o tarjeta que no son importes", () => {
    expect(leerLoteCierres(formulario([fila({ banco: "abc" })]), "2026-10-02")).toMatchObject({ error: expect.stringContaining("Revisa efectivo y tarjeta") });
  });

  it("no deja meter dos cierres del mismo día y local", () => {
    const r = leerLoteCierres(formulario([fila(), fila({ documento: DOC_B })]), "2026-10-02");
    expect(r).toEqual({ error: "El día 01/10/2026 sale dos veces. Desmarca uno de los dos cierres." });
  });

  it("acepta un local distinto por fila", () => {
    const otro = "22222222-2222-4222-8222-222222222222";
    const r = leerLoteCierres(formulario([fila({ local: LOCAL }), fila({ documento: DOC_B, local: otro })], {}), "2026-10-02");
    expect(r).toMatchObject({ filas: [{ local: LOCAL }, { local: otro }] });
  });

  it("pide marcar al menos uno y rechaza identificadores falsos", () => {
    expect(leerLoteCierres(formulario([fila({ incluir: "off" })]), "2026-10-02")).toEqual({ error: "Marca al menos un cierre para meterlo." });
    expect(leerLoteCierres(formulario([fila({ documento: "no-es-uuid" })]), "2026-10-02")).toMatchObject({ error: expect.stringContaining("Algo ha ido mal") });
    expect(leerLoteCierres(new FormData(), "2026-10-02")).toMatchObject({ error: expect.stringContaining("Algo ha ido mal") });
  });
});
