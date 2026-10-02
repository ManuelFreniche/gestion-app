// Comparación de precios por producto entre proveedores, para el Excel de Gastos. Sale de las líneas de las
// facturas ya aceptadas en la Bandeja (precios sin IVA). Solo se compara el mismo producto con la misma unidad:
// 1 kg y 1 unidad no se pueden poner uno al lado del otro.

import ExcelJS from "exceljs";

export type LineaProducto = {
  descripcion: string;
  unidad: string | null;
  cantidad: number | null;
  precio_unitario: number | null;
  importe: number;
  proveedor: string;
  fecha: string;
};

export type FilaProducto = {
  producto: string;
  unidad: string;
  proveedor: string;
  precio: number;
  fecha: string;
  // Cuántos proveedores tienen este producto (con esta unidad).
  proveedores: number;
  // Es el más barato y hay con qué compararlo.
  masBarato: boolean;
  // Cuánto más caro que el más barato, en %, con un decimal. null si no hay comparación o es el más barato.
  sobreElMasBarato: number | null;
};

const normalizar = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

// Precio por unidad: el de la línea o, si falta, el importe entre la cantidad.
function precioDe(l: LineaProducto): number | null {
  if (l.precio_unitario !== null && l.precio_unitario > 0) return l.precio_unitario;
  if (l.cantidad !== null && l.cantidad > 0 && l.importe > 0) return Math.round((l.importe / l.cantidad) * 10_000) / 10_000;
  return null;
}

// Una fila por producto y proveedor, con el último precio de cada proveedor. Primero los productos que se
// pueden comparar (dos o más proveedores), luego el resto; dentro de cada producto, del más barato al más caro.
export function compararProductos(lineas: LineaProducto[]): FilaProducto[] {
  type Compra = { precio: number; fecha: string; proveedor: string };
  const grupos = new Map<string, { producto: string; unidad: string; compras: Map<string, Compra> }>();

  for (const l of lineas) {
    const precio = precioDe(l);
    if (precio === null) continue;
    const unidad = (l.unidad ?? "").trim();
    const clave = `${normalizar(l.descripcion)}|${normalizar(unidad)}`;
    const grupo = grupos.get(clave) ?? { producto: l.descripcion.trim(), unidad, compras: new Map<string, Compra>() };
    const quien = normalizar(l.proveedor);
    const actual = grupo.compras.get(quien);
    if (!actual || l.fecha > actual.fecha) grupo.compras.set(quien, { precio, fecha: l.fecha, proveedor: l.proveedor });
    grupos.set(clave, grupo);
  }

  const filas: FilaProducto[] = [];
  for (const g of grupos.values()) {
    const compras = [...g.compras.values()].sort((a, b) => a.precio - b.precio || a.proveedor.localeCompare(b.proveedor, "es"));
    const minimo = compras[0].precio;
    const comparable = compras.length > 1;
    for (const c of compras) {
      const esMinimo = c.precio === minimo;
      filas.push({
        producto: g.producto,
        unidad: g.unidad,
        proveedor: c.proveedor,
        precio: c.precio,
        fecha: c.fecha,
        proveedores: compras.length,
        masBarato: comparable && esMinimo,
        sobreElMasBarato: comparable && !esMinimo ? Math.round(((c.precio - minimo) / minimo) * 1000) / 10 : null,
      });
    }
  }
  // Array.sort es estable: dentro de cada producto se conserva el orden de más barato a más caro.
  return filas.sort(
    (a, b) =>
      Number(b.proveedores > 1) - Number(a.proveedores > 1) ||
      a.producto.localeCompare(b.producto, "es") ||
      a.unidad.localeCompare(b.unidad, "es"),
  );
}

const VERDE = "FFC6EFCE";
const dia = (fecha: string) => new Date(`${fecha}T12:00:00Z`);

export async function crearLibroProductos(negocio: string, filas: FilaProducto[]): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  libro.creator = negocio;
  libro.created = new Date();

  const h = libro.addWorksheet("Productos y precios", { views: [{ state: "frozen", ySplit: 1 }] });
  h.columns = [
    { header: "Producto", key: "producto", width: 38 },
    { header: "Unidad", key: "unidad", width: 10 },
    { header: "Proveedor", key: "proveedor", width: 30 },
    { header: "Último precio (sin IVA)", key: "precio", width: 22, style: { numFmt: '#,##0.00## "€"' } },
    { header: "Fecha de la compra", key: "fecha", width: 18, style: { numFmt: "dd/mm/yyyy" } },
    { header: "Comparación", key: "comparacion", width: 30 },
  ];
  h.getRow(1).font = { bold: true };

  for (const f of filas) {
    const comparacion = f.masBarato
      ? "Más barato"
      : f.sobreElMasBarato !== null
        ? `${f.sobreElMasBarato.toLocaleString("es-ES", { maximumFractionDigits: 1 })} % más caro que el más barato`
        : "Solo un proveedor";
    const fila = h.addRow({ producto: f.producto, unidad: f.unidad, proveedor: f.proveedor, precio: f.precio, fecha: dia(f.fecha), comparacion });
    if (f.masBarato) {
      fila.eachCell((celda) => {
        celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE } };
      });
      fila.font = { bold: true };
    }
  }

  h.addRow([]);
  h.addRow(["En verde: el proveedor más barato de ese producto. Solo se compara si hay dos o más proveedores con la misma unidad."]).font = {
    italic: true,
  };

  return Buffer.from(await libro.xlsx.writeBuffer());
}
