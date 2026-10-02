import { beforeEach, describe, expect, it, vi } from "vitest";
import { cierreComoPdf, pdf } from "./ayudas-pdf";

type Consulta = { tabla: string; op: "select" | "insert" | "update"; valores?: unknown; filtros: Record<string, unknown>; head: boolean };

// Un Supabase de mentira: cada prueba decide qué contesta cada consulta y qué archivo hay en Storage.
const falso = vi.hoisted(() => ({
  archivo: new Uint8Array() as Uint8Array,
  responder: ((): unknown => ({ data: null, error: null })) as (c: unknown) => unknown,
  consultas: [] as unknown[],
  borrados: [] as string[][],
}));
const ia = vi.hoisted(() => ({ activa: false, leer: vi.fn() }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../supabase/server", () => ({
  crearClienteServidor: async () => ({
    storage: {
      from: () => ({
        download: async () => ({ data: new Blob([falso.archivo as BlobPart]), error: null }),
        remove: async (rutas: string[]) => {
          falso.borrados.push(rutas);
          return { data: null, error: null };
        },
      }),
    },
    from: (tabla: string) => {
      const c: Consulta = { tabla, op: "select", filtros: {}, head: false };
      const resolver = () => {
        falso.consultas.push({ ...c });
        return Promise.resolve(falso.responder(c));
      };
      const b = {
        select: (_cols?: string, opciones?: { head?: boolean }) => {
          if (opciones?.head) c.head = true;
          return b;
        },
        insert: (v: unknown) => {
          c.op = "insert";
          c.valores = v;
          return b;
        },
        update: (v: unknown) => {
          c.op = "update";
          c.valores = v;
          return b;
        },
        eq: (k: string, v: unknown) => {
          c.filtros[k] = v;
          return b;
        },
        in: (k: string, v: unknown) => {
          c.filtros[k] = v;
          return b;
        },
        maybeSingle: resolver,
        then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => resolver().then(ok, ko),
      };
      return b;
    },
  }),
}));
vi.mock("../leer-documento-ia", async (importar) => ({
  ...(await importar<typeof import("../leer-documento-ia")>()),
  hayIA: () => ia.activa,
  leerDocumentoConIA: ia.leer,
}));

import { VERSION_LECTURA_CIERRE } from "../cierres-bandeja";
import { interpretarDocumento, registrarDocumento, releerDocumento } from "../registrar-documento";

const ORG = "a18aabfd-1a88-4af3-b508-9f9e7058000c";
const DOC = "6f2e1aae-c2d3-4bfc-b01d-91d63fc1bba6";
const entrada = { org: ORG, ruta: `${ORG}/nuevo.pdf`, nombre: "Cierres de caja.pdf", tipoArchivo: "application/pdf", origen: "correo" as const };

const insercion = () => falso.consultas.find((c) => (c as Consulta).op === "insert") as Consulta | undefined;
const actualizacion = () => falso.consultas.find((c) => (c as Consulta).op === "update") as Consulta | undefined;

beforeEach(() => {
  falso.archivo = cierreComoPdf({ efectivo: 55.6, banco: 276.2, fechaInicial: "01/10/2026", fechaFinal: "02/10/2026" });
  falso.consultas = [];
  falso.borrados = [];
  falso.responder = () => ({ data: null, error: null });
  ia.activa = false;
  ia.leer.mockReset();
});

