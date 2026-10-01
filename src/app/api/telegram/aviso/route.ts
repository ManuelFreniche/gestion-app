import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { avisoNocturno } from "@/lib/bot-cierre";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { crearTelegram, tokenTelegram } from "@/lib/telegram";

export const maxDuration = 60;

// Lo llama un flujo de GitHub cada 10 minutos por la noche (.github/workflows/aviso-telegram.yml) con
// CRON_SECRET en la cabecera Authorization; sin esa variable configurada, el aviso queda desactivado.
export async function GET(peticion: Request) {
  const secreto = process.env.CRON_SECRET?.trim();
  const token = tokenTelegram();
  const db = crearClienteAdmin();
  if (!secreto || !token || !db) return NextResponse.json({ ok: false }, { status: 404 });

  const recibido = Buffer.from(peticion.headers.get("authorization") ?? "");
  const esperado = Buffer.from(`Bearer ${secreto}`);
  if (recibido.length !== esperado.length || !timingSafeEqual(recibido, esperado)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  return NextResponse.json({ ok: true, ...(await avisoNocturno(db, crearTelegram(token))) });
}
