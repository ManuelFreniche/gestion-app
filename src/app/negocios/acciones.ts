"use server";

import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";

export type EstadoAlta = { error?: string };

export async function crearNegocio(_: EstadoAlta, formData: FormData): Promise<EstadoAlta> {
  const nombre = String(formData.get("nombre") ?? "").trim();
  const local = String(formData.get("local") ?? "").trim() || "Principal";
  if (!nombre) return { error: "Pon un nombre al negocio." };

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("crear_organizacion", {
    p_nombre: nombre,
    p_local: local,
  });
  if (error || !data) return { error: "No se pudo crear el negocio. Inténtalo de nuevo." };

  redirect(`/n/${data}`);
}