describe("interpretarDocumento", () => {
  it("lee el cierre de caja real aunque el PDF dibuje las cifras antes que las etiquetas", async () => {
    const r = await interpretarDocumento({ bytes: falso.archivo, tipoArchivo: "application/pdf" });
    expect(r).toMatchObject({ tipo: "cierre", datos: { venta: 331.8, efectivo: 55.6, banco: 276.2, fecha: "2026-10-01" } });
    expect((r as { datos: Record<string, unknown> }).datos.aviso).toBeUndefined();
  });

  it("toma como día de la venta la fecha inicial, no la final", async () => {
    const bytes = cierreComoPdf({ efectivo: 10, banco: 20, fechaInicial: "30/09/2026", fechaFinal: "01/10/2026" });
    const r = await interpretarDocumento({ bytes, tipoArchivo: "application/pdf" });
    expect(r).toMatchObject({ datos: { fecha: "2026-09-30", venta: 30 } });
  });

  it("suma los tickets pendientes de cobro a la venta (cuadra con Total Cobrado más pendientes)", async () => {
    const bytes = cierreComoPdf({ efectivo: 100, banco: 200, pendientes: 50, fechaInicial: "02/10/2026" });
    const r = await interpretarDocumento({ bytes, tipoArchivo: "application/pdf" });
    expect(r).toMatchObject({ tipo: "cierre", datos: { venta: 350, efectivo: 100, banco: 200 } });
  });

  it("si es un cierre pero no se entiende, lo guarda como cierre con un aviso y el texto leído", async () => {
    const bytes = pdf([
      ["ESTADO DE LA CAJA", 20, 360],
      ["Total Tickets", 20, 340],
      ["(no legible)", 220, 340],
    ]);
    const r = await interpretarDocumento({ bytes, tipoArchivo: "application/pdf" });
    expect(r).toMatchObject({ tipo: "cierre" });
    const datos = (r as { datos: Record<string, unknown> }).datos;
    expect(datos.venta).toBeUndefined();
    expect(String(datos.aviso)).toContain("No se pudo leer solo");
    expect(String(datos.aviso)).toContain("GEMINI_API_KEY");
    expect(String(datos.texto_leido)).toContain("Total Tickets");
  });

  it("no pierde un cierre cuando el lector de Google falla de forma pasajera", async () => {
    ia.activa = true;
    ia.leer.mockResolvedValue({ documento: null, motivo: "Gemini respondió 429: cupo agotado", transitorio: true });
    const bytes = pdf([
      ["ESTADO DE LA CAJA", 20, 360],
      ["Total Tickets", 20, 340],
    ]);
    const r = await interpretarDocumento({ bytes, tipoArchivo: "application/pdf" });
    expect(r).toMatchObject({ tipo: "cierre", datos: { motivo_ia: "Gemini respondió 429: cupo agotado" } });
    expect(String((r as { datos: Record<string, unknown> }).datos.aviso)).toContain("Gemini respondió 429");
  });

  it("devuelve error (sin guardar nada) si falla la IA de forma pasajera con una factura", async () => {
    ia.activa = true;
    ia.leer.mockResolvedValue({ documento: null, motivo: "Gemini respondió 503", transitorio: true });
    const bytes = pdf([["Factura de Helados SL total 45,00", 20, 360]]);
    const r = await interpretarDocumento({ bytes, tipoArchivo: "application/pdf" });
    expect(r).toHaveProperty("error");
  });

  // Un cierre cuyas cifras no cuadran entre sí (efectivo + tarjeta + pendientes ≠ total de tickets).
  const cierreQueNoCuadra = () =>
    pdf([
      ["Fecha inicial:", 20, 380],
      ["01/10/2026", 220, 380],
      ["ESTADO DE LA CAJA", 20, 360],
      ["Tickets Efectivo", 20, 340],
      ["10,00", 220, 340],
      ["Tickets Banco", 20, 320],
      ["20,00", 220, 320],
      ["Tickets Pendientes", 20, 300],
      ["0,00", 220, 300],
      ["Total Tickets", 20, 280],
      ["99,00", 220, 280],
    ]);

  it("un cierre cuyas cifras no cuadran se enseña igualmente, con las cifras leídas y un aviso (nunca en blanco)", async () => {
    const r = await interpretarDocumento({ bytes: cierreQueNoCuadra(), tipoArchivo: "application/pdf" });
    expect(r).toMatchObject({ tipo: "cierre", datos: { venta: 99, efectivo: 10, banco: 20, fecha: "2026-10-01" } });
    expect(String((r as { datos: Record<string, unknown> }).datos.aviso)).toMatch(/no cuadran entre sí/);
  });

  it("cuando las cifras no cuadran y hay IA, manda la lectura de la IA con la fecha impresa en el PDF", async () => {
    ia.activa = true;
    ia.leer.mockResolvedValue({
      documento: { tipo: "ticket_cierre", ticket: { venta: 30, efectivo: 10, banco: 20, ticketMedio: null, fecha: "2026-10-02" }, facturas: [], ingresos: [] },
    });
    const r = await interpretarDocumento({ bytes: cierreQueNoCuadra(), tipoArchivo: "application/pdf" });
    expect(r).toMatchObject({ tipo: "cierre", datos: { venta: 30, efectivo: 10, banco: 20, fecha: "2026-10-01" } });
    // La venta de la IA (30,00) no sale en el texto del PDF: se avisa.
    expect(String((r as { datos: Record<string, unknown> }).datos.aviso)).toMatch(/no aparece en el texto/);
  });

  it("si la IA falla de forma pasajera, el cierre dudoso se enseña con lo que leyeron las reglas y su aviso", async () => {
    ia.activa = true;
    ia.leer.mockResolvedValue({ documento: null, motivo: "Gemini respondió 429: cupo agotado", transitorio: true });
    const r = await interpretarDocumento({ bytes: cierreQueNoCuadra(), tipoArchivo: "application/pdf" });
    expect(r).toMatchObject({ tipo: "cierre", datos: { venta: 99, fecha: "2026-10-01" } });
    expect(String((r as { datos: Record<string, unknown> }).datos.aviso)).toMatch(/no cuadran entre sí/);
  });

  it("un cierre nunca se convierte en factura aunque la IA lo tome por una", async () => {
    ia.activa = true;
    ia.leer.mockResolvedValue({
      documento: {
        tipo: "facturas",
        ticket: null,
        facturas: [{ proveedor: "Cierre", numero: null, fecha: null, base: null, importe: 331.8, categoria: "Otros", lineas: [] }],
        ingresos: [],
      },
    });
    const bytes = pdf([
      ["ESTADO DE LA CAJA", 20, 360],
      ["Total Tickets", 20, 340],
      ["(no legible)", 220, 340],
    ]);
    const r = await interpretarDocumento({ bytes, tipoArchivo: "application/pdf" });
    expect(r).toMatchObject({ tipo: "cierre" });
    expect((r as { datos: Record<string, unknown> }).datos.facturas).toBeUndefined();
  });

  it("un cierre con lo cobrado distinto de la venta se enseña con un aviso, sin descartarlo", async () => {
    const bytes = pdf([
      ["Fecha inicial:", 20, 380],
      ["01/10/2026", 220, 380],
      ["Total Cobrado", 20, 360],
      ["500,00", 220, 360],
      ["Tickets Efectivo", 20, 340],
      ["10,00", 220, 340],
      ["Tickets Banco", 20, 320],
      ["20,00", 220, 320],
      ["Tickets Pendientes", 20, 300],
      ["0,00", 220, 300],
      ["Total Tickets", 20, 280],
      ["30,00", 220, 280],
    ]);
    const r = await interpretarDocumento({ bytes, tipoArchivo: "application/pdf" });
    expect(r).toMatchObject({ tipo: "cierre", datos: { venta: 30, efectivo: 10, banco: 20, fecha: "2026-10-01" } });
    expect(String((r as { datos: Record<string, unknown> }).datos.aviso)).toMatch(/Total cobrado/);
  });

  it("una foto que la IA no lee nunca acaba como cierre: queda como factura en blanco con su aviso", async () => {
    ia.activa = true;
    ia.leer.mockResolvedValue({ documento: null, motivo: "Gemini respondió 403: clave no válida" });
    const r = await interpretarDocumento({ bytes: new Uint8Array([1, 2, 3]), tipoArchivo: "image/jpeg" });
    expect(r).toMatchObject({ tipo: "factura" });
    expect(String((r as { datos: Record<string, unknown> }).datos.aviso)).toContain("No he conseguido leer los datos");
  });

  it("si la IA dice que no es ni factura ni cierre, la tarjeta lo explica", async () => {
    ia.activa = true;
    ia.leer.mockResolvedValue({ documento: { tipo: "otro", ticket: null, facturas: [], ingresos: [] } });
    const bytes = pdf([["Extracto de tu cuenta BBVA", 20, 360]]);
    const r = await interpretarDocumento({ bytes, tipoArchivo: "application/pdf" });
    expect(r).toMatchObject({ tipo: "factura" });
    expect(String((r as { datos: Record<string, unknown> }).datos.aviso)).toContain("no es una factura ni un cierre");
  });

  it("guarda qué modelo leyó la factura y los avisos de la IA", async () => {
    ia.activa = true;
    ia.leer.mockResolvedValue({
      modelo: "gemini-3.5-flash-lite",
      documento: {
        tipo: "facturas",
        ticket: null,
        facturas: [{ proveedor: "Hogar Hotel", fecha: "2026-09-01", importe: 0.89, categoria: "Suministros", lineas: [] }],
        ingresos: [],
        avisos: ["El archivo trae más de 30 facturas: solo he leído las primeras 30."],
      },
    });
    const bytes = pdf([["Factura Hogar Hotel", 20, 360]]);
    const r = await interpretarDocumento({ bytes, tipoArchivo: "application/pdf" });
    const datos = (r as { datos: Record<string, unknown> }).datos;
    expect(datos).toMatchObject({ lector: "ia", modelo: "gemini-3.5-flash-lite" });
    expect(String(datos.aviso)).toContain("más de 30 facturas");
    expect(String(datos.aviso)).toContain("más sencillo");
  });

  it("cuando se agota el cupo del día, el mensaje dice cuándo volver a probar", async () => {
    ia.activa = true;
    ia.leer.mockResolvedValue({ documento: null, motivo: "Gemini respondió 429", transitorio: true, causa: "dia" });
    const bytes = pdf([["Factura de Helados SL total 45,00", 20, 360]]);
    const r = await interpretarDocumento({ bytes, tipoArchivo: "application/pdf" });
    expect((r as { error: string }).error).toContain("9:00");
  });

  it("si Google no da cupo a la clave («límite 0»), la tarjeta lo dice y no culpa al documento", async () => {
    ia.activa = true;
    ia.leer.mockResolvedValue({ documento: null, motivo: "Gemini respondió 429: limit: 0", causa: "sin-cupo" });
    const bytes = pdf([["Factura de Helados SL total 45,00", 20, 360]]);
    const r = await interpretarDocumento({ bytes, tipoArchivo: "application/pdf" });
    expect(r).toMatchObject({ tipo: "factura" });
    expect(String((r as { datos: Record<string, unknown> }).datos.aviso)).toContain("límite 0");
  });

  it("un cierre dudoso con la clave sin cupo se enseña con las cifras leídas y el aviso de la clave", async () => {
    ia.activa = true;
    ia.leer.mockResolvedValue({ documento: null, motivo: "Gemini respondió 429: limit: 0", causa: "sin-cupo" });
    const r = await interpretarDocumento({ bytes: cierreQueNoCuadra(), tipoArchivo: "application/pdf" });
    expect(r).toMatchObject({ tipo: "cierre", datos: { venta: 99, fecha: "2026-10-01" } });
    expect(String((r as { datos: Record<string, unknown> }).datos.aviso)).toMatch(/no cuadran entre sí/);
  });

  it("todo cierre guarda la versión del lector que lo leyó", async () => {
    const r = await interpretarDocumento({ bytes: falso.archivo, tipoArchivo: "application/pdf" });
    expect((r as { datos: Record<string, unknown> }).datos.version_lectura).toBe(VERSION_LECTURA_CIERRE);
  });

  it("pide OCR en el navegador si no hay IA ni texto (foto o escaneo)", async () => {
    const r = await interpretarDocumento({ bytes: new Uint8Array([1, 2, 3]), tipoArchivo: "image/jpeg" });
    expect(r).toEqual({ necesitaOcr: true });
  });
});

