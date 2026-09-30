import { notFound } from "next/navigation";
import { Tarjeta } from "@/components/ui";
import { hoyEn } from "@/lib/cierre";
import type { FacturaDatos } from "@/lib/factura";
import { hayIA } from "@/lib/leer-documento-ia";
import { exigirPermiso } from "@/lib/negocio";
import { crearClienteServidor } from "@/lib/supabase/server";
import { faltanVariablesCorreo } from "@/lib/correo";
import { RevisarCorreo } from "./revisar-correo";
import { SubirTickets } from "./subir";
import { TarjetaDocumento, type DocumentoPendiente } from "./tarjeta";

// Leer una foto con Claude puede tardar unos segundos.
export const maxDuration = 60;

// Bandeja de revisión: cada documento se ve abierto en la pantalla y una persona decide
// si se mete o no. Nada entra en las cuentas sin pasar por aquí.
export default async function PaginaBandeja({ params }: PageProps<"/n/[org]/bandeja">) {
  const { org } = await params;
  const negocio = await exigirPermiso(org, "documentos.revisar");
  if (!negocio.modulosActivos.includes("bandeja")) notFound();

  const supabase = await crearClienteServidor();
  const [ajustes, locales, pendientes] = await Promise.all([
    supabase.from("ajustes_organizacion").select("zona_horaria").eq("organizacion_id", org).maybeSingle(),
    supabase.from("locales").select("id, nombre").eq("organizacion_id", org).order("creado_en"),
    supabase
      .from("documentos_entrantes")
      .select("id, tipo, archivo_ruta, archivo_nombre, archivo_tipo, datos, recibido_en")
      .eq("organizacion_id", org)
      .eq("estado", "pendiente")
      .order("recibido_en", { ascending: false })
      .limit(20),
  ]);

  const zona = ajustes.data?.zona_horaria ?? "Europe/Madrid";
  const filas = pendientes.data ?? [];
  const firmadas = filas.length
    ? await supabase.storage.from("documentos").createSignedUrls(
        filas.map((f) => f.archivo_ruta),
        600,
      )
    : { data: [] };
  const urlDe = new Map((firmadas.data ?? []).map((f) => [f.path, f.signedUrl]));

  const documentos: DocumentoPendiente[] = filas.flatMap((fila) => {
    const url = urlDe.get(fila.archivo_ruta);
    if (!url) return [];
    const datos = (fila.datos ?? {}) as Record<string, unknown>;
    const numero = (v: unknown) => (typeof v === "number" ? v : undefined);
    return [
      {
        id: fila.id,
        tipo: fila.tipo === "factura" ? "factura" : "cierre",
        nombre: fila.archivo_nombre,
        tipoArchivo: fila.archivo_tipo,
        url,
        recibido: new Intl.DateTimeFormat("es-ES", {
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: zona,
        }).format(new Date(fila.recibido_en)),
        leido: {
          fecha: typeof datos.fecha === "string" ? datos.fecha : undefined,
          venta: numero(datos.venta),
          efectivo: numero(datos.efectivo),
          banco: numero(datos.banco),
        },
        facturas: Array.isArray(datos.facturas) ? (datos.facturas as FacturaDatos[]) : [],
      },
    ];
  });

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold">Bandeja</h1>
        <p className="text-lg text-texto-suave">
          Sube tus facturas y tickets. Yo los leo y te los enseño aquí: tú decides cuáles se meten.
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
        <SubirTickets org={org} hoy={hoyEn(zona)} lectorDirecto={Boolean(process.env.GEMINI_API_KEY)} />
      </Tarjeta>

      {faltanVariablesCorreo(org).length === 0 ? (
        <Tarjeta>
          <RevisarCorreo org={org} />
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

      {documentos.length > 0 && <h2 className="text-2xl font-bold">Por revisar ({documentos.length})</h2>}

      {documentos.length === 0 ? (
        <Tarjeta>
          <p className="text-lg text-texto-suave">No hay nada por revisar. Todo al día.</p>
        </Tarjeta>
      ) : (
        documentos.map((documento) => (
          <TarjetaDocumento
            key={documento.id}
            org={org}
            documento={documento}
            locales={locales.data ?? []}
            hoy={hoyEn(zona)}
          />
        ))
      )}
    </div>
  );
}
