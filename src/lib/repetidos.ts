// Lo repetido se descarta solo: la misma factura (mismo proveedor, día e importe) o el mismo cierre de caja
// (mismo día y misma venta) que ya está en las cuentas o esperando en la Bandeja. Aquí solo está la regla;
// quien la usa consulta la base de datos y descarta el documento (que se puede recuperar en «Descartados»).

import { proveedorNormalizado, type FacturaDatos } from "./factura";

const centimos = (n: number) => Math.round(n * 100);

// Identifica una factura por lo que se ve en ella, sin depender de que se haya leído el número.
export function claveContenido(f: { proveedor?: string | null; fecha?: string | null; importe?: number | null }): string | null {
  const proveedor = proveedorNormalizado(f.proveedor);
  if (!proveedor || !f.fecha || typeof f.importe !== "number" || !f.importe) return null;
  return `${proveedor}|${f.fecha}|${centimos(f.importe)}`;
}

// Un documento de facturas es repetido solo si TODAS sus facturas ya se conocen. Si alguna es nueva, o no se ha
// podido leer completa, se queda en la Bandeja para que una persona decida.
export function facturasRepetidas(nuevas: FacturaDatos[], conocidas: Set<string>): boolean {
  if (nuevas.length === 0) return false;
  const vistas = new Set<string>();
  return nuevas.every((f) => {
    const clave = claveContenido(f);
    if (clave === null) return false;
    // Dos facturas iguales dentro del mismo documento: la primera cuenta como nueva, la segunda como repetida.
    if (conocidas.has(clave) || vistas.has(clave)) return true;
    vistas.add(clave);
    return false;
  });
}

// Un cierre es repetido si ya hay otro del mismo día con la misma venta (al céntimo). Con otra venta no lo es:
// eso es un cambio y lo decide una persona.
export function cierreRepetido(nuevo: { fecha?: unknown; venta?: unknown }, conocidos: { fecha: string; venta: number }[]): boolean {
  if (typeof nuevo.fecha !== "string" || typeof nuevo.venta !== "number") return false;
  const { fecha, venta } = nuevo;
  return conocidos.some((c) => c.fecha === fecha && centimos(c.venta) === centimos(venta));
}

export type PendienteBandeja = { id: string; tipo: string; datos: unknown };

// Entre los documentos que ya esperan en la Bandeja (del más antiguo al más nuevo), cuáles sobran: los que repiten
// algo ya registrado en las cuentas o un documento pendiente más antiguo. Siempre se conserva el primero.
// Un documento con una parte ya decidida (`partes`) no se toca.
export function pendientesRepetidos(
  pendientes: PendienteBandeja[],
  registradas: { facturas: Set<string>; cierres: { fecha: string; venta: number }[] },
): string[] {
  const facturas = new Set(registradas.facturas);
  const cierres = [...registradas.cierres];
  const sobran: string[] = [];

  for (const doc of pendientes) {
    const datos = (doc.datos ?? {}) as { facturas?: FacturaDatos[]; fecha?: unknown; venta?: unknown; partes?: unknown };
    if (datos.partes && Object.keys(datos.partes as object).length > 0) continue;

    if (doc.tipo === "factura") {
      const lista = Array.isArray(datos.facturas) ? datos.facturas : [];
      if (facturasRepetidas(lista, facturas)) {
        sobran.push(doc.id);
        continue;
      }
      for (const f of lista) {
        const clave = claveContenido(f);
        if (clave) facturas.add(clave);
      }
    } else if (doc.tipo === "cierre") {
      if (cierreRepetido(datos, cierres)) {
        sobran.push(doc.id);
        continue;
      }
      if (typeof datos.fecha === "string" && typeof datos.venta === "number") cierres.push({ fecha: datos.fecha, venta: datos.venta });
    }
  }
  return sobran;
}
