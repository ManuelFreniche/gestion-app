import Link from "next/link";
import { Tarjeta } from "@/components/ui";
import { euros, hoyEn } from "@/lib/cierre";
import { limitesMes, nombreMes, resumirGastos } from "@/lib/gastos";
import { cargarNegocio } from "@/lib/negocio";
import { modulosVisibles } from "@/lib/permisos";
import { crearClienteServidor } from "@/lib/supabase/server";

const sumar = (valores: number[]) => Math.round(valores.reduce((t, v) => t + v * 100, 0)) / 100;

export default async function InicioNegocio({ params }: PageProps<"/n/[org]">) {
  const { org } = await params;
  const negocio = await cargarNegocio(org);
  const modulos = modulosVisibles(negocio.permisos, negocio.modulosActivos);

  const supabase = await crearClienteServidor();
  const { data: ajustes } = await supabase.from("ajustes_organizacion").select("zona_horaria").eq("organizacion_id", org).maybeSingle();
  const hoy = hoyEn(ajustes?.zona_horaria ?? "Europe/Madrid");
  const mes = hoy.slice(0, 7);
  const { desde, hasta } = limitesMes(mes);

  const verVentas = negocio.permisos.has("ventas.ver");
  const verGastos = negocio.permisos.has("facturas.ver") && negocio.permisos.has("gastos.ver");
  const verProductos = negocio.permisos.has("exportar.usar") && negocio.permisos.has("facturas.ver");
  const verBandeja = negocio.permisos.has("documentos.revisar") && negocio.modulosActivos.includes("bandeja");

  const [ventasRes, gastosRes, bandejaRes] = await Promise.all([
    verVentas
      ? supabase.from("cierres_diarios").select("fecha, venta").eq("organizacion_id", org).gte("fecha", desde).lt("fecha", hasta)
      : Promise.resolve({ data: null }),
    verGastos
      ? supabase.from("facturas_recibidas").select("categoria, importe").eq("organizacion_id", org).gte("fecha", desde).lt("fecha", hasta)
      : Promise.resolve({ data: null }),
    verBandeja
      ? supabase.from("documentos_entrantes").select("id", { count: "exact", head: true }).eq("organizacion_id", org).eq("estado", "pendiente")
      : Promise.resolve({ count: null }),
  ]);

  const ventasMes = ventasRes.data ? sumar(ventasRes.data.map((c) => Number(c.venta))) : null;
  const ventasHoy = ventasRes.data ? sumar(ventasRes.data.filter((c) => c.fecha === hoy).map((c) => Number(c.venta))) : null;
  const hayCierreHoy = ventasRes.data?.some((c) => c.fecha === hoy) ?? false;
  const gastosMes = gastosRes.data ? resumirGastos(gastosRes.data.map((g) => ({ categoria: g.categoria, importe: Number(g.importe) }))).total : null;
  const pendientes = bandejaRes.count ?? 0;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">{negocio.nombre}</h1>

      {verBandeja && (
        <Link href={`/n/${org}/bandeja`}>
          <Tarjeta className="flex items-center justify-between gap-3 hover:border-primario">
            <div>
              <p className="text-lg font-semibold">
                {pendientes === 0 ? "Bandeja al día" : pendientes === 1 ? "1 documento por revisar" : `${pendientes} documentos por revisar`}
              </p>
              <p className="text-base text-texto-suave">
                {pendientes === 0 ? "Sube facturas, nóminas o hojas de ingresos cuando las tengas." : "Míralos y decide qué se mete."}
              </p>
            </div>
            <span aria-hidden className="text-2xl">→</span>
          </Tarjeta>
        </Link>
      )}

      {(ventasMes !== null || gastosMes !== null) && (
        <Tarjeta className="flex flex-col gap-4">
          <h2 className="font-semibold">{nombreMes(mes)}</h2>
          <div className="grid grid-cols-2 gap-4">
            {ventasMes !== null && (
              <div>
                <p className="text-sm text-texto-suave">Vendido</p>
                <p className="text-2xl font-semibold">{euros(ventasMes)}</p>
              </div>
            )}
            {gastosMes !== null && (
              <div>
                <p className="text-sm text-texto-suave">Gastado</p>
                <p className="text-2xl font-semibold">{euros(gastosMes)}</p>
              </div>
            )}
          </div>
          {ventasHoy !== null && (
            <p className="border-t border-borde pt-3 text-base text-texto-suave">
              {hayCierreHoy ? `Hoy llevas ${euros(ventasHoy)} vendidos.` : "Hoy todavía no hay cierre de caja."}
            </p>
          )}
        </Tarjeta>
      )}

      {verProductos && (
        <a
          href={`/n/${org}/gastos/productos`}
          className="flex h-14 items-center justify-center rounded-xl bg-primario px-4 text-lg font-semibold text-primario-texto"
        >
          Excel de productos y precios
        </a>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {modulos.map((m) => (
          <Link key={m.clave} href={`/n/${org}/${m.clave}`}>
            <Tarjeta className="h-full hover:border-primario">
              <h2 className="font-semibold">{m.nombre}</h2>
              <p className="mt-1 text-sm text-texto-suave">{m.descripcion}</p>
            </Tarjeta>
          </Link>
        ))}
      </div>
    </div>
  );
}
