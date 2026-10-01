import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { manejarActualizacion } from "@/lib/bot-cierre";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { crearTelegram, secretoWebhook, tokenTelegram, type ActualizacionTelegram } from "@/lib/telegram";

export const maxDuration = 30;

// Aquí llega todo lo que la gente escribe al bot. Telegram firma cada llamada con el secreto que
// le dimos al registrar el webhook: sin él no se hace nada. Siempre se responde 200 para que
// Telegram no reenvíe el mismo mensaje una y otra vez.
export async function POST(peticion: Request) {
  const token = tokenTelegram();
  const db = crearClienteAdmin();
  if (!token || !db) return NextResponse.json({ ok: false }, { status: 404 });

  const recibido = Buffer.from(peticion.headers.get("x-telegram-bot-api-secret-token") ?? "");
  const esperado = Buffer.from(secretoWebhook(token));
  if (recibido.length !== esperado.length || !timingSafeEqual(recibido, esperado)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const actualizacion = (await peticion.json().catch(() => null)) as ActualizacionTelegram | null;
  if (actualizacion) await manejarActualizacion(db, crearTelegram(token), actualizacion).catch(() => {});
  return NextResponse.json({ ok: true });
}
