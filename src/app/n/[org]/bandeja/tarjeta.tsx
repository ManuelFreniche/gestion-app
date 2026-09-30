"use client";

import { useActionState } from "react";
import { Aviso, Boton, Campo, Etiqueta, Tarjeta } from "@/components/ui";
import { euros } from "@/lib/cierre";
import { CATEGORIAS, type FacturaDatos } from "@/lib/factura";
import { aprobarCierre, aprobarFacturas, cambiarTipoDocumento, descartarDocumento, type EstadoBandeja } from "./acciones";
import { VistaPrevia } from "./vista-previa";

export type DocumentoPendiente = {
  id: string;
  tipo: "cierre" | "factura";
  nombre: string;
  tipoArchivo: string;
  url: string;
  recibido: string;
  leido: {
    fecha?: string;
    venta?: number;
    efectivo?: number;
    banco?: number;
  };
  facturas: FacturaDatos[];
};

type Local = { id: string; nombre: string };

const coma = (n?: number) => (n === undefined ? "" : n.toString().replace(".", ","));

export function TarjetaDocumento(props: {
  org: string;
  documento: DocumentoPendiente;
  locales: Local[];
  hoy: string;
}) {
  return props.documento.tipo === "factura" ? (
    <TarjetaFactura org={props.org} documento={props.documento} hoy={props.hoy} />
  ) : (
    <TarjetaCierre {...props} />
  );
}

// Enlace discreto para corregir el tipo cuando no se ha adivinado bien.
function CambiarTipo({ org, id, a }: { org: string; id: string; a: "cierre" | "factura" }) {
  const [estado, cambiar, cambiando] = useActionState<EstadoBandeja, FormData>(cambiarTipoDocumento, {});
  return (
    <form action={cambiar} className="flex flex-col gap-1">
      <input type="hidden" name="org" value={org} />
      <input type="hidden" name="documento" value={id} />
      <input type="hidden" name="tipo" value={a} />
      <Aviso>{estado.error}</Aviso>
      <button type="submit" disabled={cambiando} className="self-start text-sm text-texto-suave underline">
        {a === "factura" ? "No es un ticket, es una factura" : "No es una factura, es un ticket de cierre"}
      </button>
    </form>
  );
}

