import { euros, fechaLarga, leerImporte } from "./cierre";
import { diaACerrar, diaDeTrabajo } from "./horario-aviso";
import type { crearClienteAdmin } from "./supabase/admin";
import type { Database } from "./supabase/database.types";
import type { ActualizacionTelegram, Teclado, Telegram } from "./telegram";

// El cierre de cada noche por Telegram: la venta y los sabores de los que se ha acabado una tanda.
// Cada chat está conectado a un local de un negocio (telegram_vinculos) y el bot solo toca ese
// local. Escribe con la clave de servicio, así que aquí se acota todo a mano.

type Db = NonNullable<ReturnType<typeof crearClienteAdmin>>;
type Conversacion = Database["public"]["Tables"]["telegram_conversaciones"]["Row"];
type Vinculo = Database["public"]["Tables"]["telegram_vinculos"]["Row"];
export type SaborOfrecido = { id: string; nombre: string };

const VENTA_MAXIMA = 100_000;

const sabores = (c: Pick<Conversacion, "sabores">) => c.sabores as SaborOfrecido[];

export function tecladoTandas(ofrecidos: SaborOfrecido[], seleccion: number[]): Teclado {
  const botones = ofrecidos.map((s, i) => ({
    texto: `${seleccion.includes(i) ? "✅ " : ""}${s.nombre}`,
    dato: `s:${i}`,
  }));
  const filas: Teclado = [];
  for (let i = 0; i < botones.length; i += 2) filas.push(botones.slice(i, i + 2));
  filas.push([{ texto: seleccion.length > 0 ? "Listo ✅" : "Ninguna, listo ✅", dato: "ok" }]);
  return filas;
}

export function textoTandas(fecha: string, venta: number): string {
  return `🍦 Cierre de ${fechaLarga(fecha)}\nVenta: ${euros(venta)}\n\n¿Se ha acabado alguna tanda completa hoy? Toca los sabores y pulsa Listo.\n(Si la venta no es correcta, escríbeme la cifra buena.)`;
}

export function textoFinal(venta: number, acabadas: string[]): string {
  const tandas = acabadas.length > 0 ? `Tandas acabadas: ${acabadas.join(", ")}.` : "Ninguna tanda completa.";
  return `Hecho ✅ Cierre guardado: ${euros(venta)}. ${tandas}`;
}

// Empieza (o reinicia) la conversación de hoy con un chat. Si el día ya tiene cierre (por ejemplo
// porque llegó el ticket por correo), se salta la pregunta de la venta y solo se pregunta por las tandas.
export async function empezarCierre(db: Db, tg: Telegram, vinculo: Vinculo, hoy: string): Promise<void> {
  const [cierre, activos] = await Promise.all([
    db
      .from("cierres_diarios")
      .select("id, venta")
      .eq("organizacion_id", vinculo.organizacion_id)
      .eq("local_id", vinculo.local_id)
      .eq("fecha", hoy)
      .maybeSingle(),
    db
      .from("sabores")
      .select("id, nombre")
      .eq("organizacion_id", vinculo.organizacion_id)
      .eq("activo", true)
      .order("nombre"),
  ]);
  const ofrecidos: SaborOfrecido[] = activos.data ?? [];

  let seleccion: number[] = [];
  if (cierre.data) {
    const { data: tandas } = await db
      .from("cierre_tandas")
      .select("sabor_id")
      .eq("organizacion_id", vinculo.organizacion_id)
      .eq("cierre_id", cierre.data.id);
    const ya = new Set((tandas ?? []).map((t) => t.sabor_id));
    seleccion = ofrecidos.flatMap((s, i) => (ya.has(s.id) ? [i] : []));
  }

  const venta = cierre.data?.venta ?? null;
  const fila = {
    chat_id: vinculo.chat_id,
    organizacion_id: vinculo.organizacion_id,
    local_id: vinculo.local_id,
    fecha: hoy,
    paso: venta === null ? "venta" : "tandas",
    venta,
    sabores: ofrecidos,
    seleccion,
    actualizado_en: new Date().toISOString(),
  };
  const { error } = await db.from("telegram_conversaciones").upsert(fila, { onConflict: "chat_id" });
  if (error) return tg.enviar(vinculo.chat_id, "Ahora mismo no puedo hacer el cierre. Inténtalo en un rato o hazlo desde la app.");

  if (venta === null) {
    await tg.enviar(
      vinculo.chat_id,
      `🍦 Cierre de ${fechaLarga(hoy)}\n\n¿Cuánto habéis vendido hoy? Escríbeme la cifra, por ejemplo 512,40`,
    );
  } else if (ofrecidos.length === 0) {
    await guardar(db, tg, { ...fila, paso: "tandas" } as Conversacion);
  } else {
    await tg.enviar(vinculo.chat_id, textoTandas(hoy, venta), tecladoTandas(ofrecidos, seleccion));
  }
}

