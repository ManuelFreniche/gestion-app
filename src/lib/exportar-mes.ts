// Libro de Excel con las cuentas de un mes, para pasárselo a la gestoría: facturas y gastos, resumen
// por categoría e ingresos por día. Los datos salen de lo ya aceptado en la Bandeja.

import ExcelJS from "exceljs";
import { nombreMes, resumirGastos } from "./gastos";

export type FilaFactura = {
  fecha: string;
  proveedor: string;
  numero: string | null;
  categoria: string;
  importe: number;
  estado_pago: string;
};
export type FilaIngreso = { fecha: string; venta: number; efectivo: number | null; banco: number | null };

const centimos = (n: number) => Math.round(n * 100);

// Ordena y totaliza. Los importes se suman en céntimos para no arrastrar decimales.
export function prepararExportacion(facturas: FilaFactura[], ingresos: FilaIngreso[] | null) {
  const gastos = resumirGastos(facturas);
  const totalIngresos = ingresos ? ingresos.reduce((t, i) => t + centimos(i.venta), 0) / 100 : null;
  return {
    facturas: [...facturas].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.proveedor.localeCompare(b.proveedor, "es")),
    ingresos: ingresos ? [...ingresos].sort((a, b) => a.fecha.localeCompare(b.fecha)) : null,
    porCategoria: gastos.porCategoria,
    totalGastos: gastos.total,
    totalIngresos,
    resultado: totalIngresos === null ? null : Math.round(centimos(totalIngresos) - centimos(gastos.total)) / 100,
  };
}

const FORMATO_EUROS = '#,##0.00 "€"';
const dia = (fecha: string) => new Date(`${fecha}T12:00:00Z`);

function hoja(libro: ExcelJS.Workbook, nombre: string, columnas: { cabecera: string; ancho: number; euros?: boolean; fecha?: boolean }[]) {
  const h = libro.addWorksheet(nombre, { views: [{ state: "frozen", ySplit: 1 }] });
  h.columns = columnas.map((c, i) => ({
    header: c.cabecera,
    key: String(i),
    width: c.ancho,
    style: { numFmt: c.euros ? FORMATO_EUROS : c.fecha ? "dd/mm/yyyy" : undefined },
  }));
  h.getRow(1).font = { bold: true };
  return h;
}

function totales(h: ExcelJS.Worksheet, etiqueta: string, columnaEtiqueta: number, columnaSuma: number, suma: number) {
  const f = h.addRow([]);
  f.getCell(columnaEtiqueta).value = etiqueta;
  f.getCell(columnaSuma).value = suma;
  f.getCell(columnaSuma).numFmt = FORMATO_EUROS;
  f.font = { bold: true };
}

export async function crearLibro(mes: string, negocio: string, datos: ReturnType<typeof prepararExportacion>): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  libro.creator = negocio;
  libro.created = new Date();

  const resumen = hoja(libro, "Resumen", [
    { cabecera: nombreMes(mes), ancho: 34 },
    { cabecera: "Importe", ancho: 16, euros: true },
  ]);
  for (const c of datos.porCategoria) resumen.addRow([c.categoria, c.total]);
  resumen.addRow([]);
  resumen.addRow(["Total gastado", datos.totalGastos]).font = { bold: true };
  if (datos.totalIngresos !== null && datos.resultado !== null) {
    resumen.addRow(["Total ingresos (ventas)", datos.totalIngresos]).font = { bold: true };
    resumen.addRow(["Ingresos menos gastos", datos.resultado]).font = { bold: true };
  }

  const gastos = hoja(libro, "Facturas y gastos", [
    { cabecera: "Fecha", ancho: 12, fecha: true },
    { cabecera: "Proveedor", ancho: 32 },
    { cabecera: "Nº de factura", ancho: 18 },
    { cabecera: "Categoría", ancho: 16 },
    { cabecera: "Importe (con IVA)", ancho: 18, euros: true },
    { cabecera: "Pago", ancho: 12 },
  ]);
  for (const f of datos.facturas) gastos.addRow([dia(f.fecha), f.proveedor, f.numero ?? "", f.categoria, f.importe, f.estado_pago]);
  if (datos.facturas.length > 0) totales(gastos, "Total", 4, 5, datos.totalGastos);

  if (datos.ingresos) {
    const ingresos = hoja(libro, "Ingresos", [
      { cabecera: "Fecha", ancho: 12, fecha: true },
      { cabecera: "Venta", ancho: 16, euros: true },
      { cabecera: "Efectivo", ancho: 16, euros: true },
      { cabecera: "Tarjeta / banco", ancho: 16, euros: true },
    ]);
    for (const i of datos.ingresos) ingresos.addRow([dia(i.fecha), i.venta, i.efectivo ?? "", i.banco ?? ""]);
    if (datos.ingresos.length > 0) totales(ingresos, "Total", 1, 2, datos.totalIngresos ?? 0);
  }

  return Buffer.from(await libro.xlsx.writeBuffer());
}
