import { describe, expect, it } from "vitest";
import { facturaFiable, type FacturaDatos } from "../factura";
import { documentoDesdeRespuesta } from "../leer-documento-ia";

describe("documentoDesdeRespuesta", () => {
  it("lee varias facturas con sus líneas", () => {
    const d = documentoDesdeRespuesta({
      tipo: "facturas",
      ticket: null,
      facturas: [
        {
          proveedor: "Puleva",
          numero: "A-1",
          fecha: "2026-08-01",
          base_imponible: 20,
          total: 22,
          categoria: "Materia prima",
          lineas: [{ descripcion: "Leche entera 1L", cantidad: 20, unidad: "ud", precio_unitario: 1, importe: 20 }],
        },
        { proveedor: "Puleva", fecha: "2026-08-15", total: 11, categoria: "Inventada", lineas: [] },
      ],
    });
    expect(d?.tipo).toBe("facturas");
    expect(d?.facturas).toHaveLength(2);
    expect(d?.facturas[0]).toMatchObject({ proveedor: "Puleva", importe: 22, base: 20, categoria: "Materia prima" });
    expect(d?.facturas[0].lineas[0]).toEqual({ descripcion: "Leche entera 1L", cantidad: 20, unidad: "ud", precio_unitario: 1, importe: 20 });
    expect(d?.facturas[1].categoria).toBe("Otros");
  });

  it("reconoce un ticket de cierre", () => {
    const d = documentoDesdeRespuesta({ tipo: "ticket_cierre", ticket: { venta: 136.7, efectivo: 10.8, banco: 125.9, fecha: "2026-09-29" }, facturas: [] });
    expect(d?.tipo).toBe("ticket_cierre");
    expect(d?.ticket?.venta).toBe(136.7);
  });

  it("descarta datos absurdos y líneas sin importe", () => {
    const d = documentoDesdeRespuesta({
      tipo: "facturas",
      facturas: [{ proveedor: "X", fecha: "no-es-fecha", total: -5, lineas: [{ descripcion: "a", importe: null }, { descripcion: "", importe: 3 }] }],
    });
    expect(d?.facturas[0].fecha).toBeUndefined();
    expect(d?.facturas[0].importe).toBeUndefined();
    expect(d?.facturas[0].lineas).toHaveLength(0);
  });

  it("sin nada útil, el documento es 'otro'", () => {
    expect(documentoDesdeRespuesta({ tipo: "facturas", facturas: [{}] })?.tipo).toBe("otro");
    expect(documentoDesdeRespuesta("basura")).toBeNull();
  });
});

describe("facturaFiable", () => {
  const base: FacturaDatos = { proveedor: "Puleva", fecha: "2026-08-01", importe: 22, base: 20, categoria: "Materia prima", lineas: [] };
  const linea = (importe: number) => ({ descripcion: "Leche", importe });

  it("acepta una factura completa sin líneas", () => {
    expect(facturaFiable(base, "2026-09-30")).toBe(true);
  });
  it("acepta líneas que suman la base o el total", () => {
    expect(facturaFiable({ ...base, lineas: [linea(12), linea(8)] }, "2026-09-30")).toBe(true);
    expect(facturaFiable({ ...base, base: undefined, lineas: [linea(22)] }, "2026-09-30")).toBe(true);
  });
  it("rechaza líneas que no cuadran", () => {
    expect(facturaFiable({ ...base, lineas: [linea(12), linea(3)] }, "2026-09-30")).toBe(false);
  });
  it("rechaza lo incompleto o con fecha futura", () => {
    expect(facturaFiable({ ...base, proveedor: undefined }, "2026-09-30")).toBe(false);
    expect(facturaFiable({ ...base, fecha: undefined }, "2026-09-30")).toBe(false);
    expect(facturaFiable({ ...base, importe: undefined }, "2026-09-30")).toBe(false);
    expect(facturaFiable(base, "2026-07-01")).toBe(false);
  });
});

import { afterEach, beforeEach, vi } from "vitest";
import { leerDocumentoConIA } from "../leer-documento-ia";

describe("leerDocumentoConIA con Gemini", () => {
  const claves = ["GEMINI_API_KEY", "ANTHROPIC_API_KEY", "NVIDIA_API_KEY", "GEMINI_MODELO"] as const;
  beforeEach(() => {
    for (const c of claves) delete process.env[c];
    process.env.GEMINI_API_KEY = "clave-de-prueba";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    for (const c of claves) delete process.env[c];
  });

  const respuestaGemini = (json: unknown) =>
    new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(json) }] } }] }), { status: 200 });
  const dosFacturas = {
    tipo: "facturas",
    ticket: null,
    facturas: [
      { proveedor: "Puleva", fecha: "2026-08-01", total: 22, base_imponible: 20, categoria: "Materia prima", lineas: [{ descripcion: "Leche", importe: 20 }] },
      { proveedor: "Puleva", fecha: "2026-08-15", total: 11, categoria: "Materia prima", lineas: [] },
    ],
  };
  const entrada = { texto: "", imagenes: [], archivo: { bytes: new Uint8Array([37, 80, 68, 70]), tipo: "application/pdf" } };

  it("manda el PDF original y devuelve todas las facturas", async () => {
    const fetchFalso = vi.fn().mockResolvedValue(respuestaGemini(dosFacturas));
    vi.stubGlobal("fetch", fetchFalso);
    const lectura = await leerDocumentoConIA(entrada);
    expect(lectura.documento?.facturas).toHaveLength(2);
    const [url, opciones] = fetchFalso.mock.calls[0];
    expect(url).toContain("generativelanguage.googleapis.com");
    expect(url).toContain("gemini-flash-latest");
    expect((opciones.headers as Record<string, string>)["x-goog-api-key"]).toBe("clave-de-prueba");
    const cuerpo = JSON.parse(opciones.body as string);
    expect(cuerpo.contents[0].parts[0].inline_data.mime_type).toBe("application/pdf");
  });

  it("repite sin desactivar el razonamiento si da error 400", async () => {
    const fetchFalso = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 400 }))
      .mockResolvedValueOnce(respuestaGemini(dosFacturas));
    vi.stubGlobal("fetch", fetchFalso);
    const lectura = await leerDocumentoConIA(entrada);
    expect(lectura.documento?.facturas).toHaveLength(2);
    expect(JSON.parse(fetchFalso.mock.calls[0][1].body as string).generationConfig.thinkingConfig).toBeDefined();
    expect(JSON.parse(fetchFalso.mock.calls[1][1].body as string).generationConfig.thinkingConfig).toBeUndefined();
  });

  it("explica el motivo si la API falla", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: "API key not valid" } }), { status: 403 })));
    const lectura = await leerDocumentoConIA(entrada);
    expect(lectura.documento).toBeNull();
    expect(lectura.motivo).toContain("403");
  });

  it("marca como transitorio el límite gratuito agotado (429) y no el error de la clave", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response(JSON.stringify({ error: { message: "quota" } }), { status: 429 })));
    const limitado = await leerDocumentoConIA(entrada, 4000);
    expect(limitado.documento).toBeNull();
    expect(limitado.transitorio).toBe(true);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 403 })));
    expect((await leerDocumentoConIA(entrada)).transitorio).toBe(false);
  });
});
