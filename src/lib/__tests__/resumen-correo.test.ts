import { describe, expect, it } from "vitest";
import { resultadoVacio } from "../correo";
import { acumuladoVacio, resumenCorreo, sumarVuelta } from "../resumen-correo";

describe("resumenCorreo", () => {
  it("dice cuántos documentos nuevos hay", () => {
    expect(resumenCorreo({ ...acumuladoVacio(), nuevos: 13, encontrados: 16, repetidos: 3 })).toBe(
      "Listo: 13 documentos nuevos en la Bandeja, aquí abajo para que los revises. 3 documentos ya estaban en la Bandeja o ya metidos.",
    );
    expect(resumenCorreo({ ...acumuladoVacio(), nuevos: 1, encontrados: 1 })).toContain("1 documento nuevo ");
  });

  it("explica que ya lo revisó todo cuando no hay correos nuevos", () => {
    const texto = resumenCorreo({ ...acumuladoVacio(), yaRevisados: 22 });
    expect(texto).toContain("ya revisé los 22 correos con adjuntos");
    expect(texto).toContain("Buscar documentos entre dos fechas");
  });

  it("dice que Gmail no tiene nada en el tramo pedido", () => {
    expect(resumenCorreo(acumuladoVacio(), { desde: "2026-09-15", hasta: "2026-10-01" })).toBe(
      "Gmail no tiene ningún correo con adjuntos entre el 15/09/2026 y el 01/10/2026.",
    );
  });

  it("explica por qué no hay nada nuevo aunque haya correos", () => {
    const texto = resumenCorreo({ ...acumuladoVacio(), encontrados: 20, repetidos: 14, fueraDeTramo: 4, sinAdjuntos: 2 });
    expect(texto).toContain("He mirado 20 correos con adjuntos y no hay nada nuevo");
    expect(texto).toContain("14 documentos ya estaban");
    expect(texto).toContain("4 correos caen fuera de esas fechas");
    expect(texto).toContain("2 correos no traen ningún PDF ni foto");
  });

  it("avisa de los adjuntos que no se pudieron leer", () => {
    expect(resumenCorreo({ ...acumuladoVacio(), nuevos: 2, encontrados: 3, sinLeer: 1 })).toContain("1 adjunto no se pudo leer; se reintentará");
  });
});

describe("sumarVuelta", () => {
  it("suma las vueltas pero no cuenta dos veces los correos encontrados", () => {
    const primera = { ...resultadoVacio(), nuevos: 2, repetidos: 1, encontrados: 30, quedan: 10, detalle: [{ correo: "a", archivo: "a.pdf", resultado: "nuevo" as const }] };
    const segunda = { ...resultadoVacio(), nuevos: 3, fueraDeTramo: 4, encontrados: 30, detalle: [{ correo: "b", archivo: "b.pdf", resultado: "nuevo" as const }] };
    const total = sumarVuelta(sumarVuelta(acumuladoVacio(), primera), segunda);
    expect(total).toMatchObject({ nuevos: 5, repetidos: 1, encontrados: 30, fueraDeTramo: 4 });
    expect(total.detalle.map((d) => d.archivo)).toEqual(["a.pdf", "b.pdf"]);
  });
});