async function guardar(db: Db, tg: Telegram, conv: Conversacion): Promise<void> {
  if (conv.venta === null) return;
  const ofrecidos = sabores(conv);
  const elegidos = conv.seleccion.flatMap((i) => (ofrecidos[i] ? [ofrecidos[i]] : []));
  // Se conserva la nota que ya tuviera el cierre: guardar_cierre la reemplaza.
  const { data: previo } = await db
    .from("cierres_diarios")
    .select("notas")
    .eq("organizacion_id", conv.organizacion_id)
    .eq("local_id", conv.local_id)
    .eq("fecha", conv.fecha)
    .maybeSingle();
  const { error } = await db.rpc("guardar_cierre", {
    p_organizacion: conv.organizacion_id,
    p_local: conv.local_id,
    p_fecha: conv.fecha,
    p_venta: conv.venta,
    p_sabores: elegidos.map((s) => s.id),
    p_notas: previo?.notas ?? undefined,
  });
  if (error) {
    await tg.enviar(conv.chat_id, "No he podido guardar el cierre. Escribe /cierre para intentarlo otra vez o hazlo desde la app.");
    return;
  }
  await db
    .from("telegram_conversaciones")
    .update({ paso: "hecho", actualizado_en: new Date().toISOString() })
    .eq("chat_id", conv.chat_id);
  await tg.enviar(conv.chat_id, textoFinal(conv.venta, elegidos.map((s) => s.nombre)));
}

async function conectar(db: Db, tg: Telegram, chat: { id: number; nombre?: string }, codigo: string): Promise<void> {
  const { data: fila } = await db.from("telegram_codigos").select("*").eq("codigo", codigo.toUpperCase()).maybeSingle();
  if (!fila || new Date(fila.caduca) < new Date()) {
    return tg.enviar(chat.id, "Ese enlace ha caducado. Vuelve a la app (Ventas → Aviso por Telegram) y pulsa el botón otra vez.");
  }
  await db.from("telegram_codigos").delete().eq("codigo", fila.codigo);
  const { error } = await db.from("telegram_vinculos").upsert(
    {
      organizacion_id: fila.organizacion_id,
      local_id: fila.local_id,
      chat_id: chat.id,
      nombre: chat.nombre?.slice(0, 120) ?? null,
    },
    { onConflict: "chat_id" },
  );
  if (error) return tg.enviar(chat.id, "No he podido conectar. Inténtalo otra vez desde la app.");
  await tg.enviar(chat.id, "¡Conectado! 🍦 Cada noche te preguntaré por el cierre del día. Si quieres hacerlo ahora, escribe /cierre.");
}

async function zonaDe(db: Db, organizacion: string): Promise<string> {
  const { data } = await db.from("ajustes_organizacion").select("zona_horaria").eq("organizacion_id", organizacion).maybeSingle();
  return data?.zona_horaria ?? "Europe/Madrid";
}

