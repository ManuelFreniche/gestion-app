import { euros, leerImporte } from "./cierre";

// Versión del lector de cierres con la que se guardó una tarjeta (datos.version_lectura). Las leídas con una
// versión anterior no se dan por buenas: salen sin marcar y con un aviso, y volver a mandar el mismo PDF las relee.
export const VERSION_LECTURA_CIERRE = 2;

// Un cierre de caja pendiente en la Bandeja, tal como lo lee la tarjeta de cierres.
export type CierrePendiente = {
  id: string; // documento
  // Cambia cuando cambia lo leído (p. ej. tras "Volver a leer"): la fila vuelve a empezar con los datos nuevos.
  clave: string;
  nombre: string;
  tipoArchivo: string;
  url: string;
  recibido: string;
  fecha?: string;
  venta?: number;
  efectivo?: number;
  banco?: number;
  // Lo que el lector no pudo leer o no le cuadró.
  aviso?: string;
};

export type ValoresFila = { fecha: string; venta: string; efectivo: string; banco: string };

const coma = (n?: number) => (n === undefined ? "" : n.toFixed(2).replace(".", ","));

export function valoresIniciales(c: CierrePendiente): ValoresFila {
  return { fecha: c.fecha ?? "", venta: coma(c.venta), efectivo: coma(c.efectivo), banco: coma(c.banco) };
}

// Un cierre se marca solo si se ha leído entero y sin dudas; lo demás lo marca la persona después de mirarlo.
export function marcadoPorDefecto(c: CierrePendiente): boolean {
  return Boolean(c.fecha) && c.venta !== undefined && !c.aviso;
}

// De más viejo a más nuevo (los que no tienen fecha, primero, para que se vean y se arreglen).
export function ordenarCierres<T extends { fecha?: string; recibido?: string }>(cierres: T[]): T[] {
  return [...cierres].sort((a, b) => (a.fecha ?? "").localeCompare(b.fecha ?? ""));
}

export type Problemas = {
  // Impiden meterlo tal cual.
  bloqueantes: string[];
  // Se puede meter, pero conviene mirarlo.
  avisos: string[];
};

export function problemasFila(
  c: CierrePendiente,
  v: ValoresFila,
  contexto: { hoy: string; repetidoEnLote: boolean; ventasPorDia: Record<string, number> },
): Problemas {
  const bloqueantes: string[] = [];
  const avisos: string[] = [];
  const venta = v.venta.trim() ? leerImporte(v.venta) : null;
  const efectivo = v.efectivo.trim() ? leerImporte(v.efectivo) : null;
  const banco = v.banco.trim() ? leerImporte(v.banco) : null;

  if (!v.fecha) bloqueantes.push("Elige el día del cierre: no lo he encontrado en el documento.");
  else if (v.fecha > contexto.hoy) bloqueantes.push("Es un día futuro: corrige la fecha.");
  if (venta === null) bloqueantes.push(v.venta.trim() ? "La venta no es un importe válido." : "Escribe la venta mirando el documento.");
  if ((v.efectivo.trim() && efectivo === null) || (v.banco.trim() && banco === null)) {
    bloqueantes.push("Efectivo y tarjeta tienen que ser importes, por ejemplo 10,80.");
  }
  if (contexto.repetidoEnLote && v.fecha) bloqueantes.push("Hay otro cierre marcado del mismo día: desmarca uno.");

  if (venta !== null && ((efectivo ?? 0) + (banco ?? 0) > venta + 0.05)) {
    avisos.push("Efectivo y tarjeta suman más que la venta: revisa las cifras.");
  }
  const antes = v.fecha ? contexto.ventasPorDia[v.fecha] : undefined;
  if (antes !== undefined && venta !== null && Math.abs(antes - venta) >= 0.005) {
    avisos.push(`Ese día ya hay en Ventas ${euros(antes)}: se cambiaría por este.`);
  }
  if (c.aviso) avisos.push(c.aviso);
  return { bloqueantes, avisos };
}
