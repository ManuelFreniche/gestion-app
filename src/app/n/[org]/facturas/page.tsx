import { notFound } from "next/navigation";
import { Tarjeta } from "@/components/ui";
import { euros, fechaLarga } from "@/lib/cierre";
import { exigirPermiso } from "@/lib/negocio";
import { crearClienteServidor } from "@/lib/supabase/server";
import { marcarPago } from "./acciones";
import { BotonBorrar } from "./boton-borrar";
import { MarcarTodasPagadas } from "./marcar-todas";

// Facturas recibidas de proveedores, las que se han metido desde la bandeja. Los precios por producto
// están en el Excel de Gastos.
export default async function PaginaFacturas({ params }: PageProps<"/n/[org]/facturas">) {
  const { org } = await params;
  const negocio = await exigirPermiso(org, "facturas.ver");
  if (!negocio.modulosActivos.includes("facturas")) notFound();

  const puedeEditar = negocio.permisos.has("facturas.editar");
  const supabase = await crearClienteServidor();
  const [facturasRes, pendientesRes] = await Promise.all([
    supabase
      .from("facturas_recibidas")
      .select("id, proveedor, numero, fecha, importe, categoria, estado_pago")
      .eq("organizacion_id", org)
      .order("fecha", { ascending: false })
      .limit(100),
    supabase
      .from("facturas_recibidas")
      .select("id", { count: "exact", head: true })
      .eq("organizacion_id", org)
      .eq("estado_pago", "pendiente"),
  ]);

  const facturas = facturasRes.data ?? [];
  const pendientes = pendientesRes.count ?? 0;
  const pendiente = facturas.filter((f) => f.estado_pago === "pendiente").reduce((t, f) => t + f.importe, 0);
  const total = facturas.reduce((t, f) => t + f.importe, 0);

  // Los productos de cada factura que se ve (solo de esas, para no pedir de más).
  const { data: lineasBd } = facturas.length
    ? await supabase
        .from("facturas_lineas")
        .select("factura_id, descripcion, cantidad, unidad, importe")
        .eq("organizacion_id", org)
        .in(
          "factura_id",
          facturas.map((f) => f.id),
        )
    : { data: [] };
  const lineasDe = new Map<string, NonNullable<typeof lineasBd>>();
  for (const l of lineasBd ?? []) lineasDe.set(l.factura_id, [...(lineasDe.get(l.factura_id) ?? []), l]);

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

      {puedeEditar && pendientes > 0 && <MarcarTodasPagadas org={org} pendientes={pendientes} />}

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
