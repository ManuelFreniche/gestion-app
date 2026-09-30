import { notFound } from "next/navigation";
import { Tarjeta } from "@/components/ui";
import { euros, fechaLarga } from "@/lib/cierre";
import { exigirPermiso } from "@/lib/negocio";
import { crearClienteServidor } from "@/lib/supabase/server";
import { marcarPago } from "./acciones";

// Facturas recibidas de proveedores, las que se han metido desde la bandeja.
export default async function PaginaFacturas({ params }: PageProps<"/n/[org]/facturas">) {
  const { org } = await params;
  const negocio = await exigirPermiso(org, "facturas.ver");
  if (!negocio.modulosActivos.includes("facturas")) notFound();

  const puedeEditar = negocio.permisos.has("facturas.editar");
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("facturas_recibidas")
    .select("id, proveedor, numero, fecha, importe, categoria, estado_pago")
    .eq("organizacion_id", org)
    .order("fecha", { ascending: false })
    .limit(100);

  const facturas = data ?? [];
  const pendiente = facturas.filter((f) => f.estado_pago === "pendiente").reduce((t, f) => t + f.importe, 0);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Facturas</h1>
        <p className="text-texto-suave">Las facturas de tus proveedores. Se suben desde la bandeja.</p>
      </div>

      {facturas.length > 0 && (
        <Tarjeta>
          <p className="text-sm text-texto-suave">Pendiente de pagar</p>
          <p className="text-2xl font-semibold">{euros(pendiente)}</p>
        </Tarjeta>
      )}

      {facturas.length === 0 ? (
        <Tarjeta>
          <p className="text-texto-suave">Todavía no hay facturas. Sube una en la bandeja.</p>
        </Tarjeta>
      ) : (
        facturas.map((f) => (
          <Tarjeta key={f.id} className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-semibold">{f.proveedor}</h2>
              <p className="text-lg font-semibold">{euros(f.importe)}</p>
            </div>
            <p className="text-sm text-texto-suave">
              {fechaLarga(f.fecha)} · {f.categoria}
              {f.numero ? ` · Nº ${f.numero}` : ""}
            </p>
            <div className="flex items-center justify-between gap-3">
              <span className={f.estado_pago === "pagada" ? "text-sm" : "text-sm font-semibold"}>
                {f.estado_pago === "pagada" ? "Pagada" : "Pendiente de pago"}
              </span>
              {puedeEditar && (
                <form action={marcarPago}>
                  <input type="hidden" name="org" value={org} />
                  <input type="hidden" name="factura" value={f.id} />
                  <input type="hidden" name="estado" value={f.estado_pago === "pagada" ? "pendiente" : "pagada"} />
                  <button type="submit" className="text-sm underline">
                    {f.estado_pago === "pagada" ? "Marcar pendiente" : "Marcar pagada"}
                  </button>
                </form>
              )}
            </div>
          </Tarjeta>
        ))
      )}
    </div>
  );
}
