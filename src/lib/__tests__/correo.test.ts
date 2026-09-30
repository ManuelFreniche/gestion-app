import { describe, expect, it } from "vitest";
import { adjuntosAprovechables, configCorreo, faltanVariablesCorreo, tramoValido } from "../correo";

const adjunto = (filename: string, contentType: string, size: number, related = false) => ({
  filename,
  contentType,
  size,
  related,
  content: Buffer.alloc(size, 1),
});

describe("adjuntosAprovechables", () => {
  it("se queda con los PDF, sea cual sea su tamaño", () => {
    const r = adjuntosAprovechables([adjunto("factura.pdf", "application/pdf", 5_000)]);
    expect(r).toHaveLength(1);
    expect(r[0].nombre).toBe("factura.pdf");
  });

  it("reconoce un PDF mandado como binario genérico", () => {
    const r = adjuntosAprovechables([adjunto("Factura agosto.PDF", "application/octet-stream", 90_000)]);
    expect(r[0]?.tipo).toBe("application/pdf");
  });

  it("descarta logos: imágenes pequeñas o incrustadas en el correo", () => {
    const r = adjuntosAprovechables([
      adjunto("logo.png", "image/png", 8_000),
      adjunto("firma.jpg", "image/jpeg", 200_000, true),
      adjunto("foto-factura.jpg", "image/jpeg", 300_000),
    ]);
    expect(r.map((a) => a.nombre)).toEqual(["foto-factura.jpg"]);
  });

  it("descarta otros tipos y archivos demasiado grandes", () => {
    const r = adjuntosAprovechables([
      adjunto("datos.xlsx", "application/vnd.ms-excel", 50_000),
      adjunto("enorme.pdf", "application/pdf", 13 * 1024 * 1024),
    ]);
    expect(r).toHaveLength(0);
  });
});

describe("configCorreo", () => {
  it("solo se activa con usuario, clave y negocio", () => {
    const antes = { ...process.env };
    delete process.env.GMAIL_USUARIO;
    expect(configCorreo()).toBeNull();
    process.env.GMAIL_USUARIO = "a@gmail.com";
    process.env.GMAIL_CLAVE_APP = "abcd efgh ijkl mnop";
    process.env.CORREO_ORGANIZACION = "org-1";
    expect(configCorreo()).toMatchObject({ usuario: "a@gmail.com", clave: "abcdefghijklmnop", organizacion: "org-1", dias: 14 });
    process.env = antes;
  });
});

describe("faltanVariablesCorreo", () => {
  it("dice qué variables faltan y si el negocio no coincide", () => {
    const antes = { ...process.env };
    delete process.env.GMAIL_USUARIO;
    delete process.env.GMAIL_CLAVE_APP;
    delete process.env.CORREO_ORGANIZACION;
    expect(faltanVariablesCorreo("org-1")).toHaveLength(3);
    process.env.GMAIL_USUARIO = "a@gmail.com";
    process.env.GMAIL_CLAVE_APP = "x";
    process.env.CORREO_ORGANIZACION = "org-2";
    expect(faltanVariablesCorreo("org-1")[0]).toContain("no es el id");
    process.env.CORREO_ORGANIZACION = "org-1";
    expect(faltanVariablesCorreo("org-1")).toEqual([]);
    process.env = antes;
  });
});

describe("tramoValido", () => {
  it("acepta fechas reales en orden y de hasta un año", () => {
    expect(tramoValido("2026-08-01", "2026-08-31")).toEqual({ desde: "2026-08-01", hasta: "2026-08-31" });
    expect(tramoValido("2026-08-05", "2026-08-05")).not.toBeNull();
  });
  it("rechaza fechas inventadas, al revés o de más de un año", () => {
    expect(tramoValido("2026-02-31", "2026-03-05")).toBeNull();
    expect(tramoValido("2026-08-31", "2026-08-01")).toBeNull();
    expect(tramoValido("2024-01-01", "2026-01-01")).toBeNull();
    expect(tramoValido("ayer", "hoy")).toBeNull();
    expect(tramoValido(undefined, "2026-08-01")).toBeNull();
  });
});
