import { beforeEach, describe, expect, it, vi } from "vitest";

// Un Gmail de mentira: cada prueba cambia `buzon` para decidir qué contesta.
const buzon = vi.hoisted(() => ({
  conectar: async () => {},
  bloqueo: async () => ({ release: vi.fn() }),
  busquedas: [] as (number[] | false | undefined)[],
  consultas: [] as string[],
  correos: new Map<number, string>(),
  falloAlLeer: new Set<number>(),
  usable: true,
  etiquetados: [] as number[],
  cerrado: 0,
}));

vi.mock("imapflow", () => ({
  ImapFlow: class {
    on() {}
    get usable() {
      return buzon.usable;
    }
    connect() {
      return buzon.conectar();
    }
    getMailboxLock() {
      return buzon.bloqueo();
    }
    async search(consulta: { gmailraw: string }) {
      buzon.consultas.push(consulta.gmailraw);
      return buzon.busquedas.length > 0 ? buzon.busquedas.shift() : [];
    }
    async fetchOne(uid: string) {
      const n = Number(uid);
      if (buzon.falloAlLeer.has(n)) throw new Error("Command failed");
      const crudo = buzon.correos.get(n);
      return crudo ? { source: Buffer.from(crudo) } : false;
    }
    async messageFlagsAdd(rango: { uid: string }) {
      buzon.etiquetados.push(Number(rango.uid));
    }
    async logout() {
      buzon.cerrado++;
    }
    close() {
      buzon.cerrado++;
    }
  },
}));

const registrar = vi.hoisted(() => vi.fn());
vi.mock("../registrar-documento", () => ({ registrarDocumento: registrar }));

import { adjuntosAprovechables, consultaGmail, revisarCorreo, tipoDelAdjunto, type ConfigCorreo } from "../correo";

const config: ConfigCorreo = { usuario: "a@gmail.com", clave: "x", organizacion: "org-1", dias: 14 };

const subidas: string[] = [];
const supabase = {
  storage: {
    from: () => ({
      upload: async (ruta: string) => {
        subidas.push(ruta);
        return { error: null };
      },
    }),
  },
} as never;

// Correo con un PDF adjunto (o sin nada), con la fecha y el asunto dados, y otros adjuntos si se piden.
function correo({ fecha, asunto, pdf = true, otros = [] }: { fecha: string; asunto: string; pdf?: boolean; otros?: { tipo: string; nombre: string; bytes?: number }[] }) {
  const cuerpo = "Hola";
  if (!pdf && otros.length === 0) return `From: caja@ejemplo.es\r\nTo: a@gmail.com\r\nSubject: ${asunto}\r\nDate: ${fecha}\r\nContent-Type: text/plain\r\n\r\n${cuerpo}\r\n`;
  const adjunto = (tipo: string, nombre: string, contenido: Buffer) => [
    "--X",
    `Content-Type: ${tipo}; name="${nombre}"`,
    `Content-Disposition: attachment; filename="${nombre}"`,
    "Content-Transfer-Encoding: base64",
    "",
    contenido.toString("base64"),
  ];
  return [
    "From: caja@ejemplo.es",
    "To: a@gmail.com",
    `Subject: ${asunto}`,
    `Date: ${fecha}`,
    "MIME-Version: 1.0",
    'Content-Type: multipart/mixed; boundary="X"',
    "",
    "--X",
    "Content-Type: text/plain",
    "",
    cuerpo,
    ...(pdf ? adjunto("application/pdf", "Cierres de caja.pdf", Buffer.from("%PDF-1.4 contenido de prueba")) : []),
    ...otros.flatMap((o) => adjunto(o.tipo, o.nombre, Buffer.alloc(o.bytes ?? 200, 1))),
    "--X--",
    "",
  ].join("\r\n");
}

beforeEach(() => {
  buzon.conectar = async () => {};
  buzon.bloqueo = async () => ({ release: vi.fn() });
  buzon.busquedas = [];
  buzon.consultas = [];
  buzon.correos = new Map();
  buzon.falloAlLeer = new Set();
  buzon.usable = true;
  buzon.etiquetados = [];
  buzon.cerrado = 0;
  subidas.length = 0;
  registrar.mockReset();
  registrar.mockResolvedValue({ estado: "pendiente" });
});

