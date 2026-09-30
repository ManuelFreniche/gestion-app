import Link from "next/link";
import { notFound } from "next/navigation";
import { Tarjeta } from "@/components/ui";
import { esFecha, euros, fechaLarga, hoyEn, sumarDias } from "@/lib/cierre";
import { exigirPermiso } from "@/lib/negocio";
import { crearClienteServidor } from "@/lib/supabase/server";
import { FormularioCierre, FormularioSabores } from "./formularios";

// Cierre del día: la venta y los sabores de los que se ha acabado una tanda.
// Pensado para hacerse en menos de 30 segundos desde el móvil, con una mano.
export default async function PaginaVentas({
  params,
  searchParams,
}: PageProps<"/n/[org]/ventas">) {
  const { org } = await params;
  const consulta = await searchParams;
  const negocio = await exigirPermiso(org, "ventas.ver");
  if (!negocio.modulosActivos.includes("ventas")) notFound();

  const puedeEditar = negocio.permisos.has("ventas.editar");
  const puedeGestionarSabores = negocio.permisos.has("inventario.editar");
  const supabase = await crearClienteServidor();

  const [ajustes, locales, sabores, recientes] = await Promise.all([
    supabase.from("ajustes_organizacion").select("zona_horaria").eq("organizacion_id", org).maybeSingle(),
    supabase.from("locales").select("id, nombre").eq("organizacion_id", org).order("creado_en"),
    supabase
      .from("sabores")
      .select("id, nombre")
      .eq("organizacion_id", org)
      .eq("activo", true)
      .order("nombre"),
    supabase
      .from("cierres_diarios")
      .select("fecha, venta, local_id")
      .eq("organizacion_id", org)
      .order("fecha", { ascending: false })
      .limit(30),
  ]);

  const hoy = hoyEn(ajustes.data?.zona_horaria ?? "Europe/Madrid");
  const fechaPedida = Array.isArray(consulta.fecha) ? consulta.fecha[0] : consulta.fecha;
  const fecha = esFecha(fechaPedida) && fechaPedida <= hoy ? fechaPedida : hoy;

  const listaLocales = locales.data ?? [];
  const localPedido = Array.isArray(consulta.local) ? consulta.local[0] : consulta.local;
  const local = listaLocales.find((l) => l.id === localPedido) ?? listaLocales[0];
  if (!local) notFound();

  const cierre = (recientes.data ?? []).find((c) => c.local_id === local.id && c.fecha === fecha);
  const tandas = cierre
    ? await supabase
        .from("cierre_tandas")
        .select("sabor_id, cierres_diarios!inner(fecha, local_id)")
        .eq("organizacion_id", org)
        .eq("cierres_diarios.fecha", fecha)
        .eq("cierres_diarios.local_id", local.id)
    : { data: [] };

  const enlace = (dia: string, localId = local.id) =>
    `/n/${org}/ventas?fecha=${dia}&local=${localId}`;
  const ultimos = (recientes.data ?? []).filter((c) => c.local_id === local.id).slice(0, 7);
  const listaSabores = sabores.data ?? [];

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Cierre del día</h1>
        <p className="text-texto-suave first-letter:uppercase">
          {fecha === hoy ? "Hoy, " : ""}
          {fechaLarga(fecha)}
        </p>
      </div>

      {listaLocales.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {listaLocales.map((l) => (
            <Link
              key={l.id}
              href={enlace(fecha, l.id)}
              className={`rounded-full border px-4 py-2 text-sm ${
                l.id === local.id ? "border-primario bg-primario text-primario-texto" : "border-borde"
              }`}
            >
              {l.nombre}
            </Link>
          ))}
        </div>
      )}

      <div className="flex gap-2 text-sm">
        {fecha !== hoy && (
          <Link href={enlace(hoy)} className="rounded-lg border border-borde px-3 py-2">
            Ir a hoy
          </Link>
        )}
        <Link href={enlace(sumarDias(fecha, -1))} className="rounded-lg border border-borde px-3 py-2">
          Día anterior
        </Link>
      </div>

      {puedeEditar ? (
        <Tarjeta>
          {listaSabores.length === 0 && puedeGestionarSabores && (
            <div className="mb-6 flex flex-col gap-2 border-b border-borde pb-6">
              <h2 className="font-medium">Primero, tus sabores</h2>
              <p className="text-sm text-texto-suave">
                Así podréis marcar cada noche cuál se ha acabado.
              </p>
              <FormularioSabores org={org} />
            </div>
          )}
          <FormularioCierre
            key={`${local.id}-${fecha}`}
            org={org}
            local={local.id}
            fecha={fecha}
            sabores={listaSabores}
            ventaInicial={cierre?.venta}
            saboresIniciales={(tandas.data ?? []).map((t) => t.sabor_id)}
          />
        </Tarjeta>
      ) : (
        <Tarjeta>
          <p className="text-texto-suave">Solo puedes consultar los cierres.</p>
          {cierre && <p className="mt-2 text-2xl font-semibold">{euros(cierre.venta)}</p>}
        </Tarjeta>
      )}

      {ultimos.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-medium">Últimos cierres</h2>
          <Tarjeta className="divide-y divide-borde p-0">
            {ultimos.map((c) => (
              <Link
                key={c.fecha}
                href={enlace(c.fecha)}
                className="flex items-center justify-between px-5 py-3 first-letter:uppercase hover:bg-fondo"
              >
                <span>{fechaLarga(c.fecha)}</span>
                <span className="font-semibold">{euros(c.venta)}</span>
              </Link>
            ))}
          </Tarjeta>
        </section>
      )}
    </div>
  );
}
