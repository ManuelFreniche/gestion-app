import { notFound } from "next/navigation";
import { Tarjeta } from "@/components/ui";
import { hoyEn, sumarDias } from "@/lib/cierre";
import { VERSION_LECTURA_CIERRE, type CierrePendiente } from "@/lib/cierres-bandeja";
import { faltanVariablesCorreo } from "@/lib/correo";
import { claveFactura, type FacturaDatos } from "@/lib/factura";
import { hayIA, type IngresoDia } from "@/lib/leer-documento-ia";
import { exigirPermiso } from "@/lib/negocio";
import { crearClienteServidor } from "@/lib/supabase/server";
import { versionDesplegada } from "@/lib/version";
import { Descartados, type Descartado } from "./descartados";
import { RevisarCorreo } from "./revisar-correo";
import { SubirTickets } from "./subir";
import { TarjetaCierres } from "./tarjeta-cierres";
import { TarjetaDocumento, type DocumentoPendiente } from "./tarjeta";

// Leer una foto con Claude puede tardar unos segundos.
export const maxDuration = 60;

// Cuántos documentos pendientes se enseñan a la vez (cada día entran pocos; esto cubre un mes de cierres).
const MAX_PENDIENTES = 60;

// Resumen corto de lo leído: cambia cuando cambia lo leído, y así las tarjetas se redibujan con lo nuevo
// (si no, un formulario ya abierto seguiría enseñando los datos de antes).
function huellaDatos(datos: unknown): string {
  const texto = JSON.stringify(datos ?? {});
  let h = 5381;
  for (let i = 0; i < texto.length; i++) h = ((h << 5) + h + texto.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

// Bandeja de revisión: cada documento se ve abierto en la pantalla y una persona decide
// si se mete o no. Nada entra en las cuentas sin pasar por aquí.
export default async function PaginaBandeja({ params }: PageProps<"/n/[org]/bandeja">) {
  const { org } = await params;
  const negocio = await exigirPermiso(org, "documentos.revisar");
  if (!negocio.modulosActivos.includes("bandeja")) notFound();

  const supabase = await crearClienteServidor();
  const [ajustes, locales, pendientes, descartados] = await Promise.all([
    supabase.from("ajustes_organizacion").select("zona_horaria").eq("organizacion_id", org).maybeSingle(),
    supabase.from("locales").select("id, nombre").eq("organizacion_id", org).order("creado_en"),
    supabase
      .from("documentos_entrantes")
      .select("id, tipo, archivo_ruta, archivo_nombre, archivo_tipo, datos, recibido_en", { count: "exact" })
      .eq("organizacion_id", org)
      .eq("estado", "pendiente")
      .order("recibido_en", { ascending: false })
      .limit(MAX_PENDIENTES),
    supabase
      .from("documentos_entrantes")
      .select("id, tipo, archivo_nombre, recibido_en, revisado_en")
      .eq("organizacion_id", org)
      .eq("estado", "descartado")
      .order("revisado_en", { ascending: false, nullsFirst: false })
      .limit(30),
  ]);

  const zona = ajustes.data?.zona_horaria ?? "Europe/Madrid";
  const hoy = hoyEn(zona);
  const filas = pendientes.data ?? [];
  const hayMas = (pendientes.count ?? filas.length) - filas.length;
  const firmadas = filas.length
    ? await supabase.storage.from("documentos").createSignedUrls(
        filas.map((f) => f.archivo_ruta),
        3600,
      )
    : { data: [] };
  const urlDe = new Map((firmadas.data ?? []).map((f) => [f.path, f.signedUrl]));

  const dia = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: zona });
  const soloDia = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", timeZone: zona });

  // Lo que ya hay en Ventas para los días de los cierres y de las hojas de ingresos pendientes, para
  // avisar de lo que se cambiaría al meterlos.
  const diasLeidos = filas.flatMap((f) => {
    const datos = (f.datos ?? {}) as { fecha?: unknown; ingresos?: IngresoDia[] };
    const fechas = (datos.ingresos ?? []).map((d) => d.fecha);
    if (f.tipo === "cierre" && typeof datos.fecha === "string") fechas.push(datos.fecha);
    return fechas;
  });
  const ventasPorDia: Record<string, number> = {};
  if (filas.length > 0) {
    // Los días leídos y también los dos últimos meses: la persona puede corregir una fecha a otro día y la
    // tarjeta debe avisar de lo que ya hay en Ventas en ese día.
    const ordenados = [...diasLeidos, sumarDias(hoy, -62)].sort();
    const { data } = await supabase
      .from("cierres_diarios")
      .select("fecha, venta")
      .eq("organizacion_id", org)
      .gte("fecha", ordenados[0])
      .lte("fecha", ordenados[ordenados.length - 1] > hoy ? ordenados[ordenados.length - 1] : hoy);
    for (const c of data ?? []) ventasPorDia[c.fecha] = (ventasPorDia[c.fecha] ?? 0) + Number(c.venta);
  }

  // Facturas de la bandeja que ya están registradas (mismo proveedor, número y fecha): se avisa para
  // que no se cuenten dos veces.
  const numerosHoja = filas.flatMap((f) =>
    ((f.datos as { facturas?: FacturaDatos[] } | null)?.facturas ?? []).flatMap((x) => (x.numero ? [x.numero] : [])),
  );
  const yaRegistradas = new Set<string>();
  if (numerosHoja.length > 0) {
    const { data } = await supabase
      .from("facturas_recibidas")
      .select("proveedor, numero, fecha")
      .eq("organizacion_id", org)
      .in("numero", numerosHoja);
    for (const f of data ?? []) {
      const clave = claveFactura(f);
      if (clave) yaRegistradas.add(clave);
    }
  }

  // Los cierres de caja van todos juntos en una tarjeta. Un mismo archivo puede traer facturas y gastos
  // por un lado e ingresos por otro: cada parte pendiente es una tarjeta, y el archivo sale de la
  // bandeja cuando se han decidido todas.
  const cierres: CierrePendiente[] = [];
  const documentos: DocumentoPendiente[] = [];
  for (const fila of filas) {
    // Sin enlace al archivo (Storage no lo ha dado) la tarjeta sale igual, sin vista previa: así nada desaparece.
    const url = urlDe.get(fila.archivo_ruta) ?? "";
    const datos = (fila.datos ?? {}) as Record<string, unknown>;
    const numero = (v: unknown) => (typeof v === "number" ? v : undefined);
    const recibido = dia.format(new Date(fila.recibido_en));
    const avisoGuardado = typeof datos.aviso === "string" && datos.aviso ? datos.aviso : undefined;
    // Un cierre leído por una versión anterior del lector no se da por bueno: sin marcar y con aviso.
    const aviso =
      fila.tipo === "cierre" && datos.version_lectura !== VERSION_LECTURA_CIERRE
        ? (avisoGuardado ?? "Esta tarjeta la leyó una versión anterior del lector: pulsa «Volver a leer» antes de meterla.")
        : avisoGuardado;
    const version = huellaDatos(datos);
    if (fila.tipo === "cierre") {
      cierres.push({
        id: fila.id,
        clave: `${fila.id}-${version}`,
        nombre: fila.archivo_nombre,
        tipoArchivo: fila.archivo_tipo,
        url,
        recibido,
        fecha: typeof datos.fecha === "string" ? datos.fecha : undefined,
        venta: numero(datos.venta),
        efectivo: numero(datos.efectivo),
        banco: numero(datos.banco),
        aviso,
      });
      continue;
    }
    const facturas = Array.isArray(datos.facturas) ? (datos.facturas as FacturaDatos[]) : [];
    const ingresos = Array.isArray(datos.ingresos) ? (datos.ingresos as IngresoDia[]) : [];
    const partes = (typeof datos.partes === "object" && datos.partes !== null ? datos.partes : {}) as Record<string, string>;
    const comun = {
      id: fila.id,
      nombre: fila.archivo_nombre,
      tipoArchivo: fila.archivo_tipo,
      url,
      recibido,
      aviso,
      facturas,
      repetidas: facturas.map((f) => {
        const clave = claveFactura(f);
        return clave !== null && yaRegistradas.has(clave);
      }),
      ingresos,
      lector: (datos.lector === "ia" ? "ia" : "reglas") as "ia" | "reglas",
      lectorDebil: typeof datos.modelo === "string" && /lite|nvidia/i.test(datos.modelo),
    };
    // Sin nada leído se ofrece una factura en blanco para escribirla mirando el documento.
    if ((facturas.length > 0 || ingresos.length === 0) && !partes.facturas) {
      documentos.push({ ...comun, clave: `${fila.id}-facturas-${version}`, tipo: "factura" });
    }
    if (ingresos.length > 0 && !partes.ingresos) {
      documentos.push({
        ...comun,
        clave: `${fila.id}-ingresos-${version}`,
        tipo: "ingresos",
        yaEnVentas: Object.fromEntries(ingresos.flatMap((d) => (ventasPorDia[d.fecha] !== undefined ? [[d.fecha, ventasPorDia[d.fecha]]] : []))),
      });
    }
  }

  const descartadosVista: Descartado[] = (descartados.data ?? []).map((d) => ({
    id: d.id,
    nombre: d.archivo_nombre,
    tipo: d.tipo,
    recibido: soloDia.format(new Date(d.recibido_en)),
    descartado: d.revisado_en ? soloDia.format(new Date(d.revisado_en)) : "—",
  }));

  const total = cierres.length + documentos.length;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold">Bandeja</h1>
        <p className="text-lg text-texto-suave">
          Sube facturas, recibos, nóminas, tickets y hojas de ingresos, todo junto si quieres. Yo los leo, los separo por tipo y te los enseño aquí: tú decides cuáles se meten.
        </p>
      </div>

      {!hayIA() && (
        <Tarjeta className="border-peligro">
          <p className="text-base font-semibold text-peligro">Falta activar el lector inteligente</p>
          <p className="mt-1 text-base">
            Sin él solo leo bien los PDF con texto claro; las fotos y los escaneos no. Quien administra la web tiene que añadir la clave{" "}
            <code className="rounded bg-fondo px-1">GEMINI_API_KEY</code> en Vercel (es gratuita).
          </p>
        </Tarjeta>
      )}

      <Tarjeta>
        <SubirTickets org={org} lectorDirecto={Boolean(process.env.GEMINI_API_KEY)} />
      </Tarjeta>

      {faltanVariablesCorreo(org).length === 0 ? (
        <Tarjeta>
          <RevisarCorreo org={org} hoy={hoy} />
        </Tarjeta>
      ) : (
        negocio.rol === "dueno" && (
          <Tarjeta>
            <p className="text-base font-semibold">Correo sin conectar</p>
            <p className="mt-1 text-base text-texto-suave">
              Para que las facturas de tu correo lleguen solas, en Vercel falta: {faltanVariablesCorreo(org).join(", ")}. Después, haz Redeploy.
            </p>
          </Tarjeta>
        )
      )}

      {total > 0 && <h2 className="text-2xl font-bold">Por revisar ({total}{hayMas > 0 ? ` de ${total + hayMas}` : ""})</h2>}
      {hayMas > 0 && (
        <p className="text-base text-texto-suave">
          Enseño los {MAX_PENDIENTES} más recientes; cuando metas o descartes alguno verás los siguientes.
        </p>
      )}

      <TarjetaCierres key="cierres" org={org} cierres={cierres} locales={locales.data ?? []} hoy={hoy} ventasPorDia={ventasPorDia} />

      {total === 0 && (
        <Tarjeta>
          <p className="text-lg text-texto-suave">No hay nada por revisar. Todo al día.</p>
        </Tarjeta>
      )}

      {documentos.map((documento) => (
        <TarjetaDocumento key={documento.clave} org={org} documento={documento} locales={locales.data ?? []} hoy={hoy} />
      ))}

      <Descartados org={org} documentos={descartadosVista} />

      <p className="text-center text-xs text-texto-suave">Versión {versionDesplegada()}</p>
    </div>
  );
}
