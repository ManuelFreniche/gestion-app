import { describe, expect, it } from "vitest";
import { avisoNocturno, manejarActualizacion } from "../bot-cierre";
import type { Telegram } from "../telegram";

// Base de datos de mentira en memoria, con solo lo que usa el bot.
type Fila = Record<string, unknown>;
function baseFalsa(tablas: Record<string, Fila[]>) {
  const llamadasRpc: { nombre: string; args: Fila }[] = [];
  const consulta = (nombre: string) => {
    const filtros: [string, unknown][] = [];
    let accion: "leer" | "borrar" | "actualizar" = "leer";
    let cambios: Fila = {};
    let soloContar = false;
    const filas = () => (tablas[nombre] ??= []).filter((f) => filtros.every(([c, v]) => f[c] === v));
    const ejecutar = () => {
      if (accion === "borrar") tablas[nombre] = tablas[nombre].filter((f) => !filas().includes(f));
      if (accion === "actualizar") filas().forEach((f) => Object.assign(f, cambios));
      return { data: filas(), count: filas().length, error: null };
    };
    const q: Record<string, unknown> = {
      select: (_: string, o?: { head?: boolean }) => ((soloContar = Boolean(o?.head)), q),
      eq: (c: string, v: unknown) => (filtros.push([c, v]), q),
      order: () => q,
      delete: () => ((accion = "borrar"), q),
      update: (c: Fila) => ((accion = "actualizar"), (cambios = c), q),
      upsert: (fila: Fila, o: { onConflict: string }) => {
        const existente = (tablas[nombre] ??= []).find((f) => f[o.onConflict] === fila[o.onConflict]);
        if (existente) Object.assign(existente, fila);
        else tablas[nombre].push({ ...fila });
        return Promise.resolve({ data: null, error: null });
      },
      maybeSingle: () => Promise.resolve({ data: ejecutar().data[0] ?? null, error: null }),
      then: (ok: (v: unknown) => unknown) => ok(soloContar ? { count: ejecutar().count, error: null } : ejecutar()),
    };
    return q;
  };
  return {
    db: {
      from: consulta,
      rpc: async (nombre: string, args: Fila) => (llamadasRpc.push({ nombre, args }), { error: null }),
    } as never,
    llamadasRpc,
  };
}

function telegramFalso() {
  const enviados: { chat: number; texto: string; teclado?: unknown }[] = [];
  const editados: { texto: string; teclado?: unknown }[] = [];
  const tg: Telegram = {
    enviar: async (chat, texto, teclado) => void enviados.push({ chat, texto, teclado }),
    editar: async (_c, _m, texto, teclado) => void editados.push({ texto, teclado }),
    responder: async () => {},
  };
  return { tg, enviados, editados };
}

const ORG = "org-a";
const LOCAL = "local-a";
const ahora = new Date("2026-09-30T21:00:00Z"); // 23:00 en Madrid, día 30
const vinculo = { id: "v1", organizacion_id: ORG, local_id: LOCAL, chat_id: 7, nombre: "Ana" };
const sabores = [
  { id: "s1", nombre: "Chocolate", organizacion_id: ORG, activo: true },
  { id: "s2", nombre: "Fresa", organizacion_id: ORG, activo: true },
];
const texto = (t: string) => ({ message: { chat: { id: 7, type: "private", first_name: "Ana" }, text: t } });
const boton = (data: string) => ({ callback_query: { id: "cb", data, message: { message_id: 1, chat: { id: 7 } } } });

