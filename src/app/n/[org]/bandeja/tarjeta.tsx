"use client";

import { useActionState } from "react";
import { Aviso, Boton, Campo, Etiqueta, Tarjeta } from "@/components/ui";
import { aprobarCierre, descartarDocumento, type EstadoBandeja } from "./acciones";
import { VistaPrevia } from "./vista-previa";

export type DocumentoPendiente = {
  id: string;
  nombre: string;
  tipoArchivo: string;
  url: string;
  recibido: string;
  leido: { fecha?: string; venta?: number; efectivo?: number; banco?: number };
};

type Local = { id: string; nombre: string };

const coma = (n?: number) => (n === undefined ? "" : n.toString().replace(".", ","));

export function TarjetaDocumento({
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
    </Tarjeta>
  );
}
