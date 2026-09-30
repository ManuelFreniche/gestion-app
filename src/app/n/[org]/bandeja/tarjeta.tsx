"use client";

import { useActionState } from "react";
import { Aviso, Boton, Campo, Etiqueta, Tarjeta } from "@/components/ui";
import { CATEGORIAS } from "@/lib/factura";
import { aprobarCierre, aprobarFactura, cambiarTipoDocumento, descartarDocumento, type EstadoBandeja } from "./acciones";
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
    proveedor?: string;
    categoria?: string;
    importe?: number;
    numero?: string;
  };
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
  const [estadoAprobar, aprobar, aprobando] = useActionState<EstadoBandeja, FormData>(aprobarFactura, {});
  const [estadoDescartar, descartar, descartando] = useActionState<EstadoBandeja, FormData>(
    descartarDocumento,
    {},
  );
  const l = documento.leido;
  const leida = l.proveedor !== undefined || l.importe !== undefined;

  return (
    <Tarjeta className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="font-semibold">Factura</h2>
        <p className="text-sm text-texto-suave">
          {documento.nombre} · {documento.recibido}
        </p>
      </div>

      <VistaPrevia url={documento.url} tipo={documento.tipoArchivo} nombre={documento.nombre} />

      <form action={aprobar} className="flex flex-col gap-4">
        <input type="hidden" name="org" value={org} />
        <input type="hidden" name="documento" value={documento.id} />

        <p className="text-sm text-texto-suave">
          {leida
            ? "Esto es lo que he leído de la factura. Compruébalo antes de meterla."
            : "No he podido leer esta factura. Escribe los datos mirando el documento."}
        </p>

        <div className="flex flex-col gap-1.5">
          <Etiqueta htmlFor={`proveedor-${documento.id}`}>Proveedor</Etiqueta>
          <Campo
            id={`proveedor-${documento.id}`}
            name="proveedor"
            autoComplete="off"
            defaultValue={l.proveedor ?? ""}
            maxLength={120}
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Etiqueta htmlFor={`importe-${documento.id}`} className="text-base">
            Importe total (€)
          </Etiqueta>
          <Campo
            id={`importe-${documento.id}`}
            name="importe"
            inputMode="decimal"
            autoComplete="off"
            defaultValue={coma(l.importe)}
            className="h-14 text-2xl font-semibold"
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Etiqueta htmlFor={`fecha-${documento.id}`}>Fecha</Etiqueta>
            <Campo
              id={`fecha-${documento.id}`}
              type="date"
              name="fecha"
              max={hoy}
              defaultValue={l.fecha ?? hoy}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Etiqueta htmlFor={`categoria-${documento.id}`}>Categoría</Etiqueta>
            <select
              id={`categoria-${documento.id}`}
              name="categoria"
              defaultValue={l.categoria ?? "Otros"}
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
          <Etiqueta htmlFor={`numero-${documento.id}`}>Número de factura (opcional)</Etiqueta>
          <Campo
            id={`numero-${documento.id}`}
            name="numero"
            autoComplete="off"
            defaultValue={l.numero ?? ""}
            maxLength={60}
          />
        </div>

        <Aviso>{estadoAprobar.error}</Aviso>
        <Boton type="submit" disabled={aprobando || descartando} className="h-14 text-base">
          {aprobando ? "Metiendo…" : "Meter factura"}
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