describe("registrarDocumento", () => {
  it("un cierre nuevo queda pendiente en la Bandeja con las cifras leídas (no se mete solo)", async () => {
    const r = await registrarDocumento(entrada);
    expect(r.estado).toBe("pendiente");
    const fila = insercion()!.valores as { tipo: string; datos: Record<string, unknown>; origen: string };
    expect(fila).toMatchObject({ tipo: "cierre", origen: "correo", datos: { venta: 331.8, efectivo: 55.6, banco: 276.2, fecha: "2026-10-01" } });
    expect(falso.consultas.some((c) => (c as Consulta).tabla === "cierres_diarios" && (c as Consulta).op !== "select")).toBe(false);
  });

  it("en una subida a mano ignora el texto desordenado del navegador y lee el PDF por posición", async () => {
    // Así llega el texto "en bruto" del ticket real: cada cifra pegada a la etiqueta de la fila siguiente.
    const desordenado = "55,60Tickets Efectivo 276,20Tickets Banco 0,00Tickets Pendientes 331,80Total Tickets 0,00Total Facturas 9,76Ticket/Factura Media";
    await registrarDocumento({ ...entrada, origen: "subida", texto: desordenado });
    expect((insercion()!.valores as { datos: Record<string, unknown> }).datos).toMatchObject({ venta: 331.8, efectivo: 55.6, banco: 276.2, fecha: "2026-10-01" });
  });

  it("ignora lo que ya está aprobado y tiene algo guardado", async () => {
    falso.responder = (c) => {
      const q = c as Consulta;
      if (q.tabla === "documentos_entrantes") return { data: { id: DOC, estado: "aprobado", datos: { venta: 331.8 } }, error: null };
      return { count: 1, error: null };
    };
    const r = await registrarDocumento(entrada);
    expect(r).toEqual({ estado: "repetido" });
    expect(falso.borrados).toEqual([[entrada.ruta]]);
    expect(insercion()).toBeUndefined();
  });

  it("recupera un documento aprobado cuyo cierre ya no existe", async () => {
    falso.responder = (c) => {
      const q = c as Consulta;
      if (q.tabla === "documentos_entrantes" && q.op === "select") return { data: { id: DOC, estado: "aprobado", datos: { venta: 331.8 } }, error: null };
      if (q.tabla === "documentos_entrantes" && q.op === "insert") return { error: { code: "23505" } };
      if (q.op === "select") return { count: 0, error: null };
      return { error: null };
    };
    const r = await registrarDocumento(entrada);
    expect(r.estado).toBe("pendiente");
    expect(r.detalle).toContain("ya no hay nada suyo en tus cuentas");
    expect(actualizacion()!.filtros.estado).toEqual(["descartado", "pendiente", "aprobado"]);
    expect(actualizacion()!.valores).toMatchObject({ estado: "pendiente", tipo: "cierre", datos: { venta: 331.8 } });
  });

  it("devuelve a la bandeja un documento descartado, con las cifras bien leídas", async () => {
    falso.responder = (c) => {
      const q = c as Consulta;
      if (q.tabla === "documentos_entrantes" && q.op === "select") return { data: { id: DOC, estado: "descartado", tipo: "cierre", datos: {} }, error: null };
      if (q.op === "insert") return { error: { code: "23505" } };
      return { error: null };
    };
    const r = await registrarDocumento(entrada);
    expect(r.estado).toBe("pendiente");
    expect(r.detalle).toContain("Lo habías descartado");
    expect(actualizacion()!.filtros.estado).toEqual(["descartado", "pendiente"]);
    expect(actualizacion()!.valores).toMatchObject({ estado: "pendiente", datos: { venta: 331.8, fecha: "2026-10-01" } });
  });

  it("una factura descartada no vuelve sola ni gasta el cupo de la IA: se recupera desde Descartados", async () => {
    ia.activa = true;
    falso.responder = (c) => {
      const q = c as Consulta;
      if (q.tabla === "documentos_entrantes" && q.op === "select") return { data: { id: DOC, estado: "descartado", tipo: "factura", datos: {} }, error: null };
      return { error: null };
    };
    const r = await registrarDocumento(entrada);
    expect(r.estado).toBe("repetido");
    expect(r.detalle).toContain("Descartados");
    expect(ia.leer).not.toHaveBeenCalled();
    expect(insercion()).toBeUndefined();
    expect(actualizacion()).toBeUndefined();
    expect(falso.borrados).toEqual([[entrada.ruta]]);
  });

  it("un pendiente ya leído no se repite, pero uno vacío se vuelve a leer", async () => {
    falso.responder = (c) => {
      const q = c as Consulta;
      if (q.tabla === "documentos_entrantes" && q.op === "select") return { data: { id: DOC, estado: "pendiente", datos: {} }, error: null };
      if (q.op === "insert") return { error: { code: "23505" } };
      return { error: null };
    };
    const r = await registrarDocumento(entrada);
    expect(r.estado).toBe("pendiente");
    expect(actualizacion()!.valores).toMatchObject({ datos: { venta: 331.8 } });
  });
});

