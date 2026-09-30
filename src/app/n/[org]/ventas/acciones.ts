"use server";

import { revalidatePath } from "next/cache";
import { leerImporte, esFecha } from "@/lib/cierre";
import { crearClienteServidor } from "@/lib/supabase/server";

export type EstadoCierre = { error?: string; guardado?: boolean };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Guarda el cierre del día. La base de datos decide si el usuario puede hacerlo (RLS).
export async function guardarCierre(_: EstadoCierre, formData: FormData): Promise<EstadoCierre> {
  const org = String(formData.get("org") ?? "");
  const local = String(formData.get("local") ?? "");
  const fecha = String(formData.get("fecha") ?? "");
  const venta = leerImporte(String(formData.get("venta") ?? ""));
  const sabores = formData.getAll("sabores").map(String).filter((id) => UUID.test(id));

  if (!UUID.test(org) || !UUID.test(local) || !esFecha(fecha)) {
    return { error: "Algo ha ido mal. Recarga la página e inténtalo de nuevo." };
  }
  if (venta === null) return { error: "Escribe cuánto habéis vendido, por ejemplo 512,40." };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("guardar_cierre", {
    p_organizacion: org,
    p_local: local,
    p_fecha: fecha,
    p_venta: venta,
    p_sabores: sabores,
    p_notas: String(formData.get("notas") ?? "") || undefined,
  });

  if (error) {
    return {
      error:
        error.code === "42501"
          ? "No tienes permiso para guardar el cierre."
          : "No se pudo guardar. Inténtalo de nuevo.",
    };
  }

  revalidatePath(`/n/${org}/ventas`);
  return { guardado: true };
}

// Añade sabores nuevos (uno por línea o separados por comas).
export async function anadirSabores(_: EstadoCierre, formData: FormData): Promise<EstadoCierre> {
  const org = String(formData.get("org") ?? "");
  const nombres = [
    ...new Set(
      String(formData.get("sabores") ?? "")
        .split(/[,\n]/)
        .map((n) => n.trim())
        .filter(Boolean),
    ),
  ];

  if (!UUID.test(org)) return { error: "Algo ha ido mal. Recarga la página." };
  if (nombres.length === 0) return { error: "Escribe al menos un sabor." };

  const supabase = await crearClienteServidor();
  const { error } = await supabase
    .from("sabores")
    .insert(nombres.map((nombre) => ({ organizacion_id: org, nombre })));

  if (error) {
    if (error.code === "23505") return { error: "Alguno de esos sabores ya existía." };
    if (error.code === "42501") return { error: "No tienes permiso para añadir sabores." };
    return { error: "No se pudieron guardar los sabores." };
  }

  revalidatePath(`/n/${org}/ventas`);
  return { guardado: true };
}
