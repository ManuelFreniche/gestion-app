// Invitar al equipo con un enlace de un solo uso. Esta parte se puede usar también en pantalla; lo que genera
// y resume el código está en codigo-invitacion.ts, solo para el servidor.

import type { Rol } from "./permisos";

export const ROLES_INVITABLES: { rol: Exclude<Rol, "dueno">; nombre: string; explicacion: string }[] = [
  { rol: "encargado", nombre: "Encargado", explicacion: "Todo lo del día a día, sin usuarios ni ajustes." },
  { rol: "empleado", nombre: "Empleado", explicacion: "Ventas, recuentos y subir facturas. No ve costes ni márgenes." },
  { rol: "gestoria", nombre: "Gestoría", explicacion: "Solo mira gastos y facturas, y descarga el Excel." },
];

export function esRolInvitable(rol: string): rol is Exclude<Rol, "dueno"> {
  return ROLES_INVITABLES.some((r) => r.rol === rol);
}

export function enlaceInvitacion(origen: string, codigo: string): string {
  return `${origen.replace(/\/+$/, "")}/invitacion/${codigo}`;
}

export type EstadoInvitacion = "vigente" | "usada" | "caducada";

export function estadoInvitacion(inv: { usada_en: string | null; caduca_en: string }, ahora: Date): EstadoInvitacion {
  if (inv.usada_en) return "usada";
  return new Date(inv.caduca_en).getTime() < ahora.getTime() ? "caducada" : "vigente";
}
