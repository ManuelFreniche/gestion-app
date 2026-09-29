import { describe, expect, it } from "vitest";
import { modulosVisibles } from "../permisos";

describe("modulosVisibles", () => {
  const activos = ["inventario", "gastos", "facturas", "ventas", "margenes"];

  it("un empleado no ve márgenes ni gastos", () => {
    const permisos = new Set(["ventas.ver", "ventas.editar", "inventario.ver", "facturas.subir"]);
    expect(modulosVisibles(permisos, activos).map((m) => m.clave)).toEqual(["ventas", "inventario"]);
  });

  it("la gestoría solo ve gastos y facturas", () => {
    const permisos = new Set(["gastos.ver", "facturas.ver", "exportar.usar"]);
    expect(modulosVisibles(permisos, activos).map((m) => m.clave)).toEqual(["gastos", "facturas"]);
  });

  it("un módulo desactivado en el negocio no aparece aunque el rol lo permita", () => {
    const permisos = new Set(["ventas.ver", "margenes.ver"]);
    expect(modulosVisibles(permisos, ["ventas"]).map((m) => m.clave)).toEqual(["ventas"]);
  });
});
