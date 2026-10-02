import Link from "next/link";
import { notFound } from "next/navigation";
import { Tarjeta } from "@/components/ui";
import { euros, fechaLarga, hoyEn } from "@/lib/cierre";
import { limitesMes, mesElegido, mesVecino, nombreMes, resumirGastos } from "@/lib/gastos";
import { exigirPermiso } from "@/lib/negocio";
import { crearClienteServidor } from "@/lib/supabase/server";

// Lo que ha salido en el mes. No se apunta nada a mano: todo viene de la Bandeja, donde cada factura,
// recibo de alquiler, nómina o ticket de gasolina se reparte en su categoría al aceptarlo, y las
// ventas salen de los cierres y las hojas de ingresos que también se aceptan allí.
export default async function PaginaGastos({ params, searchParams }: PageProps<"/n/[org]/gastos">) {
  const { org } = await params;
  const negocio = await exigirPermiso(org, "gastos.ver");
  if (!negocio.modulosActivos.includes("gastos")) notFound();

  const supabase = await crearClienteServidor();
  const { data: ajustes } = await supabase.from("ajustes_organizacion").select("zona_horaria").eq("organizacion_id", org).maybeSingle();
  const hoy = hoyEn(ajustes?.zona_horaria ?? "Europe/Madrid");
  const consulta = await searchParams;
  const mes = mesElegido(typeof consulta.mes === "string" ? consulta.mes : undefined, hoy);
  const { desde, hasta } = limitesMes(mes);
  const verVentas = negocio.permisos.has("ventas.ver");
  const puedeBandeja = negocio.permisos.has("documentos.revisar") && negocio.modulosActivos.includes("bandeja");

  const [facturasRes, ventasRes] = await Promise.all([
    negocio.permisos.has("facturas.ver")
      ? supabase
          .from("facturas_recibidas")
          .select("id, proveedor, fecha, importe, categoria")
          .eq("organizacion_id", org)
          .gte("fecha", desde)
          .lt("fecha", hasta)
          .order("fecha", { ascending: false })
      : Promise.resolve({ data: [] as { id: string; proveedor: string; fecha: string; importe: number; categoria: string }[] }),
    verVentas
      ? supabase.from("cierres_diarios").select("venta").eq("organizacion_id", org).gte("fecha", desde).lt("fecha", hasta)
      : Promise.resolve({ data: null }),
  ]);

  const gastos = facturasRes.data ?? [];
  const resumen = resumirGastos(gastos);
  const ventas = ventasRes.data ? Math.round(ventasRes.data.reduce((t, c) => t + Number(c.venta) * 100, 0)) / 100 : null;
  const mayor = resumen.porCategoria[0]?.total ?? 0;
  const esMesActual = mes === hoy.slice(0, 7);
  const puedeExportar = negocio.permisos.has("exportar.usar") && negocio.permisos.has("facturas.ver");

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Gastos</h1>
        <p className="text-texto-suave">Lo que ha salido este mes, repartido por categoría, con IVA. Todo viene de la Bandeja.</p>
      </div>

      <nav aria-label="Mes" className="flex items-center justify-between gap-3">
        <Link href={`/n/${org}/gastos?mes=${mesVecino(mes, -1)}`} className="flex h-12 items-center rounded-lg border border-borde px-4">
          ← Anterior
        </Link>
        <span className="text-lg font-semibold">{nombreMes(mes)}</span>
        {esMesActual ? (
          <span className="w-[6.5rem]" />
        ) : (
          <Link href={`/n/${org}/gastos?mes=${mesVecino(mes, 1)}`} className="flex h-12 items-center rounded-lg border border-borde px-4">
            Siguiente →
          </Link>
        )}
      </nav>

      <Tarjeta className="flex flex-col gap-3">
        <div>
          <p className="text-sm text-texto-suave">Gastado en el mes</p>
          <p className="text-3xl font-semibold">{euros(resumen.total)}</p>
        </div>
        {ventas !== null && (
          <div className="grid grid-cols-2 gap-3 border-t border-borde pt-3">
            <div>
              <p className="text-sm text-texto-suave">Vendido</p>
              <p className="text-xl font-semibold">{euros(ventas)}</p>
            </div>
            <div>
              <p className="text-sm text-texto-suave">Vendido menos gastado</p>
              <p className="text-xl font-semibold">{euros(Math.round((ventas - resumen.total) * 100) / 100)}</p>
            </div>
            <p className="col-span-2 text-sm text-texto-suave">
              Es una referencia: no descuenta el IVA ni lo que aún no hayas subido a la Bandeja.
            </p>
          </div>
        )}
      </Tarjeta>

      {puedeExportar && (
        <a
          href={`/n/${org}/gastos/exportar?mes=${mes}`}
          className="flex h-14 items-center justify-center rounded-xl bg-primario px-4 text-lg font-semibold text-primario-texto"
        >
          Exportar {nombreMes(mes).toLowerCase()} a Excel
        </a>
      )}

      {puedeExportar && (
        <a
          href={`/n/${org}/gastos/productos`}
          className="flex h-14 items-center justify-center rounded-xl border border-borde px-4 text-lg font-semibold"
        >
          Excel de productos y precios
        </a>
      )}

      {resumen.porCategoria.length > 0 ? (
        <Tarjeta className="flex flex-col gap-4">
          <h2 className="font-semibold">Por categoría</h2>
          <ul className="flex flex-col gap-4">
            {resumen.porCategoria.map((c) => {
              const delMes = gastos.filter((g) => g.categoria === c.categoria);
              return (
                <li key={c.categoria} className="flex flex-col gap-1">
                  <div className="flex justify-between gap-3">
                    <span>{c.categoria}</span>
                    <span className="font-semibold">{euros(c.total)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-fondo" aria-hidden>
                    <div className="h-2 rounded-full bg-primario" style={{ width: `${Math.max(3, (c.total / mayor) * 100)}%` }} />
                  </div>
                  <details className="text-sm">
                    <summary className="cursor-pointer text-texto-suave">
                      {delMes.length === 1 ? "1 documento" : `${delMes.length} documentos`}
                    </summary>
                    <ul className="mt-2 flex flex-col gap-1">
                      {delMes.map((g) => (
                        <li key={g.id} className="flex justify-between gap-3">
                          <span className="min-w-0 truncate">
                            {g.proveedor} · {fechaLarga(g.fecha)}
                          </span>
                          <span className="whitespace-nowrap">{euros(g.importe)}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                </li>
              );
            })}
          </ul>
        </Tarjeta>
      ) : (
        <Tarjeta className="flex flex-col gap-3">
          <p className="text-texto-suave">No hay gastos en {nombreMes(mes).toLowerCase()}.</p>
          {puedeBandeja && (
            <p className="text-base">
              Sube las facturas, el recibo del alquiler, las nóminas y los tickets de gasolina en la{" "}
              <Link href={`/n/${org}/bandeja`} className="underline">
                Bandeja
              </Link>
              : ella los reparte aquí.
            </p>
          )}
        </Tarjeta>
      )}
    </div>
  );
}
