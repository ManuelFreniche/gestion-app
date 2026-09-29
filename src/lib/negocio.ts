import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { Rol } from "@/lib/permisos";

export type Negocio = {
  id: string;
  nombre: string;
  rol: Rol;
  permisos: Set<string>;
  modulosActivos: string[];
};

// Carga el negocio activo con el rol y los permisos del usuario.
// Si el usuario no es miembro, RLS no devuelve la fila y respondemos 404:
// no revelamos ni que el negocio existe.
export const cargarNegocio = cache(async (organizacionId: string): Promise<Negocio> => {
  const supabase = await crearClienteServidor();

  const { data: claims } = await supabase.auth.getClaims();
  const usuarioId = claims?.claims.sub;
  if (!usuarioId) redirect("/login");

  const [organizacion, miembro, ajustes, permisos] = await Promise.all([
    supabase.from("organizaciones").select("id, nombre").eq("id", organizacionId).maybeSingle(),
    supabase
      .from("miembros")
      .select("rol")
      .eq("organizacion_id", organizacionId)
      .eq("usuario_id", usuarioId)
      .maybeSingle(),
    supabase
      .from("ajustes_organizacion")
      .select("modulos")
      .eq("organizacion_id", organizacionId)
      .maybeSingle(),
    supabase.rpc("mis_permisos", { p_organizacion: organizacionId }),
  ]);

  if (!organizacion.data || !miembro.data) notFound();

  return {
    id: organizacion.data.id,
    nombre: organizacion.data.nombre,
    rol: miembro.data.rol,
    permisos: new Set(permisos.data ?? []),
    modulosActivos: ajustes.data?.modulos ?? [],
  };
});

// Para usar al principio de páginas y acciones: sin el permiso, 404.
export async function exigirPermiso(organizacionId: string, permiso: string) {
  const negocio = await cargarNegocio(organizacionId);
  if (!negocio.permisos.has(permiso)) notFound();
  return negocio;
}
