// Cuentas del mes para el módulo Gastos: suma las facturas de proveedores y los gastos sueltos.

import { sumarDias } from "./cierre";
import { CATEGORIAS } from "./factura";

const MES = /^(\d{4})-(0[1-9]|1[0-2])$/;

// El mes pedido en la dirección (?mes=2026-09), o el de hoy si falta o no es válido.
export function mesElegido(texto: string | undefined, hoy: string): string {
  return texto && MES.test(texto) ? texto : hoy.slice(0, 7);
}

// Primer día del mes y primer día del siguiente (para filtrar con >= y <).
export function limitesMes(mes: string): { desde: string; hasta: string } {
  const desde = `${mes}-01`;
  const [anio, numero] = mes.split("-").map(Number);
  const siguiente = numero === 12 ? `${anio + 1}-01` : `${anio}-${String(numero + 1).padStart(2, "0")}`;
  return { desde, hasta: `${siguiente}-01` };
}

export function mesVecino(mes: string, paso: 1 | -1): string {
  const { desde, hasta } = limitesMes(mes);
  return (paso === 1 ? hasta : sumarDias(desde, -1)).slice(0, 7);
}

export function nombreMes(mes: string): string {
  const texto = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${mes}-01T12:00:00Z`),
  );
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export type PorCategoria = { categoria: string; total: number };

// Total por categoría, de mayor a menor, y total general. Se redondea a céntimos al final
// para no arrastrar errores de coma flotante.
export function resumirGastos(gastos: { categoria: string; importe: number }[]): { total: number; porCategoria: PorCategoria[] } {
  const sumas = new Map<string, number>();
  for (const g of gastos) sumas.set(g.categoria, (sumas.get(g.categoria) ?? 0) + Math.round(g.importe * 100));
  const porCategoria = [...sumas.entries()]
    .map(([categoria, centimos]) => ({ categoria, total: centimos / 100 }))
    .sort((a, b) => b.total - a.total || CATEGORIAS.indexOf(a.categoria as never) - CATEGORIAS.indexOf(b.categoria as never));
  const total = [...sumas.values()].reduce((t, c) => t + c, 0) / 100;
  return { total, porCategoria };
}
