"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_SESION_TEMPORAL } from "@/lib/supabase/cookies";
import { crearClienteServidor } from "@/lib/supabase/server";

export type EstadoLogin = { error?: string; mensaje?: string };

function leerCredenciales(formData: FormData) {
  return {
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
  };
}

export async function entrar(_: EstadoLogin, formData: FormData): Promise<EstadoLogin> {
  const { email, password } = leerCredenciales(formData);
  const recordar = formData.get("recordar") === "on";
  const almacen = await cookies();
  if (recordar) almacen.delete(COOKIE_SESION_TEMPORAL);
  else almacen.set(COOKIE_SESION_TEMPORAL, "1", { path: "/", sameSite: "lax", secure: true });
  const supabase = await crearClienteServidor({ temporal: !recordar });
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "Correo o contraseña incorrectos." };
  redirect("/negocios");
}

export async function crearCuenta(_: EstadoLogin, formData: FormData): Promise<EstadoLogin> {
  const { email, password } = leerCredenciales(formData);
  const nombre = String(formData.get("nombre") ?? "").trim();
  if (password.length < 8) return { error: "La contraseña necesita al menos 8 caracteres." };

  const origen = (await headers()).get("origin");
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { nombre },
      emailRedirectTo: `${origen}/auth/callback`,
    },
  });
  if (error) return { error: "No se pudo crear la cuenta. Revisa el correo e inténtalo de nuevo." };

  // Si el proyecto pide confirmar el correo, aún no hay sesión.
  if (!data.session) {
    return { mensaje: "Te hemos enviado un correo para confirmar la cuenta." };
  }
  redirect("/negocios");
}

export async function salir() {
  const supabase = await crearClienteServidor();
  await supabase.auth.signOut();
  redirect("/login");
}
