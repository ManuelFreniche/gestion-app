import { notFound } from "next/navigation";
import { Tarjeta } from "@/components/ui";
import { euros, fechaLarga } from "@/lib/cierre";
import { quitarTildes } from "@/lib/factura";
import { exigirPermiso } from "@/lib/negocio";
import { crearClienteServidor } from "@/lib/supabase/server";
import { marcarPago } from "./acciones";
import { BotonBorrar } from "./boton-borrar";

// Facturas recibidas de proveedores, las que se han metido desde la bandeja, y el último precio
// de cada producto por proveedor para ir comparando.
export default async function PaginaFacturas({ params }: PageProps<"/n/[org]/facturas">) {
  const { org } = await params;
  const negocio = await exigirPermiso(org, "facturas.ver");
  if (!negocio.modulosActivos.includes("facturas")) notFound();

  const puedeEditar = negocio.permisos.has("facturas.editar");
  const supabase = await crearClienteServidor();
  const [facturasRes, lineasRes] = await Promise.all([
    supabase
      .from("facturas_recibidas")
      .select("id, proveedor, numero, fecha, importe, categoria, estado_pago")
      .eq("organizacion_id", org)
      .order("fecha", { ascending: false })
      .limit(100),
    supabase
      .from("facturas_lineas")
      .select("factura_id, descripcion, cantidad, unidad, precio_unitario, importe, facturas_recibidas!inner(proveedor, fecha)")
      .eq("organizacion_id", org)
      .order("fecha", { referencedTable: "facturas_recibidas", ascending: false })
      .limit(1000),
  ]);

  const facturas = facturasRes.data ?? [];
  const lineas = lineasRes.data ?? [];
  const pendiente = facturas.filter((f) => f.estado_pago === "pendiente").reduce((t, f) => t + f.importe, 0);
  const total = facturas.reduce((t, f) => t + f.importe, 0);

  const lineasDe = new Map<string, typeof lineas>();
  for (const l of lineas) lineasDe.set(l.factura_id, [...(lineasDe.get(l.factura_id) ?? []), l]);

  // Último precio de cada producto por proveedor (las líneas ya vienen de la más reciente a la más antigua).
  const precioUnidad = (l: (typeof lineas)[number]) =>
    l.precio_unitario ?? (l.cantidad ? Math.round((l.importe / l.cantidad) * 10_000) / 10_000 : null);
  const productos = new Map<string, { nombre: string; precios: Map<string, { precio: number; unidad: string | null; fecha: string }> }>();
  for (const l of lineas) {
    const precio = precioUnidad(l);
    if (precio === null) continue;
    const clave = quitarTildes(l.descripcion.toLowerCase()).replace(/\s+/g, " ").trim();
    const producto = productos.get(clave) ?? { nombre: l.descripcion, precios: new Map() };
    const proveedor = l.facturas_recibidas.proveedor;
    if (!producto.precios.has(proveedor)) producto.precios.set(proveedor, { precio, unidad: l.unidad, fecha: l.facturas_recibidas.fecha });
    productos.set(clave, producto);
  }
  const comparables = [...productos.values()]
    .sort((a, b) => b.precios.size - a.precios.size || a.nombre.localeCompare(b.nombre))
    .slice(0, 40);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Facturas</h1>
        <p className="text-texto-suave">Las facturas de tus proveedores. Se suben desde la bandeja y se leen solas.</p>
      </div>

      {facturas.length > 0 && (
        <Tarjeta className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-sm text-texto-suave">Total facturado</p>
            <p className="text-2xl font-semibold">{euros(total)}</p>
          </div>
          <div>
            <p className="text-sm text-texto-suave">Pendiente de pagar</p>
            <p className="text-2xl font-semibold">{euros(pendiente)}</p>
          </div>
        </Tarjeta>
      )}

      {comparables.length > 0 && (
        <Tarjeta className="flex flex-col gap-3">
          <h2 className="font-semibold">Precios por producto</h2>
          <p className="text-sm text-texto-suave">El último precio de cada proveedor, sin IVA. El más barato va en negrita.</p>
          <ul className="flex flex-col gap-3">
            {comparables.map((p) => {
              const filas = [...p.precios.entries()].sort((a, b) => a[1].precio - b[1].precio);
              return (
                <li key={p.nombre} className="flex flex-col gap-1">
                  <span className="font-medium">{p.nombre}</span>
                  {filas.map(([proveedor, dato], i) => (
                    <span key={proveedor} className={`text-sm ${i === 0 && filas.length > 1 ? "font-semibold" : "text-texto-suave"}`}>
                      {proveedor}: {dato.precio.toLocaleString("es-ES", { maximumFractionDigits: 4 })} €{dato.unidad ? ` / ${dato.unidad}` : ""} ·{" "}
                      {fechaLarga(dato.fecha)}
                    </span>
                  ))}
                </li>
              );
            })}
          </ul>
        </Tarjeta>
      )}

      {facturas.length === 0 ? (
        <Tarjeta>
          <p className="text-texto-suave">Todavía no hay facturas. Sube una en la bandeja.</p>
        </Tarjeta>
      ) : (
        facturas.map((f) => {
          const propias = lineasDe.get(f.id) ?? [];
          return (
            <Tarjeta key={f.id} className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="font-semibold">{f.proveedor}</h2>
                <p className="text-lg font-semibold">{euros(f.importe)}</p>
              </div>
              <p className="text-sm text-texto-suave">
                {fechaLarga(f.fecha)} · {f.categoria}
                {f.numero ? ` · Nº ${f.numero}` : ""}
              </p>
              {propias.length > 0 && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-texto-suave">{propias.length} productos</summary>
                  <ul className="mt-2 flex flex-col gap-1">
                    {propias.map((l, i) => (
                      <li key={i} className="flex justify-between gap-3">
                        <span>
                          {l.cantidad !== null ? `${l.cantidad.toLocaleString("es-ES")}${l.unidad ? ` ${l.unidad}` : ""} · ` : ""}
                          {l.descripcion}
                        </span>
                        <span className="whitespace-nowrap">{euros(l.importe)}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <div className="flex items-center justify-between gap-3">
                <span className={f.estado_pago === "pagada" ? "text-sm" : "text-sm font-semibold"}>
                  {f.estado_pago === "pagada" ? "Pagada" : "Pendiente de pago"}
                </span>
                {puedeEditar && (
                  <div className="flex items-center gap-4">
                    <form action={marcarPago}>
                      <input type="hidden" name="org" value={org} />
                      <input type="hidden" name="factura" value={f.id} />
                      <input type="hidden" name="estado" value={f.estado_pago === "pagada" ? "pendiente" : "pagada"} />
                      <button type="submit" className="text-sm underline">
                        {f.estado_pago === "pagada" ? "Marcar pendiente" : "Marcar pagada"}
                      </button>
                    </form>
                    <BotonBorrar org={org} factura={f.id} />
                  </div>
                )}
              </div>
            </Tarjeta>
          );
        })
      )}
    </div>
  );
}
