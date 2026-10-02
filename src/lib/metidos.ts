// Lo que hay ahora mismo en las cuentas de un documento ya metido desde la Bandeja, dicho con palabras,
// para que la persona sepa qué quitaría «Deshacer» antes de pulsarlo.

import { euros } from "./cierre";

export type DocumentoMetido = { id: string; tipo: string; nombre: string };
export type DiaMetido = { documentoId: string; fecha: string; venta: number };
export type FacturaMetida = { documentoId: string; proveedor: string; importe: number; pagada: boolean };

export type ResumenMetido = {
  id: string;
  etiqueta: string;
  // Lo que hay ahora en Ventas y en Facturas por culpa de este documento, una frase por cosa.
  que: string[];
  // Ya no hay nada suyo: otro documento sustituyó su día o se borró. «Deshacer» solo lo devuelve a la Bandeja.
  sinNada: boolean;
  // Alguna de sus facturas está marcada como pagada: no se puede deshacer hasta marcarla pendiente.
  hayPagadas: boolean;
};

const ETIQUETA: Record<string, string> = { cierre: "Cierre de caja", factura: "Factura o gasto", ingresos: "Hoja de ingresos" };

const diaMesAnio = (fecha: string) => fecha.split("-").reverse().join("/");
const suma = (importes: number[]) => Math.round(importes.reduce((t, i) => t + i, 0) * 100) / 100;
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export function resumenMetido(documento: DocumentoMetido, dias: DiaMetido[], facturas: FacturaMetida[]): ResumenMetido {
  const misDias = dias.filter((d) => d.documentoId === documento.id).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const misFacturas = facturas.filter((f) => f.documentoId === documento.id);
  const que: string[] = [];

  if (misDias.length === 1) {
    que.push(`Ventas del ${diaMesAnio(misDias[0].fecha)}: ${euros(misDias[0].venta)}`);
  } else if (misDias.length > 1) {
    que.push(
      `${misDias.length} días de ventas, del ${diaMesAnio(misDias[0].fecha)} al ${diaMesAnio(misDias[misDias.length - 1].fecha)}: ${euros(suma(misDias.map((d) => d.venta)))} en total`,
    );
  }
  if (misFacturas.length > 0) {
    const proveedores = [...new Set(misFacturas.map((f) => f.proveedor))];
    const quienes = proveedores.slice(0, 2).join(", ") + (proveedores.length > 2 ? " y otros" : "");
    que.push(`${plural(misFacturas.length, "factura", "facturas")}: ${euros(suma(misFacturas.map((f) => f.importe)))} (${quienes})`);
  }

  return {
    id: documento.id,
    etiqueta: ETIQUETA[documento.tipo] ?? documento.tipo,
    que,
    sinNada: que.length === 0,
    hayPagadas: misFacturas.some((f) => f.pagada),
  };
}

// Lo que se le dice a la persona cuando «Deshacer» ha funcionado.
export function mensajeDeshecho(quitado: { cierres?: number; facturas?: number } | null): string {
  const partes: string[] = [];
  if (quitado?.cierres) partes.push(`${plural(quitado.cierres, "día", "días")} de Ventas`);
  if (quitado?.facturas) partes.push(plural(quitado.facturas, "factura", "facturas"));
  const que = partes.length > 0 ? `He quitado ${partes.join(" y ")} de tus cuentas.` : "No había nada suyo en tus cuentas.";
  return `Hecho. ${que} El documento está otra vez arriba, en «Por revisar».`;
}
