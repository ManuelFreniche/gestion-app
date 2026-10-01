"use server";

import { revalidatePath } from "next/cache";
import { esFecha, hoyEn, leerImporte } from "@/lib/cierre";
import { CATEGORIAS } from "@/lib/factura";
import { crearClienteServidor } from "@/lib/supabase/server";

export type EstadoGasto = { error?: string; guardado?: boolean };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Apunta un gasto que no tiene factura de proveedor. La base de datos decide si se puede (RLS).
export async function apuntarGasto(_: EstadoGasto, formData: FormData): Promise<EstadoGasto> {
  const org = String(formData.get("org") ?? "");
  const concepto = String(formData.get("concepto") ?? "").trim();
  const importe = leerImporte(String(formData.get("importe") ?? ""));
  const categoria = String(formData.get("categoria") ?? "");
  const fecha = String(formData.get("fecha") ?? "");

  if (!UUID.test(org)) return { error: "Algo ha ido mal. Recarga la página e inténtalo de nuevo." };
  if (!concepto) return { error: "Escribe en qué ha sido el gasto, por ejemplo «Alquiler»." };
  if (concepto.length > 120) return { error: "El nombre del gasto es demasiado largo." };
  if (importe === null || importe <= 0) return { error: "Escribe el importe, por ejemplo 650 o 42,50." };
  if (!(CATEGORIAS as readonly string[]).includes(categoria)) return { error: "Elige una categoría." };
  if (!esFecha(fecha)) return { error: "Elige el día del gasto." };

  const supabase = await crearClienteServidor();
  const { data: ajustes } = await supabase
    .from("ajustes_organizacion")
    .select("zona_horaria")
    .eq("organizacion_id", org)
    .maybeSingle();
  if (fecha > hoyEn(ajustes?.zona_horaria ?? "Europe/Madrid")) return { error: "El gasto no puede ser de un día futuro." };

  const { error } = await supabase.from("gastos_varios").insert({ organizacion_id: org, fecha, concepto, categoria, importe });
  if (error) {
    return { error: error.code === "42501" ? "No tienes permiso para apuntar gastos." : "No se pudo guardar. Inténtalo de nuevo." };
  }
  revalidatePath(`/n/${org}/gastos`);
  return { guardado: true };
}

export async function borrarGasto(formData: FormData): Promise<void> {
  const org = String(formData.get("org") ?? "");
  const gasto = String(formData.get("gasto") ?? "");
  if (!UUID.test(org) || !UUID.test(gasto)) return;
  const supabase = await crearClienteServidor();
  await supabase.from("gastos_varios").delete().eq("id", gasto).eq("organizacion_id", org);
  revalidatePath(`/n/${org}/gastos`);
}