describe("conversación del cierre por Telegram", () => {
  it("sin cierre: pregunta la venta, luego las tandas y guarda", async () => {
    const { db, llamadasRpc } = baseFalsa({ telegram_vinculos: [{ ...vinculo }], sabores: sabores.map((s) => ({ ...s })) });
    const { tg, enviados } = telegramFalso();

    await manejarActualizacion(db, tg, texto("/cierre"), ahora);
    expect(enviados.at(-1)?.texto).toContain("¿Cuánto habéis vendido hoy?");

    await manejarActualizacion(db, tg, texto("abc"), ahora);
    expect(enviados.at(-1)?.texto).toContain("No he entendido la cifra");

    await manejarActualizacion(db, tg, texto("512,40"), ahora);
    expect(enviados.at(-1)?.texto).toContain("512,40");

    await manejarActualizacion(db, tg, boton("s:1"), ahora);
    await manejarActualizacion(db, tg, boton("ok"), ahora);

    expect(llamadasRpc).toHaveLength(1);
    expect(llamadasRpc[0].args).toMatchObject({ p_organizacion: ORG, p_local: LOCAL, p_fecha: "2026-09-30", p_venta: 512.4, p_sabores: ["s2"] });
    expect(enviados.at(-1)?.texto).toContain("Hecho ✅");
  });

  it("con el cierre ya metido por el ticket, salta la venta y conserva la nota", async () => {
    const { db, llamadasRpc } = baseFalsa({
      telegram_vinculos: [{ ...vinculo }],
      sabores: sabores.map((s) => ({ ...s })),
      cierres_diarios: [{ id: "c1", organizacion_id: ORG, local_id: LOCAL, fecha: "2026-09-30", venta: 300, notas: "llovió" }],
    });
    const { tg, enviados } = telegramFalso();
    await manejarActualizacion(db, tg, texto("/cierre"), ahora);
    expect(enviados.at(-1)?.texto).toContain("Venta: 300,00");
    await manejarActualizacion(db, tg, boton("ok"), ahora);
    expect(llamadasRpc[0].args).toMatchObject({ p_venta: 300, p_sabores: [], p_notas: "llovió" });
  });

  it("escribir otra cifra en el paso de tandas corrige la venta", async () => {
    const { db, llamadasRpc } = baseFalsa({
      telegram_vinculos: [{ ...vinculo }],
      sabores: sabores.map((s) => ({ ...s })),
      cierres_diarios: [{ id: "c1", organizacion_id: ORG, local_id: LOCAL, fecha: "2026-09-30", venta: 300 }],
    });
    const { tg } = telegramFalso();
    await manejarActualizacion(db, tg, texto("/cierre"), ahora);
    await manejarActualizacion(db, tg, texto("350"), ahora);
    await manejarActualizacion(db, tg, boton("ok"), ahora);
    expect(llamadasRpc[0].args).toMatchObject({ p_venta: 350 });
  });

  it("ignora botones de mensajes antiguos y a quien no está conectado", async () => {
    const { db, llamadasRpc } = baseFalsa({ telegram_vinculos: [] });
    const { tg, enviados } = telegramFalso();
    await manejarActualizacion(db, tg, boton("ok"), ahora);
    await manejarActualizacion(db, tg, texto("512"), ahora);
    expect(llamadasRpc).toHaveLength(0);
    expect(enviados.at(-1)?.texto).toContain("Todavía no estás conectado");
  });
});

describe("conectar con un código", () => {
  it("vincula el chat al local del código y lo gasta", async () => {
    const tablas = {
      telegram_codigos: [{ codigo: "ABCDEFGHJK", organizacion_id: ORG, local_id: LOCAL, caduca: "2999-01-01T00:00:00Z" }],
      telegram_vinculos: [] as Fila[],
    };
    const { db } = baseFalsa(tablas);
    const { tg, enviados } = telegramFalso();
    await manejarActualizacion(db, tg, texto("/start abcdefghjk"), ahora);
    expect(tablas.telegram_vinculos).toHaveLength(1);
    expect(tablas.telegram_vinculos[0]).toMatchObject({ organizacion_id: ORG, local_id: LOCAL, chat_id: 7 });
    expect(tablas.telegram_codigos).toHaveLength(0);
    expect(enviados.at(-1)?.texto).toContain("Conectado");
  });

  it("rechaza un código caducado o inventado y no vincula nada", async () => {
    const tablas = {
      telegram_codigos: [{ codigo: "ABCDEFGHJK", organizacion_id: ORG, local_id: LOCAL, caduca: "2000-01-01T00:00:00Z" }],
      telegram_vinculos: [] as Fila[],
    };
    const { db } = baseFalsa(tablas);
    const { tg, enviados } = telegramFalso();
    await manejarActualizacion(db, tg, texto("/start ABCDEFGHJK"), ahora);
    await manejarActualizacion(db, tg, texto("/start ZZZZZZZZZZ"), ahora);
    expect(tablas.telegram_vinculos).toHaveLength(0);
    expect(enviados.every((e) => e.texto.includes("caducado"))).toBe(true);
  });
});

describe("aviso nocturno", () => {
  it("pregunta una sola vez al día y no molesta si el cierre ya está completo", async () => {
    const { db } = baseFalsa({
      telegram_vinculos: [{ ...vinculo }, { ...vinculo, id: "v2", chat_id: 8, organizacion_id: "org-b", local_id: "local-b" }],
      sabores: sabores.map((s) => ({ ...s })),
      cierres_diarios: [{ id: "c2", organizacion_id: "org-b", local_id: "local-b", fecha: "2026-09-30", venta: 100 }],
      cierre_tandas: [{ cierre_id: "c2", organizacion_id: "org-b", sabor_id: "x" }],
    });
    const { tg, enviados } = telegramFalso();
    expect(await avisoNocturno(db, tg, ahora)).toEqual({ avisados: 1, saltados: 1 });
    expect(enviados.map((e) => e.chat)).toEqual([7]);
    expect(await avisoNocturno(db, tg, ahora)).toEqual({ avisados: 0, saltados: 2 });
  });
});
