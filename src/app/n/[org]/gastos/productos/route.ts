import { notFound } from "next/navigation";
import { compararProductos, crearLibroProductos, type LineaProducto } from "@/lib/precios-productos";
import { exigirPermiso } from "@/lib/negocio";
import { crearClienteServidor } from "@/lib/supabase/server";

const PAGINA = 1000;
const MAX_PAGINAS = 20;

// Descarga en Excel los productos de las facturas con el último precio de cada proveedor; el más barato de
// cada producto sale en verde. Lo que se ve lo decide la base de datos con RLS.
export async function GET(_: Request, { params }: RouteContext<"/n/[org]/gastos/productos">) {
  const { org } = await params;
  const negocio = await exigirPermiso(org, "exportar.usar");
  if (!negocio.permisos.has("facturas.ver")) notFound();

  const supabase = await crearClienteServidor();
  const lineas: LineaProducto[] = [];
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const { data, error } = await supabase
      .from("facturas_lineas")
      .select("id, descripcion, unidad, cantidad, precio_unitario, importe, facturas_recibidas!inner(proveedor, fecha)")
      .eq("organizacion_id", org)
      .order("id")
      .range(pagina * PAGINA, (pagina + 1) * PAGINA - 1);
    if (error) return new Response("No se pudo preparar el Excel.", { status: 500 });
    for (const l of data ?? []) {
      lineas.push({
        descripcion: l.descripcion,
        unidad: l.unidad,
        cantidad: l.cantidad === null ? null : Number(l.cantidad),
        precio_unitario: l.precio_unitario === null ? null : Number(l.precio_unitario),
        importe: Number(l.importe),
        proveedor: l.facturas_recibidas.proveedor,
        fecha: l.facturas_recibidas.fecha,
      });
    }
    if ((data ?? []).length < PAGINA) break;
  }

  const archivo = await crearLibroProductos(negocio.nombre, compararProductos(lineas));
  const nombre = `${negocio.nombre}-productos.xlsx`.normalize("NFD").replace(/\p{M}/gu, "").replace(/[^\w.-]+/g, "-").replace(/-+/g, "-");
  return new Response(new Uint8Array(archivo), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${nombre}"`,
      "cache-control": "private, no-store",
    },
  });
}