describe("registrarDocumento: documentos que ya estaban", () => {
  it("un aprobado cuyo día sigue cubierto en Ventas (otro documento lo pisó) no se repite ni se vuelve a meter", async () => {
    falso.responder = (c) => {
      const q = c as Consulta;
      if (q.tabla === "documentos_entrantes") return { data: { id: DOC, estado: "aprobado", datos: { venta: 331.8, fecha: "2026-10-01" } }, error: null };
      // Nada con su documento_id, pero sí una venta guardada ese día.
      return { count: q.filtros.fecha ? 1 : 0, error: null };
    };
    const r = await registrarDocumento(entrada);
    expect(r).toEqual({ estado: "repetido" });
    expect(actualizacion()).toBeUndefined();
    expect(insercion()).toBeUndefined();
  });

  it("si no se puede comprobar si tiene registros, se supone que sí (mejor no repetir que duplicar)", async () => {
    falso.responder = (c) => {
      const q = c as Consulta;
      if (q.tabla === "documentos_entrantes") return { data: { id: DOC, estado: "aprobado", datos: { venta: 331.8 } }, error: null };
      return { count: null, error: { message: "timeout" } };
    };
    const r = await registrarDocumento(entrada);
    expect(r).toEqual({ estado: "repetido" });
  });

  it("un pendiente leído por una versión anterior del lector se vuelve a leer, aunque tenga venta", async () => {
    falso.responder = (c) => {
      const q = c as Consulta;
      if (q.tabla === "documentos_entrantes" && q.op === "select") return { data: { id: DOC, estado: "pendiente", datos: { venta: 6.5, efectivo: 6.5 } }, error: null };
      if (q.op === "insert") return { error: { code: "23505" } };
      return { error: null };
    };
    const r = await registrarDocumento(entrada);
    expect(r.estado).toBe("pendiente");
    expect(r.detalle).toContain("versión anterior del lector");
    expect(actualizacion()!.valores).toMatchObject({ datos: { venta: 331.8, efectivo: 55.6, banco: 276.2, version_lectura: VERSION_LECTURA_CIERRE } });
  });

  it("un pendiente ya leído por la versión actual no se vuelve a leer ni a guardar", async () => {
    falso.responder = (c) => {
      const q = c as Consulta;
      if (q.tabla === "documentos_entrantes" && q.op === "select") {
        return { data: { id: DOC, estado: "pendiente", datos: { venta: 331.8, version_lectura: VERSION_LECTURA_CIERRE } }, error: null };
      }
      return { error: null };
    };
    const r = await registrarDocumento(entrada);
    expect(r).toEqual({ estado: "repetido" });
    expect(actualizacion()).toBeUndefined();
    expect(falso.borrados).toEqual([[entrada.ruta]]);
  });
});

