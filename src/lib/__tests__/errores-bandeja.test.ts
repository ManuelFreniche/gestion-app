import { describe, expect, it } from "vitest";
import { FACTURA_REPETIDA, mensajeDeLaRegla, mensajeDeshacer } from "../errores-bandeja";

describe("mensajeDeLaRegla", () => {
  it("enseña tal cual el mensaje de una regla del negocio (P0001)", () => {
    expect(mensajeDeLaRegla({ code: "P0001", message: "El 05/10/2026 es un día futuro: elige el día en que se hizo la venta." })).toBe(
      "El 05/10/2026 es un día futuro: elige el día en que se hizo la venta.",
    );
  });

  it("no enseña mensajes de otros errores, que son técnicos", () => {
    expect(mensajeDeLaRegla({ code: "42501", message: "permission denied for table x" })).toBeNull();
    expect(mensajeDeLaRegla({ code: "23505", message: "duplicate key value violates unique constraint" })).toBeNull();
    expect(mensajeDeLaRegla({ message: "fetch failed" })).toBeNull();
  });

  it("no devuelve un mensaje vacío ni uno larguísimo", () => {
    expect(mensajeDeLaRegla({ code: "P0001", message: "   " })).toBeNull();
    expect(mensajeDeLaRegla({ code: "P0001", message: null })).toBeNull();
    expect(mensajeDeLaRegla({ code: "P0001", message: "x".repeat(1000) })?.length).toBe(300);
  });
});

describe("mensajeDeshacer", () => {
  it("usa la regla cuando la base de datos explica por qué no se puede", () => {
    expect(mensajeDeshacer({ code: "P0001", message: "Alguna factura de este documento está marcada como pagada." })).toBe(
      "Alguna factura de este documento está marcada como pagada.",
    );
  });

  it("dice que ya no se puede cuando el documento no existe o ya se deshizo", () => {
    expect(mensajeDeshacer({ code: "P0002", message: "El documento no existe o ya no se puede deshacer" })).toContain("Recarga la página");
  });

  it("para cualquier otro fallo da una frase sin jerga", () => {
    expect(mensajeDeshacer({ code: "XX000", message: "internal error" })).toBe("No se pudo deshacer. Inténtalo de nuevo.");
    expect(mensajeDeshacer({})).toBe("No se pudo deshacer. Inténtalo de nuevo.");
  });
});

describe("FACTURA_REPETIDA", () => {
  it("explica qué hacer", () => {
    expect(FACTURA_REPETIDA).toContain("ya está registrada");
    expect(FACTURA_REPETIDA).toContain("Desmárcala");
  });
});
