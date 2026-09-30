import { describe, expect, it } from "vitest";
import { adjuntosAprovechables, configCorreo } from "../correo";

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
