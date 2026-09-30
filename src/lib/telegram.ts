import { createHash } from "node:crypto";

// Cliente mínimo de la API de bots de Telegram. El token solo vive en el servidor.

export type Boton = { texto: string; dato: string };
export type Teclado = Boton[][];

export type ActualizacionTelegram = {
  message?: { chat: { id: number; type: string; first_name?: string; title?: string }; text?: string };
  callback_query?: {
    id: string;
    data?: string;
    message?: { message_id: number; chat: { id: number } };
  };
};

export type Telegram = {
  enviar(chat: number, texto: string, teclado?: Teclado): Promise<void>;
  editar(chat: number, mensaje: number, texto: string, teclado?: Teclado): Promise<void>;
  responder(callbackId: string): Promise<void>;
};

export const tokenTelegram = () => process.env.TELEGRAM_BOT_TOKEN?.trim() || null;

// El secreto con el que Telegram firma cada llamada al webhook se deriva del token:
// así no hay otra variable que configurar y nadie más puede conocerlo.
export function secretoWebhook(token: string): string {
  return createHash("sha256").update(`gestion-webhook:${token}`).digest("hex").slice(0, 48);
}

const marcado = (teclado?: Teclado) =>
  teclado ? { inline_keyboard: teclado.map((fila) => fila.map((b) => ({ text: b.texto, callback_data: b.dato }))) } : undefined;

async function llamar<T>(token: string, metodo: string, cuerpo: Record<string, unknown>): Promise<T | null> {
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/${metodo}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(cuerpo),
    });
    const json = (await r.json()) as { ok: boolean; result?: T };
    return json.ok ? (json.result ?? null) : null;
  } catch {
    return null;
  }
}

export function crearTelegram(token: string): Telegram {
  return {
    async enviar(chat, texto, teclado) {
      await llamar(token, "sendMessage", { chat_id: chat, text: texto, reply_markup: marcado(teclado) });
    },
    async editar(chat, mensaje, texto, teclado) {
      await llamar(token, "editMessageText", {
        chat_id: chat,
        message_id: mensaje,
        text: texto,
        reply_markup: marcado(teclado) ?? { inline_keyboard: [] },
      });
    },
    async responder(callbackId) {
      await llamar(token, "answerCallbackQuery", { callback_query_id: callbackId });
    },
  };
}

export async function usuarioDelBot(token: string): Promise<string | null> {
  const yo = await llamar<{ username?: string }>(token, "getMe", {});
  return yo?.username ?? null;
}

// Le dice a Telegram a dónde mandar lo que escriba la gente.
export async function registrarWebhook(token: string, url: string): Promise<boolean> {
  const r = await llamar<boolean>(token, "setWebhook", {
    url,
    secret_token: secretoWebhook(token),
    allowed_updates: ["message", "callback_query"],
  });
  return r === true;
}
