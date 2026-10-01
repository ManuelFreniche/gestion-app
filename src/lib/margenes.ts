// Márgenes sin apuntar nada a mano: el resultado de cada mes sale de las ventas y las facturas que
// ya se aceptaron en la Bandeja, y los cambios de precio salen de las líneas de esas facturas.

import { mesVecino } from "./gastos";

// Los n meses que acaban en `mes`, del más antiguo al más reciente.
export function ultimosMeses(mes: string, n: number): string[] {
  const meses = [mes];
  while (meses.length < n) meses.unshift(mesVecino(meses[0], -1));
  return meses;
}

export type ResultadoMes = { mes: string; vendido: number; gastado: number; resultado: number };

const aCentimos = (n: number) => Math.round(n * 100);

export function resultadoPorMes(
  meses: string[],
  cierres: { fecha: string; venta: number }[],
  facturas: { fecha: string; importe: number }[],
): ResultadoMes[] {
  return meses.map((mes) => {
    const vendido = cierres.filter((c) => c.fecha.startsWith(mes)).reduce((t, c) => t + aCentimos(c.venta), 0);
    const gastado = facturas.filter((f) => f.fecha.startsWith(mes)).reduce((t, f) => t + aCentimos(f.importe), 0);
    return { mes, vendido: vendido / 100, gastado: gastado / 100, resultado: (vendido - gastado) / 100 };
  });
}

export type LineaCompra = {
  descripcion: string;
  unidad: string | null;
  cantidad: number | null;
  precio_unitario: number | null;
  importe: number;
  fecha: string;
  proveedor: string;
};

export type CambioPrecio = {
  descripcion: string;
  unidad: string | null;
  proveedor: string;
  fecha: string;
  anterior: number;
  actual: number;
  cambio: number; // en porcentaje, con un decimal
};

const clave = (l: LineaCompra) =>
  `${l.descripcion.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim()}|${(l.unidad ?? "").toLowerCase().trim()}`;

// Precio por unidad: el de la línea o, si falta, el importe entre la cantidad.
function precioDe(l: LineaCompra): number | null {
  if (l.precio_unitario !== null && l.precio_unitario > 0) return l.precio_unitario;
  if (l.cantidad !== null && l.cantidad > 0 && l.importe > 0) return l.importe / l.cantidad;
  return null;
}

// Compara la última compra de cada producto con la anterior (de otro día) y devuelve los que han
// cambiado de precio, de mayor a menor cambio. Cambios menores del 1 % se ignoran como ruido.
export function cambiosDePrecio(lineas: LineaCompra[]): CambioPrecio[] {
  const porProducto = new Map<string, { linea: LineaCompra; precio: number }[]>();
  for (const linea of lineas) {
    const precio = precioDe(linea);
    if (precio === null) continue;
    const k = clave(linea);
    porProducto.set(k, [...(porProducto.get(k) ?? []), { linea, precio }]);
  }
  const cambios: CambioPrecio[] = [];
  for (const compras of porProducto.values()) {
    const ordenadas = [...compras].sort((a, b) => b.linea.fecha.localeCompare(a.linea.fecha));
    const ultima = ordenadas[0];
    const previa = ordenadas.find((c) => c.linea.fecha < ultima.linea.fecha);
    if (!previa) continue;
    const cambio = Math.round(((ultima.precio - previa.precio) / previa.precio) * 1000) / 10;
    if (Math.abs(cambio) < 1) continue;
    cambios.push({
      descripcion: ultima.linea.descripcion,
      unidad: ultima.linea.unidad,
      proveedor: ultima.linea.proveedor,
      fecha: ultima.linea.fecha,
      anterior: Math.round(previa.precio * 10000) / 10000,
      actual: Math.round(ultima.precio * 10000) / 10000,
      cambio,
    });
  }
  return cambios.sort((a, b) => Math.abs(b.cambio) - Math.abs(a.cambio));
}
