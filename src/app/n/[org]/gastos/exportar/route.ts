import { notFound } from "next/navigation";
import { hoyEn } from "@/lib/cierre";
import { crearLibro, prepararExportacion } from "@/lib/exportar-mes";
import { limitesMes, mesElegido } from "@/lib/gastos";
import { exigirPermiso } from "@/lib/negocio";
import { crearClienteServidor } from "@/lib/supabase/server";

// Descarga el mes en Excel. Lo que se incluye lo decide la base de datos con RLS; aquí solo se
// evita pedir lo que el usuario no puede ver (la gestoría no ve ventas).
export async function GET(peticion: Request, { params }: RouteContext<"/n/[org]/gastos/exportar">) {
  const { org } = await params;
  const negocio = await exigirPermiso(org, "exportar.usar");
  if (!negocio.permisos.has("facturas.ver")) notFound();

  const supabase = await crearClienteServidor();
  const { data: ajustes } = await supabase.from("ajustes_organizacion").select("zona_horaria").eq("organizacion_id", org).maybeSingle();
  const hoy = hoyEn(ajustes?.zona_horaria ?? "Europe/Madrid");
  const mes = mesElegido(new URL(peticion.url).searchParams.get("mes") ?? undefined, hoy);
  const { desde, hasta } = limitesMes(mes);

  const [facturas, cierres] = await Promise.all([
    supabase
      .from("facturas_recibidas")
      .select("fecha, proveedor, numero, categoria, importe, estado_pago")
      .eq("organizacion_id", org)
      .gte("fecha", desde)
      .lt("fecha", hasta),
    negocio.permisos.has("ventas.ver")
      ? supabase.from("cierres_diarios").select("fecha, venta, efectivo, banco").eq("organizacion_id", org).gte("fecha", desde).lt("fecha", hasta)
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (facturas.error || cierres.error) return new Response("No se pudo preparar el Excel.", { status: 500 });

  const datos = prepararExportacion(
    (facturas.data ?? []).map((f) => ({ ...f, importe: Number(f.importe) })),
    cierres.data ? cierres.data.map((c) => ({ ...c, venta: Number(c.venta), efectivo: c.efectivo === null ? null : Number(c.efectivo), banco: c.banco === null ? null : Number(c.banco) })) : null,
  );
  const archivo = await crearLibro(mes, negocio.nombre, datos);
  const nombre = `${negocio.nombre}-${mes}.xlsx`.normalize("NFD").replace(/[^\w.-]+/g, "-").replace(/-+/g, "-");
  return new Response(new Uint8Array(archivo), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${nombre}"`,
      "cache-control": "private, no-store",
    },
  });
}
