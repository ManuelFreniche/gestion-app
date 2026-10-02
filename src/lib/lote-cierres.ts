import { esFecha, leerImporte } from "./cierre";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const MAX_CIERRES_LOTE = 60;

export type FilaCierre = {
  documento: string;
  local: string;
  fecha: string;
  venta: number;
  efectivo: number | null;
  banco: number | null;
};

// Lee del formulario de la Bandeja los cierres marcados para meter en Ventas y los comprueba todos
// antes de guardar ninguno: fecha real y no futura, venta escrita, importes válidos y un solo cierre
// por local y día (el segundo pisaría al primero).
export function leerLoteCierres(formData: FormData, hoy: string): { filas: FilaCierre[] } | { error: string } {
  const cantidad = Number(formData.get("cantidad"));
  if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > MAX_CIERRES_LOTE) {
    return { error: "Algo ha ido mal. Recarga la página e inténtalo de nuevo." };
  }
  const filas: FilaCierre[] = [];
  const vistos = new Set<string>();
  for (let i = 0; i < cantidad; i++) {
    if (formData.get(`incluir_${i}`) !== "on") continue;
    const documento = String(formData.get(`documento_${i}`) ?? "");
    const local = String(formData.get(`local_${i}`) ?? formData.get("local") ?? "");
    const fecha = String(formData.get(`fecha_${i}`) ?? "");
    const ventaTexto = String(formData.get(`venta_${i}`) ?? "").trim();
    const efectivoTexto = String(formData.get(`efectivo_${i}`) ?? "").trim();
    const bancoTexto = String(formData.get(`banco_${i}`) ?? "").trim();
    const nombre = esFecha(fecha) ? fecha.split("-").reverse().join("/") : `fila ${i + 1}`;

    if (!UUID.test(documento) || !UUID.test(local)) return { error: "Algo ha ido mal. Recarga la página e inténtalo de nuevo." };
    if (!esFecha(fecha)) return { error: `Elige el día del cierre (${nombre}).` };
    if (fecha > hoy) return { error: `El ${nombre} es un día futuro: corrige la fecha o desmárcalo.` };
    const venta = ventaTexto ? leerImporte(ventaTexto) : null;
    if (venta === null) return { error: `Escribe la venta del ${nombre}, por ejemplo 136,70.` };
    const efectivo = efectivoTexto ? leerImporte(efectivoTexto) : null;
    const banco = bancoTexto ? leerImporte(bancoTexto) : null;
    if ((efectivoTexto && efectivo === null) || (bancoTexto && banco === null)) {
      return { error: `Revisa efectivo y tarjeta del ${nombre}: tienen que ser importes, por ejemplo 10,80.` };
    }
    const clave = `${local}|${fecha}`;
    if (vistos.has(clave)) return { error: `El día ${nombre} sale dos veces. Desmarca uno de los dos cierres.` };
    vistos.add(clave);
    filas.push({ documento, local, fecha, venta, efectivo, banco });
  }
  if (filas.length === 0) return { error: "Marca al menos un cierre para meterlo." };
  return { filas };
}
