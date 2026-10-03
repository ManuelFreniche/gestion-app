import { describe, expect, it } from "vitest";
import type { FacturaDatos } from "../factura";
import { cierreRepetido, claveContenido, facturasRepetidas, pendientesRepetidos } from "../repetidos";

const f = (extra: Partial<FacturaDatos> = {}): FacturaDatos => ({
  proveedor: "Lactalis S.L.",
  fecha: "2026-09-10",
  importe: 121,
  categoria: "Materia prima",
  lineas: [],
  ...extra,
});

describe("claveContenido", () => {
  it("no distingue mayúsculas, tildes ni la forma social", () => {
    expect(claveContenido({ proveedor: "LACTALIS, S.L.", fecha: "2026-09-10", importe: 121 })).toBe(
      claveContenido({ proveedor: "lactalis", fecha: "2026-09-10", importe: 121.0 }),
    );
  });
  it("distingue el importe al céntimo y el día", () => {
    expect(claveContenido(f())).not.toBe(claveContenido(f({ importe: 121.01 })));
    expect(claveContenido(f())).not.toBe(claveContenido(f({ fecha: "2026-09-11" })));
  });
  it("sin proveedor, fecha o importe no hay clave", () => {
    expect(claveContenido(f({ proveedor: "" }))).toBeNull();
    expect(claveContenido(f({ fecha: undefined }))).toBeNull();
    expect(claveContenido(f({ importe: 0 }))).toBeNull();
  });
});

describe("facturasRepetidas", () => {
  const conocidas = new Set([claveContenido(f())!]);
  it("es repetido si todas las facturas ya se conocen", () => {
    expect(facturasRepetidas([f()], conocidas)).toBe(true);
  });
  it("no lo es si alguna es nueva", () => {
    expect(facturasRepetidas([f(), f({ importe: 50 })], conocidas)).toBe(false);
  });
  it("no lo es si alguna no se leyó completa", () => {
    expect(facturasRepetidas([f(), f({ proveedor: undefined })], conocidas)).toBe(false);
    expect(facturasRepetidas([], conocidas)).toBe(false);
  });
  it("una factura nueva repetida dentro del mismo documento no basta", () => {
    expect(facturasRepetidas([f({ importe: 50 }), f({ importe: 50 })], new Set())).toBe(false);
  });
  it("con un documento de dos facturas iguales y una ya conocida, todo es repetido", () => {
    expect(facturasRepetidas([f(), f()], conocidas)).toBe(true);
  });
});

describe("cierreRepetido", () => {
  const conocidos = [{ fecha: "2026-09-30", venta: 220.6 }];
  it("mismo día y misma venta es repetido", () => {
    expect(cierreRepetido({ fecha: "2026-09-30", venta: 220.6 }, conocidos)).toBe(true);
  });
  it("otra venta el mismo día no lo es: lo decide una persona", () => {
    expect(cierreRepetido({ fecha: "2026-09-30", venta: 221 }, conocidos)).toBe(false);
  });
  it("otro día no lo es, ni un cierre sin leer", () => {
    expect(cierreRepetido({ fecha: "2026-09-29", venta: 220.6 }, conocidos)).toBe(false);
    expect(cierreRepetido({}, conocidos)).toBe(false);
  });
});

describe("pendientesRepetidos", () => {
  const registradas = { facturas: new Set<string>(), cierres: [] as { fecha: string; venta: number }[] };
  const doc = (id: string, facturas: FacturaDatos[]) => ({ id, tipo: "factura", datos: { facturas } });
  const cierre = (id: string, fecha: string, venta: number) => ({ id, tipo: "cierre", datos: { fecha, venta } });

  it("conserva el primero y descarta los siguientes iguales", () => {
    expect(pendientesRepetidos([doc("a", [f()]), doc("b", [f()]), doc("c", [f()])], registradas)).toEqual(["b", "c"]);
  });
  it("descarta lo que ya está registrado en las cuentas", () => {
    const r = { facturas: new Set([claveContenido(f())!]), cierres: [{ fecha: "2026-09-30", venta: 10 }] };
    expect(pendientesRepetidos([doc("a", [f()]), cierre("b", "2026-09-30", 10), cierre("c", "2026-09-30", 11)], r)).toEqual(["a", "b"]);
  });
  it("no toca lo distinto ni los documentos con una parte ya decidida", () => {
    const decidido = { id: "d", tipo: "factura", datos: { facturas: [f()], partes: { facturas: "descartada" } } };
    expect(pendientesRepetidos([doc("a", [f()]), doc("b", [f({ importe: 5 })]), decidido], registradas)).toEqual([]);
  });
  it("un cierre y una factura nunca se confunden y los de otro tipo se ignoran", () => {
    expect(pendientesRepetidos([cierre("a", "2026-09-30", 10), doc("b", [f()]), { id: "c", tipo: "ingresos", datos: {} }], registradas)).toEqual([]);
  });
});
