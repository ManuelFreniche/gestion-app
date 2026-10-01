"use server";

import { revalidatePath } from "next/cache";
import { esFecha, hoyEn, leerImporte, leerImporteConSigno } from "@/lib/cierre";
import { CATEGORIAS, type FacturaDatos } from "@/lib/factura";
import { crearClienteServidor } from "@/lib/supabase/server";

export type EstadoBandeja = { error?: string; ok?: boolean };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Mete el ticket revisado como cierre del día.
export async function aprobarCierre(_: EstadoBandeja, formData: FormData): Promise<EstadoBandeja> {
  const org = String(formData.get("org") ?? "");
  const documento = String(formData.get("documento") ?? "");
  const local = String(formData.get("local") ?? "");
  const fecha = String(formData.get("fecha") ?? "");
  const venta = leerImporte(String(formData.get("venta") ?? ""));
  const efectivoTexto = String(formData.get("efectivo") ?? "").trim();
  const bancoTexto = String(formData.get("banco") ?? "").trim();
  const efectivo = efectivoTexto ? leerImporte(efectivoTexto) : null;
  const banco = bancoTexto ? leerImporte(bancoTexto) : null;

  if (![org, documento, local].every((id) => UUID.test(id)) || !esFecha(fecha)) {
    return { error: "Algo ha ido mal. Recarga la página e inténtalo de nuevo." };
  }
  if (venta === null) return { error: "Escribe la venta del día, por ejemplo 136,70." };
  if ((efectivoTexto && efectivo === null) || (bancoTexto && banco === null)) {
    return { error: "Revisa efectivo y tarjeta: tienen que ser importes, por ejemplo 10,80." };
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("aprobar_cierre", {
    p_documento: documento,
    p_local: local,
    p_fecha: fecha,
    p_venta: venta,
    ...(efectivo !== null && { p_efectivo: efectivo }),
    ...(banco !== null && { p_banco: banco }),
  });

  if (error) {
    return {
      error:
        error.code === "P0002"
          ? "Este ticket ya se revisó. Recarga la página."
          : error.code === "42501"
            ? "No tienes permiso para meter cierres."
            : "No se pudo meter el cierre. Inténtalo de nuevo.",
    };
  }

  revalidatePath(`/n/${org}/bandeja`);
  revalidatePath(`/n/${org}/ventas`);
  return { ok: true };
}

// Mete las facturas revisadas de un documento (las líneas de producto salen de lo que se leyó).
export async function aprobarFacturas(_: EstadoBandeja, formData: FormData): Promise<EstadoBandeja> {
  const org = String(formData.get("org") ?? "");
  const documento = String(formData.get("documento") ?? "");
  const cantidad = Number(formData.get("cantidad"));
  if (![org, documento].every((id) => UUID.test(id)) || !Number.isInteger(cantidad) || cantidad < 1 || cantidad > 50) {
    return { error: "Algo ha ido mal. Recarga la página e inténtalo de nuevo." };
  }

  const supabase = await crearClienteServidor();
  const { data: fila } = await supabase
    .from("documentos_entrantes")
    .select("datos")
    .eq("id", documento)
    .eq("organizacion_id", org)
    .eq("estado", "pendiente")
    .maybeSingle();
  if (!fila) return { error: "Esta factura ya se revisó. Recarga la página." };
  const leidas = ((fila.datos as { facturas?: FacturaDatos[] } | null)?.facturas ?? []) as FacturaDatos[];

  const facturas: Record<string, unknown>[] = [];
  for (let i = 0; i < cantidad; i++) {
    if (formData.get(`incluir_${i}`) !== "on") continue;
    const proveedor = String(formData.get(`proveedor_${i}`) ?? "").trim();
    const fecha = String(formData.get(`fecha_${i}`) ?? "");
    const importe = leerImporteConSigno(String(formData.get(`importe_${i}`) ?? ""));
    const categoria = String(formData.get(`categoria_${i}`) ?? "");
    const numero = String(formData.get(`numero_${i}`) ?? "").trim();
    const etiqueta = cantidad > 1 ? ` (factura ${i + 1})` : "";
    if (!proveedor || proveedor.length > 120) return { error: `Escribe el proveedor${etiqueta}.` };
    if (!esFecha(fecha)) return { error: `Escribe la fecha${etiqueta}.` };
    if (importe === null || importe === 0) return { error: `Escribe el importe total${etiqueta}, por ejemplo 121,00 (en un abono, con un - delante).` };
    if (!(CATEGORIAS as readonly string[]).includes(categoria)) return { error: `Elige una categoría${etiqueta}.` };
    if (numero.length > 60) return { error: `El número de factura es demasiado largo${etiqueta}.` };
    facturas.push({ proveedor, fecha, importe, categoria, numero, lineas: leidas[i]?.lineas ?? [] });
  }
  if (facturas.length === 0) return { error: "Marca al menos una factura para meterla." };

  const { error } = await supabase.rpc("registrar_facturas", { p_documento: documento, p_facturas: facturas as never });
  if (error) {
    return {
      error:
        error.code === "P0002"
          ? "Esta factura ya se revisó. Recarga la página."
          : error.code === "42501"
            ? "No tienes permiso para meter facturas."
            : "No se pudo meter la factura. Inténtalo de nuevo.",
    };
  }

  // La tarjeta se queda mostrando "Hecho" con un enlace; la bandeja se actualiza al volver a entrar.
  revalidatePath(`/n/${org}/facturas`);
  revalidatePath(`/n/${org}/gastos`);
  return { ok: true };
}

// Mete en Ventas los días de una hoja de ingresos (un cierre por día; si el día ya tenía cierre, se
// actualiza con la hoja). Las cifras salen de lo leído y de lo que la persona haya corregido.
export async function aprobarIngresos(_: EstadoBandeja, formData: FormData): Promise<EstadoBandeja> {
  const org = String(formData.get("org") ?? "");
  const documento = String(formData.get("documento") ?? "");
  const local = String(formData.get("local") ?? "");
  const cantidad = Number(formData.get("cantidad"));
  if (![org, documento, local].every((id) => UUID.test(id)) || !Number.isInteger(cantidad) || cantidad < 1 || cantidad > 400) {
    return { error: "Algo ha ido mal. Recarga la página e inténtalo de nuevo." };
  }

  const supabase = await crearClienteServidor();
  const { data: ajustes } = await supabase.from("ajustes_organizacion").select("zona_horaria").eq("organizacion_id", org).maybeSingle();
  const hoy = hoyEn(ajustes?.zona_horaria ?? "Europe/Madrid");

  const dias: Record<string, unknown>[] = [];
  const vistos = new Set<string>();
  for (let i = 0; i < cantidad; i++) {
    if (formData.get(`incluir_${i}`) !== "on") continue;
    const fecha = String(formData.get(`fecha_${i}`) ?? "");
    const venta = leerImporte(String(formData.get(`venta_${i}`) ?? ""));
    if (!esFecha(fecha)) return { error: `Hay un día sin fecha válida (fila ${i + 1}).` };
    if (fecha > hoy) return { error: `El ${fecha} es un día futuro: desmárcalo o corrígelo.` };
    if (vistos.has(fecha)) return { error: `El día ${fecha} sale dos veces. Desmarca una de las filas.` };
    vistos.add(fecha);
    if (venta === null) return { error: `Escribe la venta del ${fecha}, por ejemplo 136,70.` };
    const efectivoTexto = String(formData.get(`efectivo_${i}`) ?? "");
    const bancoTexto = String(formData.get(`banco_${i}`) ?? "");
    const efectivo = efectivoTexto ? leerImporte(efectivoTexto) : null;
    const banco = bancoTexto ? leerImporte(bancoTexto) : null;
    dias.push({ fecha, venta, efectivo, banco });
  }
  if (dias.length === 0) return { error: "Marca al menos un día para meterlo." };

  const { error } = await supabase.rpc("registrar_ingresos", { p_documento: documento, p_local: local, p_dias: dias as never });
  if (error) {
    return {
      error:
        error.code === "P0002"
          ? "Esta hoja ya se revisó. Recarga la página."
          : error.code === "42501"
            ? "No tienes permiso para meter ventas."
            : "No se pudo meter la hoja. Inténtalo de nuevo.",
    };
  }
  revalidatePath(`/n/${org}/ventas`);
  revalidatePath(`/n/${org}/gastos`);
  return { ok: true };
}

// Deja fuera una parte de un documento (sus facturas o sus ingresos). El documento sale de la
// bandeja cuando se han decidido todas sus partes.
export async function descartarParte(_: EstadoBandeja, formData: FormData): Promise<EstadoBandeja> {
  const org = String(formData.get("org") ?? "");
  const documento = String(formData.get("documento") ?? "");
  const parte = String(formData.get("parte") ?? "");
  if (!UUID.test(org) || !UUID.test(documento) || (parte !== "facturas" && parte !== "ingresos")) {
    return { error: "Algo ha ido mal. Recarga la página." };
  }
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("cerrar_parte", { p_documento: documento, p_parte: parte, p_resultado: "descartada" });
  if (error) {
    return { error: error.code === "P0002" ? "Ya se revisó. Recarga la página." : "No se pudo descartar. Inténtalo de nuevo." };
  }
  return { ok: true };
}

// Cambia un documento pendiente entre ticket de cierre y factura (cuando no se lee solo).
export async function cambiarTipoDocumento(_: EstadoBandeja, formData: FormData): Promise<EstadoBandeja> {
  const org = String(formData.get("org") ?? "");
  const documento = String(formData.get("documento") ?? "");
  const tipo = String(formData.get("tipo") ?? "");
  if (!UUID.test(org) || !UUID.test(documento) || (tipo !== "cierre" && tipo !== "factura")) {
    return { error: "Algo ha ido mal. Recarga la página." };
  }
  const supabase = await crearClienteServidor();
  const { error } = await supabase
    .from("documentos_entrantes")
    .update({ tipo })
    .eq("id", documento)
    .eq("organizacion_id", org)
    .eq("estado", "pendiente");
  if (error) return { error: "No se pudo cambiar. Inténtalo de nuevo." };
  revalidatePath(`/n/${org}/bandeja`);
  return { ok: true };
}

// Deja el documento fuera: no entra en las cuentas y sale de la bandeja.
export async function descartarDocumento(_: EstadoBandeja, formData: FormData): Promise<EstadoBandeja> {
  const org = String(formData.get("org") ?? "");
  const documento = String(formData.get("documento") ?? "");
  if (!UUID.test(org) || !UUID.test(documento)) return { error: "Algo ha ido mal. Recarga la página." };

  const supabase = await crearClienteServidor();
  const { error } = await supabase
    .from("documentos_entrantes")
    .update({ estado: "descartado", revisado_en: new Date().toISOString() })
    .eq("id", documento)
    .eq("organizacion_id", org)
    .eq("estado", "pendiente");

  if (error) return { error: "No se pudo descartar. Inténtalo de nuevo." };

  // Las facturas muestran "Descartada" en su propia tarjeta; el resto desaparece de la lista.
  if (formData.get("mantener") !== "1") revalidatePath(`/n/${org}/bandeja`);
  return { ok: true };
}
