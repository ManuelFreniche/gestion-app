"use server";

import { redirect } from "next/navigation";
import { CODIGO_VALIDO } from "@/lib/destino-invitacion";
import { mensajeDeLaRegla } from "@/lib/errores-bandeja";
import { crearClienteServidor } from "@/lib/supabase/server";

export type EstadoAceptar = { error?: string };

// Quien abre el enlace acepta la invitación. La base de datos comprueba el código (vale una vez y caduca) y
// da de alta a la persona con el rol de la invitación; sus mensajes de error ya están en español.
export async function aceptarInvitacionAccion(_: EstadoAceptar, formData: FormData): Promise<EstadoAceptar> {
  const codigo = String(formData.get("codigo") ?? "");
  if (!CODIGO_VALIDO.test(codigo)) return { error: "El enlace no es correcto. Pide otra invitación a quien te invitó." };

  const supabase = await crearClienteServidor();
  const { data: negocio, error } = await supabase.rpc("aceptar_invitacion", { p_codigo: codigo });
  if (error || !negocio) return { error: (error && mensajeDeLaRegla(error)) || "No se pudo aceptar la invitación. Inténtalo de nuevo." };

  redirect(`/n/${negocio}`);
}
