import { describe, expect, it } from "vitest";
import { protegerAccion, SIN_CONEXION } from "../enviar-formulario";

describe("protegerAccion", () => {
  it("devuelve lo que contesta la acción cuando todo va bien", async () => {
    const accion = protegerAccion(async (a: number, b: number) => ({ error: undefined, suma: a + b }));
    expect(await accion(2, 3)).toEqual({ error: undefined, suma: 5 });
  });

  it("deja pasar un error normal de la acción tal como viene", async () => {
    const accion = protegerAccion(async () => ({ error: "No tienes permiso." }));
    expect(await accion()).toEqual({ error: "No tienes permiso." });
  });

  it("convierte una promesa rechazada (sin cobertura, tiempo agotado) en un error en español", async () => {
    const accion = protegerAccion(async () => {
      throw new Error("Failed to fetch");
    });
    expect(await accion()).toEqual({ error: SIN_CONEXION });
  });

  it("usa el mensaje propio cuando se da uno", async () => {
    const accion = protegerAccion(async () => {
      throw new Error("x");
    }, "No he podido guardar.");
    expect(await accion()).toEqual({ error: "No he podido guardar." });
  });
});