// Todo lo que llega de Telegram: mensajes de texto y pulsaciones de botones.
export async function manejarActualizacion(db: Db, tg: Telegram, u: ActualizacionTelegram, ahora = new Date()): Promise<void> {
  const boton = u.callback_query;
  if (boton) {
    await tg.responder(boton.id);
    const chat = boton.message?.chat.id;
    const mensaje = boton.message?.message_id;
    if (chat === undefined || mensaje === undefined || !boton.data) return;
    const { data: conv } = await db.from("telegram_conversaciones").select("*").eq("chat_id", chat).maybeSingle();
    if (!conv || conv.paso !== "tandas" || conv.venta === null) return; // botón de un mensaje antiguo
    const ofrecidos = sabores(conv);
    if (boton.data === "ok") {
      await tg.editar(chat, mensaje, textoTandas(conv.fecha, conv.venta) + "\n\n👌 Listo.");
      return guardar(db, tg, conv);
    }
    const indice = /^s:(\d+)$/.exec(boton.data)?.[1];
    if (indice === undefined || !ofrecidos[Number(indice)]) return;
    const i = Number(indice);
    const seleccion = conv.seleccion.includes(i) ? conv.seleccion.filter((x) => x !== i) : [...conv.seleccion, i].sort((a, b) => a - b);
    await db.from("telegram_conversaciones").update({ seleccion, actualizado_en: new Date().toISOString() }).eq("chat_id", chat);
    return tg.editar(chat, mensaje, textoTandas(conv.fecha, conv.venta), tecladoTandas(ofrecidos, seleccion));
  }

  const texto = u.message?.text?.trim();
  const chat = u.message?.chat;
  if (!texto || !chat) return;

  const inicio = /^\/start(?:@\w+)?(?:\s+(\S+))?$/i.exec(texto);
  if (inicio) {
    if (chat.type !== "private") return tg.enviar(chat.id, "Conéctame desde un chat privado conmigo, no desde un grupo.");
    if (inicio[1]) return conectar(db, tg, { id: chat.id, nombre: chat.first_name ?? chat.title }, inicio[1]);
    const { data: ya } = await db.from("telegram_vinculos").select("id").eq("chat_id", chat.id).maybeSingle();
    return tg.enviar(
      chat.id,
      ya
        ? "Ya estás conectado. Escribe /cierre para hacer el cierre de hoy."
        : "Para conectarme, abre la app, entra en Ventas y pulsa «Conectar Telegram».",
    );
  }

  const { data: vinculo } = await db.from("telegram_vinculos").select("*").eq("chat_id", chat.id).maybeSingle();
  if (!vinculo) return tg.enviar(chat.id, "Todavía no estás conectado. Abre la app, entra en Ventas y pulsa «Conectar Telegram».");

  if (/^\/cierre(?:@\w+)?$/i.test(texto)) {
    return empezarCierre(db, tg, vinculo, diaDeTrabajo(await zonaDe(db, vinculo.organizacion_id), ahora));
  }

  const { data: conv } = await db.from("telegram_conversaciones").select("*").eq("chat_id", chat.id).maybeSingle();
  if (conv && (conv.paso === "venta" || conv.paso === "tandas")) {
    const venta = leerImporte(texto);
    if (venta === null || venta > VENTA_MAXIMA) {
      return tg.enviar(chat.id, "No he entendido la cifra. Escríbela solo con números, por ejemplo 512,40");
    }
    const ofrecidos = sabores(conv);
    await db
      .from("telegram_conversaciones")
      .update({ venta, paso: "tandas", actualizado_en: new Date().toISOString() })
      .eq("chat_id", chat.id);
    if (ofrecidos.length === 0) return guardar(db, tg, { ...conv, venta, paso: "tandas" });
    return tg.enviar(chat.id, textoTandas(conv.fecha, venta), tecladoTandas(ofrecidos, conv.seleccion));
  }

  return tg.enviar(chat.id, "Escribe /cierre para hacer el cierre de hoy.");
}

// Lo lanza un programador cada pocos minutos: a cada chat conectado que todavía no haya hecho el cierre
// del día le pregunta cuando llega su hora (ver horario-aviso.ts). Varias llamadas seguidas no repiten nada.
export async function avisoNocturno(db: Db, tg: Telegram, ahora = new Date()): Promise<{ avisados: number; saltados: number }> {
  const { data: vinculos } = await db.from("telegram_vinculos").select("*");
  let avisados = 0;
  let saltados = 0;
  for (const vinculo of vinculos ?? []) {
    const hoy = diaACerrar(await zonaDe(db, vinculo.organizacion_id), ahora);
    if (!hoy) {
      saltados++; // todavía no es su hora
      continue;
    }
    const { data: conv } = await db.from("telegram_conversaciones").select("fecha").eq("chat_id", vinculo.chat_id).maybeSingle();
    if (conv && conv.fecha >= hoy) {
      saltados++; // ya se le preguntó hoy (o ya lo hizo)
      continue;
    }
    const { data: cierre } = await db
      .from("cierres_diarios")
      .select("id")
      .eq("organizacion_id", vinculo.organizacion_id)
      .eq("local_id", vinculo.local_id)
      .eq("fecha", hoy)
      .maybeSingle();
    if (cierre) {
      const { count } = await db
        .from("cierre_tandas")
        .select("sabor_id", { count: "exact", head: true })
        .eq("organizacion_id", vinculo.organizacion_id)
        .eq("cierre_id", cierre.id);
      if ((count ?? 0) > 0) {
        saltados++; // el cierre ya está completo en la app
        continue;
      }
    }
    await empezarCierre(db, tg, vinculo, hoy);
    avisados++;
  }
  return { avisados, saltados };
}
