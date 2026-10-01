import Link from "next/link";
import { notFound } from "next/navigation";
import { Tarjeta } from "@/components/ui";
import { euros, fechaLarga, hoyEn } from "@/lib/cierre";
import { limitesMes, mesElegido, mesVecino, nombreMes, resumirGastos } from "@/lib/gastos";
import { exigirPermiso } from "@/lib/negocio";
import { crearClienteServidor } from "@/lib/supabase/server";
import { BotonBorrarGasto, FormularioGasto } from "./formulario";

// Lo que se ha gastado en el mes: las facturas de proveedores (que entran solas desde la bandeja)
// más los gastos sueltos que se apuntan aquí (alquiler, nóminas, una compra en efectivo…).
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
  const puedeEditar = negocio.permisos.has("gastos.editar");
  const verVentas = negocio.permisos.has("ventas.ver");

  const [facturasRes, variosRes, ventasRes] = await Promise.all([
    negocio.permisos.has("facturas.ver")
      ? supabase.from("facturas_recibidas").select("categoria, importe").eq("organizacion_id", org).gte("fecha", desde).lt("fecha", hasta)
      : Promise.resolve({ data: [] as { categoria: string; importe: number }[] }),
    supabase
      .from("gastos_varios")
      .select("id, fecha, concepto, categoria, importe")
      .eq("organizacion_id", org)
      .gte("fecha", desde)
      .lt("fecha", hasta)
      .order("fecha", { ascending: false }),
    verVentas
      ? supabase.from("cierres_diarios").select("venta").eq("organizacion_id", org).gte("fecha", desde).lt("fecha", hasta)
      : Promise.resolve({ data: null }),
  ]);

  const facturas = facturasRes.data ?? [];
  const varios = variosRes.data ?? [];
  const resumen = resumirGastos([...facturas, ...varios]);
  const delFacturas = resumirGastos(facturas).total;
  const ventas = ventasRes.data ? Math.round(ventasRes.data.reduce((t, c) => t + Number(c.venta) * 100, 0)) / 100 : null;
  const mayor = resumen.porCategoria[0]?.total ?? 0;
  const esMesActual = mes === hoy.slice(0, 7);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Gastos</h1>
        <p className="text-texto-suave">Lo que ha salido este mes: facturas de proveedores y gastos sueltos, con IVA.</p>
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
          <p className="text-sm text-texto-suave">
            {euros(delFacturas)} en facturas · {euros(resumen.total - delFacturas)} en gastos sueltos
          </p>
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
              Es una referencia: no descuenta el IVA ni lo que aún no has apuntado.
            </p>
          </div>
        )}
      </Tarjeta>

      {resumen.porCategoria.length > 0 ? (
        <Tarjeta className="flex flex-col gap-3">
          <h2 className="font-semibold">Por categoría</h2>
          <ul className="flex flex-col gap-3">
            {resumen.porCategoria.map((c) => (
              <li key={c.categoria} className="flex flex-col gap-1">
                <div className="flex justify-between gap-3">
                  <span>{c.categoria}</span>
                  <span className="font-semibold">{euros(c.total)}</span>
                </div>
                <div className="h-2 rounded-full bg-fondo" aria-hidden>
                  <div className="h-2 rounded-full bg-primario" style={{ width: `${Math.max(3, (c.total / mayor) * 100)}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </Tarjeta>
      ) : (
        <Tarjeta>
          <p className="text-texto-suave">No hay gastos en {nombreMes(mes).toLowerCase()}.</p>
        </Tarjeta>
      )}

      {varios.length > 0 && (
        <Tarjeta className="flex flex-col gap-3">
          <h2 className="font-semibold">Gastos sueltos</h2>
          <ul className="flex flex-col gap-3">
            {varios.map((g) => (
              <li key={g.id} className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col">
                  <span className="font-medium">{g.concepto}</span>
                  <span className="text-sm text-texto-suave">
                    {fechaLarga(g.fecha)} · {g.categoria}
                  </span>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="font-semibold">{euros(Number(g.importe))}</span>
                  {puedeEditar && <BotonBorrarGasto org={org} gasto={g.id} />}
                </div>
              </li>
            ))}
          </ul>
        </Tarjeta>
      )}

      {puedeEditar && (
        <Tarjeta className="flex flex-col gap-4">
          <h2 className="font-semibold">Apuntar un gasto</h2>
          <p className="text-sm text-texto-suave">
            Para lo que no tiene factura de proveedor. Las facturas se suman solas desde la bandeja.
          </p>
          <FormularioGasto org={org} hoy={hoy} />
        </Tarjeta>
      )}
    </div>
  );
}