function TarjetaFactura({ org, documento, hoy }: { org: string; documento: DocumentoPendiente; hoy: string }) {
  const [estadoAprobar, aprobar, aprobando] = useActionState<EstadoBandeja, FormData>(aprobarFacturas, {});
  const [estadoDescartar, descartar, descartando] = useActionState<EstadoBandeja, FormData>(
    descartarDocumento,
    {},
  );
  // Sin nada leído se ofrece una factura en blanco para escribirla mirando el documento.
  const facturas: FacturaDatos[] = documento.facturas.length > 0 ? documento.facturas : [{ categoria: "Otros", lineas: [] }];
  const leidas = documento.facturas.length > 0;
  const total = facturas.reduce((t, f) => t + (f.importe ?? 0), 0);

  return (
    <Tarjeta className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="font-semibold">{facturas.length > 1 ? `${facturas.length} facturas` : "Factura"}</h2>
        <p className="text-sm text-texto-suave">
          {documento.nombre} · {documento.recibido}
        </p>
        {leidas && facturas.length > 1 && <p className="text-sm font-semibold">Total: {euros(total)}</p>}
      </div>

      <VistaPrevia url={documento.url} tipo={documento.tipoArchivo} nombre={documento.nombre} />

      <form action={aprobar} className="flex flex-col gap-6">
        <input type="hidden" name="org" value={org} />
        <input type="hidden" name="documento" value={documento.id} />
        <input type="hidden" name="cantidad" value={facturas.length} />

        <p className="text-sm text-texto-suave">
          {leidas
            ? "Esto es lo que he leído. Compruébalo antes de meterlo."
            : "No he podido leer esta factura. Escribe los datos mirando el documento."}
        </p>

        {facturas.map((f, i) => {
          const id = `${documento.id}-${i}`;
          return (
            <fieldset key={id} className="flex flex-col gap-3 rounded-lg border border-borde p-3">
              {facturas.length > 1 && (
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input type="checkbox" name={`incluir_${i}`} defaultChecked className="size-5" />
                  Factura {i + 1}
                  {f.lineas.length > 0 && <span className="font-normal text-texto-suave"> · {f.lineas.length} productos</span>}
                </label>
              )}
              {facturas.length === 1 && <input type="hidden" name="incluir_0" value="on" />}

              <div className="flex flex-col gap-1.5">
                <Etiqueta htmlFor={`proveedor-${id}`}>Proveedor</Etiqueta>
                <Campo id={`proveedor-${id}`} name={`proveedor_${i}`} autoComplete="off" defaultValue={f.proveedor ?? ""} maxLength={120} required />
              </div>

              <div className="flex flex-col gap-1.5">
                <Etiqueta htmlFor={`importe-${id}`} className="text-base">
                  Importe total (€)
                </Etiqueta>
                <Campo
                  id={`importe-${id}`}
                  name={`importe_${i}`}
                  inputMode="decimal"
                  autoComplete="off"
                  defaultValue={coma(f.importe)}
                  className="h-14 text-2xl font-semibold"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Etiqueta htmlFor={`fecha-${id}`}>Fecha</Etiqueta>
                  <Campo id={`fecha-${id}`} type="date" name={`fecha_${i}`} max={hoy} defaultValue={f.fecha ?? (leidas ? "" : hoy)} required />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Etiqueta htmlFor={`categoria-${id}`}>Categoría</Etiqueta>
                  <select
                    id={`categoria-${id}`}
                    name={`categoria_${i}`}
                    defaultValue={f.categoria}
                    className="h-11 rounded-lg border border-borde bg-superficie px-3 text-base"
                  >
                    {CATEGORIAS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Etiqueta htmlFor={`numero-${id}`}>Número de factura (opcional)</Etiqueta>
                <Campo id={`numero-${id}`} name={`numero_${i}`} autoComplete="off" defaultValue={f.numero ?? ""} maxLength={60} />
              </div>
            </fieldset>
          );
        })}

        <Aviso>{estadoAprobar.error}</Aviso>
        <Boton type="submit" disabled={aprobando || descartando} className="h-14 text-base">
          {aprobando ? "Metiendo…" : facturas.length > 1 ? "Meter las facturas" : "Meter factura"}
        </Boton>
      </form>

      <form action={descartar} className="flex flex-col gap-2">
        <input type="hidden" name="org" value={org} />
        <input type="hidden" name="documento" value={documento.id} />
        <Aviso>{estadoDescartar.error}</Aviso>
        <Boton type="submit" variante="secundario" disabled={aprobando || descartando}>
          {descartando ? "Descartando…" : "Descartar, no meter"}
        </Boton>
      </form>

      <CambiarTipo org={org} id={documento.id} a="cierre" />
    </Tarjeta>
  );
}

function TarjetaCierre({
  org,
  documento,
  locales,
  hoy,
}: {
  org: string;
  documento: DocumentoPendiente;
  locales: Local[];
  hoy: string;
}) {
  const [estadoAprobar, aprobar, aprobando] = useActionState<EstadoBandeja, FormData>(aprobarCierre, {});
  const [estadoDescartar, descartar, descartando] = useActionState<EstadoBandeja, FormData>(
    descartarDocumento,
    {},
  );
  const leido = documento.leido.venta !== undefined;

  return (
    <Tarjeta className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="font-semibold">Ticket de cierre</h2>
        <p className="text-sm text-texto-suave">
          {documento.nombre} · {documento.recibido}
        </p>
      </div>

      <VistaPrevia url={documento.url} tipo={documento.tipoArchivo} nombre={documento.nombre} />

      <form action={aprobar} className="flex flex-col gap-4">
        <input type="hidden" name="org" value={org} />
        <input type="hidden" name="documento" value={documento.id} />
        {locales.length === 1 && <input type="hidden" name="local" value={locales[0].id} />}

        <p className="text-sm text-texto-suave">
          {leido
            ? "Esto es lo que he leído del ticket. Compruébalo antes de meterlo."
            : "No he podido leer este ticket. Escribe la venta mirando el documento."}
        </p>

        {locales.length > 1 && (
          <div className="flex flex-col gap-1.5">
            <Etiqueta htmlFor={`local-${documento.id}`}>Local</Etiqueta>
            <select
              id={`local-${documento.id}`}
              name="local"
              className="h-11 rounded-lg border border-borde bg-superficie px-3 text-base"
              required
            >
              {locales.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nombre}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Etiqueta htmlFor={`fecha-${documento.id}`}>Día del cierre</Etiqueta>
          <Campo
            id={`fecha-${documento.id}`}
            type="date"
            name="fecha"
            max={hoy}
            defaultValue={documento.leido.fecha ?? hoy}
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Etiqueta htmlFor={`venta-${documento.id}`} className="text-base">
            Venta del día (€)
          </Etiqueta>
          <Campo
            id={`venta-${documento.id}`}
            name="venta"
            inputMode="decimal"
            autoComplete="off"
            defaultValue={coma(documento.leido.venta)}
            className="h-14 text-2xl font-semibold"
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Etiqueta htmlFor={`efectivo-${documento.id}`}>Efectivo (€)</Etiqueta>
            <Campo
              id={`efectivo-${documento.id}`}
              name="efectivo"
              inputMode="decimal"
              autoComplete="off"
              defaultValue={coma(documento.leido.efectivo)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Etiqueta htmlFor={`banco-${documento.id}`}>Tarjeta (€)</Etiqueta>
            <Campo
              id={`banco-${documento.id}`}
              name="banco"
              inputMode="decimal"
              autoComplete="off"
              defaultValue={coma(documento.leido.banco)}
            />
          </div>
        </div>

        <Aviso>{estadoAprobar.error}</Aviso>
        <Boton type="submit" disabled={aprobando || descartando} className="h-14 text-base">
          {aprobando ? "Metiendo…" : "Meter en el cierre"}
        </Boton>
      </form>

      <form action={descartar} className="flex flex-col gap-2">
        <input type="hidden" name="org" value={org} />
        <input type="hidden" name="documento" value={documento.id} />
        <Aviso>{estadoDescartar.error}</Aviso>
        <Boton type="submit" variante="secundario" disabled={aprobando || descartando}>
          {descartando ? "Descartando…" : "Descartar, no meter"}
        </Boton>
      </form>

      <CambiarTipo org={org} id={documento.id} a="factura" />
    </Tarjeta>
  );
}
