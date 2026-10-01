import { describe, expect, it } from "vitest";
import { elegirNivel, NIVELES } from "./comprimir-pdf";

const MB = 1024 * 1024;

describe("elegirNivel", () => {
  it("se queda en el nivel si la proyección cabe", () => {
    expect(elegirNivel(2 * MB, 10, 50, 0)).toBe(0); // 10 MB proyectados
  });
  it("baja un nivel si la proyección se pasa", () => {
    expect(elegirNivel(2 * MB, 10, 100, 0)).toBe(1); // 20 MB proyectados
  });
  it("no baja de la nitidez mínima", () => {
    expect(elegirNivel(50 * MB, 10, 100, NIVELES.length - 1)).toBe(NIVELES.length - 1);
  });
  it("sin páginas hechas no cambia", () => {
    expect(elegirNivel(0, 0, 100, 2)).toBe(2);
  });
});
