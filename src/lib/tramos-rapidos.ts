import { sumarDias } from "./cierre";

export type TramoRapido = { nombre: string; desde: string; hasta: string };

// Atajos para no tener que elegir dos fechas a mano en el móvil. `hoy` es aaaa-mm-dd en la zona del negocio.
export function tramosRapidos(hoy: string): TramoRapido[] {
  const primeroDeEsteMes = `${hoy.slice(0, 8)}01`;
  const ultimoDelMesPasado = sumarDias(primeroDeEsteMes, -1);
  return [
    { nombre: "Últimos 30 días", desde: sumarDias(hoy, -29), hasta: hoy },
    { nombre: "Este mes", desde: primeroDeEsteMes, hasta: hoy },
    { nombre: "Mes pasado", desde: `${ultimoDelMesPasado.slice(0, 8)}01`, hasta: ultimoDelMesPasado },
  ];
}
