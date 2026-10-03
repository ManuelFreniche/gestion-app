import { describe, expect, it } from "vitest";
import { CODIGO_VALIDO, destinoSeguro } from "../destino-invitacion";
import { codigoNuevo, resumenCodigo } from "../codigo-invitacion";
import { enlaceInvitacion, esRolInvitable, estadoInvitacion } from "../invitaciones";

describe("código de invitación", () => {
  it("es largo, seguro para una dirección web y distinto cada vez", () => {
    const a = codigoNuevo();
    expect(a).toMatch(CODIGO_VALIDO);
    expect(a.length).toBeGreaterThanOrEqual(40);
    expect(codigoNuevo()).not.toBe(a);
  });

  it("se guarda como resumen de 64 caracteres, siempre el mismo para el mismo código", () => {
    expect(resumenCodigo("hola")).toBe("b221d9dbb083a7f33428d7c2a3c3198ae925614d70210e28716ccaa7cd4ddb79");
    expect(resumenCodigo("hola")).toHaveLength(64);
    expect(resumenCodigo("hola")).not.toBe(resumenCodigo("hola "));
  });

  it("el enlace no duplica barras", () => {
    expect(enlaceInvitacion("https://app.test/", "abc")).toBe("https://app.test/invitacion/abc");
  });
});

describe("roles invitables", () => {
  it("no se invita a dueños", () => {
    expect(esRolInvitable("empleado")).toBe(true);
    expect(esRolInvitable("gestoria")).toBe(true);
    expect(esRolInvitable("dueno")).toBe(false);
    expect(esRolInvitable("administrador")).toBe(false);
  });
});

describe("destinoSeguro", () => {
  const codigo = "A".repeat(43);
  it("acepta solo enlaces de invitación de esta web", () => {
    expect(destinoSeguro(`/invitacion/${codigo}`)).toBe(`/invitacion/${codigo}`);
  });
  it("rechaza direcciones ajenas, otras rutas y códigos raros", () => {
    expect(destinoSeguro("https://malo.test/invitacion/" + codigo)).toBeNull();
    expect(destinoSeguro("//malo.test/invitacion/" + codigo)).toBeNull();
    expect(destinoSeguro("/negocios")).toBeNull();
    expect(destinoSeguro(`/invitacion/${codigo}/../x`)).toBeNull();
    expect(destinoSeguro("/invitacion/corto")).toBeNull();
    expect(destinoSeguro(undefined)).toBeNull();
  });
});

describe("estadoInvitacion", () => {
  const ahora = new Date("2026-10-10T12:00:00Z");
  it("distingue vigente, usada y caducada", () => {
    expect(estadoInvitacion({ usada_en: null, caduca_en: "2026-10-11T00:00:00Z" }, ahora)).toBe("vigente");
    expect(estadoInvitacion({ usada_en: null, caduca_en: "2026-10-09T00:00:00Z" }, ahora)).toBe("caducada");
    expect(estadoInvitacion({ usada_en: "2026-10-09T00:00:00Z", caduca_en: "2026-10-20T00:00:00Z" }, ahora)).toBe("usada");
  });
});
