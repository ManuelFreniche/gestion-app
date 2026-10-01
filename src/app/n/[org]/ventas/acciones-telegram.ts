"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { crearClienteServidor } from "@/lib/supabase/server";
import { registrarWebhook, tokenTelegram, usuarioDelBot } from "@/lib/telegram";

export type EstadoTelegram = { error?: string; enlace?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const codigoNuevo = () => Array.from(randomBytes(10), (b) => ALFABETO[b % ALFABETO.length]).join("");

// Prepara la conexión: deja listo el bot (registra su webhook en esta web) y crea un código de un
// solo uso dentro de un enlace que abre Telegram. La base de datos decide quién puede (RLS).
export async function conectarTelegram(_: EstadoTelegram, formData: FormData): Promise<EstadoTelegram> {
  const org = String(formData.get("org") ?? "");
  const local = String(formData.get("local") ?? "");
  if (!UUID.test(org) || !UUID.test(local)) return { error: "Algo ha ido mal. Recarga la página." };

  const token = tokenTelegram();
  if (!token) return { error: "El bot todavía no está configurado en el servidor." };

  const supabase = await crearClienteServidor();
  const codigo = codigoNuevo();
  const { error } = await supabase.from("telegram_codigos").insert({ codigo, organizacion_id: org, local_id: local });
  if (error) {
    return { error: error.code === "42501" ? "Solo el dueño puede conectar Telegram." : "No se pudo preparar la conexión. Inténtalo de nuevo." };
  }

  const cabeceras = await headers();
  const host = cabeceras.get("x-forwarded-host") ?? cabeceras.get("host");
  if (!host || !(await registrarWebhook(token, `https://${host}/api/telegram/webhook`))) {
    return { error: "No se pudo activar el bot. Comprueba que el token de Telegram es correcto." };
  }
  const usuario = await usuarioDelBot(token);
  if (!usuario) return { error: "Telegram no reconoce el bot. Comprueba el token." };

  return { enlace: `https://t.me/${usuario}?start=${codigo}` };
}

export async function desconectarTelegram(formData: FormData): Promise<void> {
  const org = String(formData.get("org") ?? "");
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(org) || !UUID.test(id)) return;
  const supabase = await crearClienteServidor();
  await supabase.from("telegram_vinculos").delete().eq("organizacion_id", org).eq("id", id);
  revalidatePath(`/n/${org}/ventas`);
}