describe("releerDocumento", () => {
  it("vuelve a leer un descartado vacío y lo deja pendiente con los datos buenos", async () => {
    falso.responder = (c) => {
      const q = c as Consulta;
      if (q.tabla === "documentos_entrantes" && q.op === "select") return { data: { id: DOC, archivo_ruta: `${ORG}/guardado.pdf`, archivo_tipo: "application/pdf" }, error: null };
      return { error: null };
    };
    const r = await releerDocumento({ org: ORG, id: DOC });
    expect(r.estado).toBe("pendiente");
    expect(actualizacion()!.valores).toMatchObject({ estado: "pendiente", tipo: "cierre", revisado_en: null, datos: { venta: 331.8, efectivo: 55.6, banco: 276.2, fecha: "2026-10-01" } });
    expect(actualizacion()!.filtros.estado).toEqual(["pendiente", "descartado"]);
  });

  it("no toca un documento ya aprobado", async () => {
    falso.responder = () => ({ data: null, error: null });
    const r = await releerDocumento({ org: ORG, id: DOC });
    expect(r.error).toMatch(/ya no se puede volver a leer/);
    expect(actualizacion()).toBeUndefined();
  });

  it("si antes tenía cifras leídas y esta vez no salen, se queda como estaba (no borra lo que había)", async () => {
    falso.archivo = pdf([
      ["ESTADO DE LA CAJA", 20, 360],
      ["Total Tickets", 20, 340],
      ["(no legible)", 220, 340],
    ]);
    falso.responder = (c) => {
      const q = c as Consulta;
      if (q.tabla === "documentos_entrantes" && q.op === "select") {
        return { data: { id: DOC, archivo_ruta: `${ORG}/guardado.pdf`, archivo_tipo: "application/pdf", datos: { venta: 331.8, efectivo: 55.6 } }, error: null };
      }
      return { error: null };
    };
    const r = await releerDocumento({ org: ORG, id: DOC });
    expect(r.error).toMatch(/se queda como estaba/);
    expect(actualizacion()).toBeUndefined();
  });

  it("si antes no había nada leído, una lectura con aviso sí se guarda", async () => {
    falso.archivo = pdf([
      ["ESTADO DE LA CAJA", 20, 360],
      ["Total Tickets", 20, 340],
      ["(no legible)", 220, 340],
    ]);
    falso.responder = (c) => {
      const q = c as Consulta;
      if (q.tabla === "documentos_entrantes" && q.op === "select") {
        return { data: { id: DOC, archivo_ruta: `${ORG}/guardado.pdf`, archivo_tipo: "application/pdf", datos: {} }, error: null };
      }
      return { error: null };
    };
    const r = await releerDocumento({ org: ORG, id: DOC });
    expect(r.estado).toBe("pendiente");
    expect(actualizacion()!.valores).toMatchObject({ estado: "pendiente", tipo: "cierre" });
  });

  it("rechaza identificadores que no son UUID", async () => {
    expect((await releerDocumento({ org: "x", id: "y" })).error).toBeDefined();
  });
});
