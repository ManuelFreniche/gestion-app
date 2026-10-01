import { notFound } from "next/navigation";
import { Tarjeta } from "@/components/ui";
import { euros, fechaLarga, hoyEn, sumarDias } from "@/lib/cierre";
import { limitesMes, nombreMes } from "@/lib/gastos";
import { cambiosDePrecio, resultadoPorMes, ultimosMeses } from "@/lib/margenes";
import { exigirPermiso } from "@/lib/negocio";
import { crearClienteServidor } from "@/lib/supabase/server";

type Cliente = Awaited<ReturnType<typeof crearClienteServidor>>;

// Supabase devuelve como mucho 1000 filas por consulta: se pide por páginas para no perder compras.
async function leerLineas(supabase: Cliente, org: string, desde: string) {
  const filas = [];
  for (let pagina = 0; pagina < 20; pagina++) {
    const { data, error } = await supabase
      .from("facturas_lineas")
      .select("id, descripcion, unidad, cantidad, precio_unitario, importe, facturas_recibidas!inner(fecha, proveedor)")
      .eq("organizacion_id", org)
      .gte("facturas_recibidas.fecha", desde)
      .order("id")
      .range(pagina * 1000, pagina * 1000 + 999);
    if (error) return null;
    filas.push(...data);
    if (data.length < 1000) break;
  }
  return filas;
}

// Sin escribir nada: cuánto queda cada mes (ventas menos gastos) y qué productos han cambiado de
// precio entre las dos últimas compras. Todo sale de lo que ya se aceptó en la Bandeja.
export default async function PaginaMargenes({ params }: PageProps<"/n/[org]/margenes">) {
  const { org } = await params;
  const negocio = await exigirPermiso(org, "margenes.ver");
  if (!negocio.modulosActivos.includes("margenes")) notFound();

  const supabase = await crearClienteServidor();
  const { data: ajustes } = await supabase.from("ajustes_organizacion").select("zona_horaria").eq("organizacion_id", org).maybeSingle();
  const hoy = hoyEn(ajustes?.zona_horaria ?? "Europe/Madrid");
  const meses = ultimosMeses(hoy.slice(0, 7), 6);
  const desde = limitesMes(meses[0]).desde;
  const hasta = limitesMes(meses[meses.length - 1]).hasta;
  const verVentas = negocio.permisos.has("ventas.ver");
  const verFacturas = negocio.permisos.has("facturas.ver");

  const [cierres, facturas, lineas] = await Promise.all([
    verVentas
      ? supabase.from("cierres_diarios").select("fecha, venta").eq("organizacion_id", org).gte("fecha", desde).lt("fecha", hasta)
      : Promise.resolve({ data: null }),
    verFacturas
      ? supabase.from("facturas_recibidas").select("fecha, importe").eq("organizacion_id", org).gte("fecha", desde).lt("fecha", hasta)
      : Promise.resolve({ data: null }),
    verFacturas ? leerLineas(supabase, org, sumarDias(hoy, -365)) : Promise.resolve(null),
  ]);

  const porMes =
    cierres.data && facturas.data
      ? resultadoPorMes(
          meses,
          cierres.data.map((c) => ({ fecha: c.fecha, venta: Number(c.venta) })),
          facturas.data.map((f) => ({ fecha: f.fecha, importe: Number(f.importe) })),
        )
      : null;
  const cambios = lineas
    ? cambiosDePrecio(
        lineas.map((l) => ({
          descripcion: l.descripcion,
          unidad: l.unidad,
          cantidad: l.cantidad === null ? null : Number(l.cantidad),
          precio_unitario: l.precio_unitario === null ? null : Number(l.precio_unitario),
          importe: Number(l.importe),
          fecha: l.facturas_recibidas.fecha,
          proveedor: l.facturas_recibidas.proveedor,
        })),
      ).slice(0, 15)
    : null;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Márgenes</h1>
        <p className="text-texto-suave">Cuánto te queda cada mes y qué ha subido de precio. Todo sale de la Bandeja.</p>
      </div>

      {porMes && (
        <Tarjeta className="flex flex-col gap-3">
          <h2 className="font-semibold">Cada mes</h2>
          <ul className="flex flex-col gap-3">
            {[...porMes].reverse().map((m) => (
              <li key={m.mes} className="flex flex-col gap-0.5 border-b border-borde pb-3 last:border-0 last:pb-0">
                <div className="flex justify-between gap-3">
                  <span>{nombreMes(m.mes)}</span>
                  <span className={`font-semibold ${m.resultado < 0 ? "text-peligro" : ""}`}>{euros(m.resultado)}</span>
                </div>
                <p className="text-sm text-texto-suave">
                  Vendido {euros(m.vendido)} · Gastado {euros(m.gastado)}
                </p>
              </li>
            ))}
          </ul>
          <p className="text-sm text-texto-suave">
            Es una referencia: no descuenta el IVA ni lo que aún no hayas subido a la Bandeja.
          </p>
        </Tarjeta>
      )}

      {cambios && (
        <Tarjeta className="flex flex-col gap-3">
          <h2 className="font-semibold">Cambios de precio</h2>
          {cambios.length === 0 ? (
            <p className="text-texto-suave">
              Todavía no hay productos comprados en dos fechas distintas. Cuando subas más facturas a la Bandeja verás aquí lo que sube o baja.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {cambios.map((c) => (
                <li key={`${c.descripcion}-${c.unidad}`} className="flex flex-col gap-0.5 border-b border-borde pb-3 last:border-0 last:pb-0">
                  <div className="flex justify-between gap-3">
                    <span className="min-w-0 truncate">{c.descripcion}</span>
                    <span className={`whitespace-nowrap font-semibold ${c.cambio > 0 ? "text-peligro" : "text-exito"}`}>
                      {c.cambio > 0 ? "+" : ""}
                      {c.cambio.toLocaleString("es-ES")} %
                    </span>
                  </div>
                  <p className="text-sm text-texto-suave">
                    De {euros(c.anterior)} a {euros(c.actual)}
                    {c.unidad ? ` por ${c.unidad}` : ""} · {c.proveedor} · {fechaLarga(c.fecha)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>
      )}
    </div>
  );
}