describe("consultaGmail", () => {
  it("sin tramo pide lo reciente que aún no se ha revisado", () => {
    expect(consultaGmail({ dias: 14 })).toBe("has:attachment newer_than:14d -label:gestion-leido");
  });

  it("con tramo pide un día de margen y no excluye lo ya revisado", () => {
    expect(consultaGmail({ dias: 14 }, { desde: "2026-09-15", hasta: "2026-10-01" })).toBe("has:attachment after:2026/09/14 before:2026/10/03");
  });
});

describe("revisarCorreo", () => {
  it("dice que ya revisó todo cuando no hay correos nuevos", async () => {
    buzon.busquedas = [[], [11, 12, 13]];
    const r = await revisarCorreo(supabase, config);
    expect(r).toMatchObject({ encontrados: 0, nuevos: 0, yaRevisados: 3 });
    expect(r.error).toBeUndefined();
    expect(buzon.consultas[1]).toBe("has:attachment newer_than:14d");
  });

  it("cuenta los correos de un tramo: nuevos, fuera de fechas y sin adjuntos", async () => {
    buzon.busquedas = [[30, 20, 10, 5]];
    buzon.correos.set(30, correo({ fecha: "Sat, 03 Oct 2026 10:00:00 +0200", asunto: "Fuera" }));
    buzon.correos.set(20, correo({ fecha: "Wed, 01 Oct 2026 23:30:00 +0200", asunto: "Cierre 1 oct" }));
    buzon.correos.set(10, correo({ fecha: "Tue, 30 Sep 2026 12:00:00 +0200", asunto: "Sin adjunto", pdf: false }));
    buzon.correos.set(5, correo({ fecha: "Mon, 14 Sep 2026 12:00:00 +0200", asunto: "Antes" }));
    const r = await revisarCorreo(supabase, config, 40_000, { desde: "2026-09-15", hasta: "2026-10-01" });
    expect(r).toMatchObject({ encontrados: 4, nuevos: 1, fueraDeTramo: 2, sinAdjuntos: 1, repetidos: 0, sinLeer: 0, quedan: 0 });
    expect(r.detalle).toEqual([{ correo: "01/10 · Cierre 1 oct", archivo: "Cierres de caja.pdf", resultado: "nuevo" }]);
    // El correo sin adjuntos también se marca: ya está mirado y no hay que volver a descargarlo.
    expect(buzon.etiquetados).toEqual([20, 10]);
    expect(subidas).toHaveLength(1);
  });

  it("admite el correo del día siguiente al último día del tramo (cierres impresos pasada la medianoche)", async () => {
    buzon.busquedas = [[2, 1]];
    buzon.correos.set(2, correo({ fecha: "Fri, 02 Oct 2026 00:20:00 +0200", asunto: "Cierre del 1 de octubre" }));
    buzon.correos.set(1, correo({ fecha: "Sat, 03 Oct 2026 00:20:00 +0200", asunto: "Cierre del 2 de octubre" }));
    const r = await revisarCorreo(supabase, config, 40_000, { desde: "2026-09-15", hasta: "2026-10-01" });
    expect(r).toMatchObject({ nuevos: 1, fueraDeTramo: 1 });
    expect(r.detalle[0].correo).toBe("02/10 · Cierre del 1 de octubre");
  });

  it("un correo que falla no frena a los demás", async () => {
    buzon.busquedas = [[3, 2, 1]];
    buzon.falloAlLeer.add(3);
    buzon.correos.set(2, correo({ fecha: "Tue, 30 Sep 2026 12:00:00 +0200", asunto: "Bueno" }));
    buzon.correos.set(1, correo({ fecha: "Mon, 29 Sep 2026 12:00:00 +0200", asunto: "Bueno 2" }));
    const r = await revisarCorreo(supabase, config);
    expect(r).toMatchObject({ nuevos: 2, sinLeer: 1 });
    expect(r.error).toBeUndefined();
    expect(r.detalle[0]).toMatchObject({ resultado: "fallo", nota: "Command failed" });
    expect(buzon.etiquetados).toEqual([2, 1]);
  });

  it("si la conexión se cae, para y lo dice", async () => {
    buzon.busquedas = [[3, 2, 1]];
    buzon.falloAlLeer.add(3);
    buzon.usable = false;
    const r = await revisarCorreo(supabase, config);
    expect(r.error).toMatch(/Se cortó la conexión con Gmail/);
    expect(r.sinLeer).toBe(1);
    expect(r.quedan).toBe(2);
    expect(r.cursor).toBe(3);
  });

  it("no etiqueta como leído un correo cuyo adjunto no se pudo leer", async () => {
    buzon.busquedas = [[1]];
    buzon.correos.set(1, correo({ fecha: "Tue, 30 Sep 2026 12:00:00 +0200", asunto: "Factura" }));
    registrar.mockResolvedValue({ error: "El lector de Google no ha podido leerlo ahora mismo." });
    const r = await revisarCorreo(supabase, config);
    expect(r).toMatchObject({ nuevos: 0, sinLeer: 1 });
    expect(buzon.etiquetados).toEqual([]);
    expect(r.detalle[0]).toMatchObject({ resultado: "fallo", nota: "El lector de Google no ha podido leerlo ahora mismo." });
  });

  it("cuenta como repetido lo que ya estaba y deja pasar la nota de lo recuperado", async () => {
    buzon.busquedas = [[2, 1]];
    buzon.correos.set(2, correo({ fecha: "Tue, 30 Sep 2026 12:00:00 +0200", asunto: "A" }));
    buzon.correos.set(1, correo({ fecha: "Mon, 29 Sep 2026 12:00:00 +0200", asunto: "B" }));
    registrar.mockResolvedValueOnce({ estado: "repetido" }).mockResolvedValueOnce({ estado: "pendiente", detalle: "Lo habías descartado: lo he vuelto a poner en la bandeja." });
    const r = await revisarCorreo(supabase, config);
    expect(r).toMatchObject({ repetidos: 1, nuevos: 1 });
    expect(r.detalle[1].nota).toContain("Lo habías descartado");
  });

  it("explica por qué no se pudo conectar y cierra la conexión", async () => {
    buzon.conectar = async () => {
      throw new Error("getaddrinfo ENOTFOUND imap.gmail.com");
    };
    const r = await revisarCorreo(supabase, config);
    expect(r.error).toMatch(/No se pudo conectar con Gmail \(getaddrinfo ENOTFOUND/);
    expect(buzon.cerrado).toBe(1);
  });

  it("distingue una contraseña rechazada", async () => {
    buzon.conectar = async () => {
      throw Object.assign(new Error("Invalid credentials"), { authenticationFailed: true });
    };
    const r = await revisarCorreo(supabase, config);
    expect(r.error).toMatch(/no acepta el usuario o la contraseña/);
  });

  it("si no se puede abrir la bandeja de entrada, cierra la conexión (no la deja colgada)", async () => {
    buzon.bloqueo = async () => {
      throw new Error("Mailbox does not exist");
    };
    const r = await revisarCorreo(supabase, config);
    expect(r.error).toMatch(/No se pudo abrir la bandeja de entrada de Gmail \(Mailbox does not exist\)/);
    expect(buzon.cerrado).toBe(1);
  });

  it("sigue en la siguiente vuelta donde se quedó", async () => {
    buzon.busquedas = [[9, 8, 7, 6]];
    buzon.correos.set(7, correo({ fecha: "Tue, 30 Sep 2026 12:00:00 +0200", asunto: "A" }));
    buzon.correos.set(6, correo({ fecha: "Mon, 29 Sep 2026 12:00:00 +0200", asunto: "B" }));
    const r = await revisarCorreo(supabase, config, 40_000, undefined, 8);
    expect(r).toMatchObject({ encontrados: 4, nuevos: 2, quedan: 0 });
  });
});

describe("revisarCorreo: Gmail rechaza o corta la conexión sin lanzar error", () => {
  it("si Gmail rechaza la búsqueda (imapflow devuelve false), no lo cuenta como «no hay correos»", async () => {
    buzon.busquedas = [false];
    const r = await revisarCorreo(supabase, config);
    expect(r.error).toMatch(/Gmail no ha podido hacer la búsqueda/);
    expect(r).toMatchObject({ encontrados: 0, nuevos: 0 });
    expect(r.yaRevisados).toBeUndefined();
    expect(buzon.consultas).toHaveLength(1);
  });

  it("si la búsqueda no devuelve nada (undefined), tampoco se da por buena", async () => {
    buzon.busquedas = [undefined];
    const r = await revisarCorreo(supabase, config);
    expect(r.error).toMatch(/Gmail no ha podido hacer la búsqueda/);
  });

  it("si la segunda búsqueda (la de «ya revisados») falla, no se inventa un número", async () => {
    buzon.busquedas = [[], false];
    const r = await revisarCorreo(supabase, config);
    expect(r.error).toBeUndefined();
    expect(r.yaRevisados).toBeUndefined();
  });

  it("un correo que Gmail devuelve vacío con la conexión cortada para la vuelta en vez de marcar todos como fallidos", async () => {
    buzon.busquedas = [[3, 2, 1]];
    buzon.usable = false; // y el correo 3 no existe en el buzón falso: fetchOne devuelve false
    const r = await revisarCorreo(supabase, config);
    expect(r.error).toMatch(/Se cortó la conexión con Gmail/);
    expect(r.sinLeer).toBe(1);
    expect(r.detalle).toHaveLength(1);
    expect(buzon.etiquetados).toEqual([]);
  });

  it("un correo vacío con la conexión viva solo cuenta como no leído y sigue con los demás", async () => {
    buzon.busquedas = [[3, 2]];
    buzon.correos.set(2, correo({ fecha: "Tue, 30 Sep 2026 12:00:00 +0200", asunto: "Bueno" }));
    const r = await revisarCorreo(supabase, config);
    expect(r.error).toBeUndefined();
    expect(r).toMatchObject({ sinLeer: 1, nuevos: 1 });
  });
});

describe("revisarCorreo: casos del día a día", () => {
  it("pasa ocrHecho al guardar para que un escaneo sin texto llegue como tarjeta en vez de fallar", async () => {
    buzon.busquedas = [[1]];
    buzon.correos.set(1, correo({ fecha: "Tue, 30 Sep 2026 12:00:00 +0200", asunto: "Escaneo" }));
    await revisarCorreo(supabase, config);
    expect(registrar).toHaveBeenCalledWith(expect.objectContaining({ origen: "correo", ocrHecho: true, nombre: "Cierres de caja.pdf" }));
  });

  it("marca como mirado un correo sin PDF ni fotos para no volver a descargarlo cada vez", async () => {
    buzon.busquedas = [[4]];
    buzon.correos.set(4, correo({ fecha: "Tue, 30 Sep 2026 12:00:00 +0200", asunto: "Newsletter", pdf: false }));
    const r = await revisarCorreo(supabase, config);
    expect(r).toMatchObject({ sinAdjuntos: 1, nuevos: 0 });
    expect(buzon.etiquetados).toEqual([4]);
  });
});

describe("tipoDelAdjunto", () => {
  const adjunto = (contentType: string, filename: string | undefined, contenido: string | number[]) => ({
    contentType,
    filename,
    content: Buffer.from(contenido as string),
  });

  it("acepta el PDF con el tipo habitual y con sus variantes", () => {
    expect(tipoDelAdjunto(adjunto("application/pdf", "a.pdf", "x"))).toBe("application/pdf");
    expect(tipoDelAdjunto(adjunto("application/pdf; name=a.pdf", "a.pdf", "x"))).toBe("application/pdf");
    expect(tipoDelAdjunto(adjunto("application/x-pdf", undefined, "x"))).toBe("application/pdf");
  });

  it("un PDF mandado como octet-stream se reconoce por la extensión o, si no hay nombre, por su contenido", () => {
    expect(tipoDelAdjunto(adjunto("application/octet-stream", "Cierres de caja.PDF", "x"))).toBe("application/pdf");
    expect(tipoDelAdjunto(adjunto("application/octet-stream", undefined, "%PDF-1.4 hola"))).toBe("application/pdf");
    expect(tipoDelAdjunto(adjunto("application/octet-stream", "foto.jpg", "x"))).toBe("image/jpeg");
    expect(tipoDelAdjunto(adjunto("application/octet-stream", undefined, [0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe("image/jpeg");
  });

  it("no toma por PDF un Excel ni un Word", () => {
    expect(tipoDelAdjunto(adjunto("application/vnd.ms-excel", "ingresos.xls", "x"))).toBeNull();
    expect(tipoDelAdjunto(adjunto("application/octet-stream", "hoja.xlsx", "PK"))).toBeNull();
  });

  it("adjuntosAprovechables descarta imágenes pequeñas o incrustadas (logos) pero no los PDF", () => {
    const grande = Buffer.alloc(60 * 1024, 1);
    const lista = adjuntosAprovechables([
      { filename: "logo.png", contentType: "image/png", size: 5_000, content: Buffer.alloc(5_000) },
      { filename: "firma.jpg", contentType: "image/jpeg", size: grande.length, content: grande, related: true },
      { filename: "factura.jpg", contentType: "image/jpg", size: grande.length, content: grande },
      { filename: "cierre.pdf", contentType: "application/octet-stream", size: 100, content: Buffer.from("%PDF-1.4") },
      { filename: "vacio.pdf", contentType: "application/pdf", size: 0, content: Buffer.alloc(0) },
    ]);
    expect(lista.map((x) => [x.nombre, x.tipo])).toEqual([
      ["factura.jpg", "image/jpeg"],
      ["cierre.pdf", "application/pdf"],
    ]);
  });
});

describe("revisarCorreo: adjuntos que no se pueden leer y falta de tiempo", () => {
  it("dice qué pasó con una hoja de Excel y no la deja pasar en silencio", async () => {
    buzon.busquedas = [[7]];
    buzon.correos.set(7, correo({ fecha: "Tue, 30 Sep 2026 12:00:00 +0200", asunto: "Ingresos", pdf: false, otros: [{ tipo: "application/vnd.ms-excel", nombre: "ingresos.xls" }] }));
    const r = await revisarCorreo(supabase, config);
    expect(r).toMatchObject({ sinAdjuntos: 1, nuevos: 0 });
    expect(r.detalle).toEqual([
      { correo: "30/09 · Ingresos", archivo: "ingresos.xls", resultado: "omitido", nota: expect.stringContaining("no sé leer este tipo de archivo") },
    ]);
    expect(registrar).not.toHaveBeenCalled();
  });

  it("lee el PDF aunque el correo lo mande como octet-stream", async () => {
    buzon.busquedas = [[8]];
    buzon.correos.set(8, correo({ fecha: "Tue, 30 Sep 2026 12:00:00 +0200", asunto: "Cierre", pdf: false, otros: [{ tipo: "application/octet-stream", nombre: "Cierres de caja.pdf" }] }));
    const r = await revisarCorreo(supabase, config);
    expect(r).toMatchObject({ nuevos: 1, sinAdjuntos: 0 });
    expect(registrar).toHaveBeenCalledWith(expect.objectContaining({ tipoArchivo: "application/pdf", nombre: "Cierres de caja.pdf" }));
  });

  it("avisa de un PDF que pesa demasiado y marca el correo como mirado", async () => {
    buzon.busquedas = [[9]];
    buzon.correos.set(9, correo({ fecha: "Tue, 30 Sep 2026 12:00:00 +0200", asunto: "Pesado", pdf: false, otros: [{ tipo: "application/pdf", nombre: "enorme.pdf", bytes: 12 * 1024 * 1024 + 1 }] }));
    const r = await revisarCorreo(supabase, config);
    expect(r.detalle[0]).toMatchObject({ archivo: "enorme.pdf", resultado: "omitido", nota: expect.stringContaining("Pesa 12 MB") });
    expect(buzon.etiquetados).toEqual([9]);
  });

  it("sin tiempo para otro adjunto, deja el correo sin marcar y la siguiente vuelta empieza por él", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      buzon.busquedas = [[5, 4]];
      buzon.correos.set(5, correo({ fecha: "Tue, 30 Sep 2026 12:00:00 +0200", asunto: "Dos PDF", otros: [{ tipo: "application/pdf", nombre: "segundo.pdf" }] }));
      buzon.correos.set(4, correo({ fecha: "Mon, 29 Sep 2026 12:00:00 +0200", asunto: "Otro" }));
      // Leer el primer adjunto "tarda" 50 segundos.
      registrar.mockImplementationOnce(async () => {
        vi.setSystemTime(Date.now() + 50_000);
        return { estado: "pendiente" };
      });
      const r = await revisarCorreo(supabase, config);
      expect(r.nuevos).toBe(1);
      expect(r.detalle.at(-1)).toMatchObject({ archivo: "segundo.pdf", resultado: "fallo", nota: expect.stringContaining("Sin tiempo") });
      expect(buzon.etiquetados).toEqual([]);
      expect(r.quedan).toBe(2);
      expect(r.cursor).toBe(6);
    } finally {
      vi.useRealTimers();
    }
  });
});
