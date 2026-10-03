"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { codigoNuevo, resumenCodigo } from "@/lib/codigo-invitacion";
import { enlaceInvitacion, esRolInvitable } from "@/lib/invitaciones";
import { crearClienteServidor } from "@/lib/supabase/server";

export type EstadoEquipo = { error?: string; ok?: boolean; enlace?: string; etiqueta?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALGO_VA_MAL = "Algo ha ido mal. Recarga la página.";

async function origenDeLaWeb(): Promise<string> {
  const cabeceras = await headers();
  const origen = cabeceras.get("origin");
  if (origen) return origen;
  const host = cabeceras.get("x-forwarded-host") ?? cabeceras.get("host") ?? "";
  return `https://${host}`;
}

// Crea una invitación y devuelve el enlace. El código no se guarda (solo su resumen): el enlace se ve esta vez
// y no se puede recuperar; si se pierde, se anula y se crea otro.
export async function crearInvitacionAccion(_: EstadoEquipo, formData: FormData): Promise<EstadoEquipo> {
  const org = String(formData.get("org") ?? "");
  const etiqueta = String(formData.get("etiqueta") ?? "").trim();
  const rol = String(formData.get("rol") ?? "");
  if (!UUID.test(org) || !esRolInvitable(rol)) return { error: ALGO_VA_MAL };
  if (etiqueta.length < 1 || etiqueta.length > 80) return { error: "Escribe para quién es la invitación (por ejemplo, «Marta»)." };

  const supabase = await crearClienteServidor();
  const { data: claims } = await supabase.auth.getClaims();
  const codigo = codigoNuevo();
  const { error } = await supabase.from("invitaciones").insert({
    organizacion_id: org,
    etiqueta,
    rol,
    codigo_hash: resumenCodigo(codigo),
    creada_por: claims?.claims.sub ?? null,
  });
  if (error) {
    return { error: error.code === "42501" ? "No tienes permiso para invitar a nadie." : "No se pudo crear la invitación. Inténtalo de nuevo." };
  }

  revalidatePath(`/n/${org}/equipo`);
  return { ok: true, etiqueta, enlace: enlaceInvitacion(await origenDeLaWeb(), codigo) };
}

export async function anularInvitacionAccion(_: EstadoEquipo, formData: FormData): Promise<EstadoEquipo> {
  const org = String(formData.get("org") ?? "");
  const invitacion = String(formData.get("invitacion") ?? "");
  if (!UUID.test(org) || !UUID.test(invitacion)) return { error: ALGO_VA_MAL };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("invitaciones").delete().eq("id", invitacion).eq("organizacion_id", org);
  if (error) return { error: "No se pudo anular. Inténtalo de nuevo." };

  revalidatePath(`/n/${org}/equipo`);
  return { ok: true };
}

// Quita a alguien del negocio. La base de datos decide quién puede y no deja el negocio sin dueño.
export async function quitarMiembroAccion(_: EstadoEquipo, formData: FormData): Promise<EstadoEquipo> {
  const org = String(formData.get("org") ?? "");
  const usuario = String(formData.get("usuario") ?? "");
  if (!UUID.test(org) || !UUID.test(usuario)) return { error: ALGO_VA_MAL };

  const supabase = await crearClienteServidor();
  const { data: claims } = await supabase.auth.getClaims();
  if (claims?.claims.sub === usuario) return { error: "No puedes quitarte a ti mismo." };

  const { data, error } = await supabase
    .from("miembros")
    .delete()
    .eq("organizacion_id", org)
    .eq("usuario_id", usuario)
    .select("usuario_id");
  if (error) return { error: "No se pudo quitar. Inténtalo de nuevo." };
  if (!data || data.length === 0) return { error: "No tienes permiso para quitar a esta persona, o ya no estaba." };

  revalidatePath(`/n/${org}/equipo`);
  return { ok: true };
}
