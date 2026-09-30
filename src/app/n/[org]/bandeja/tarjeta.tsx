"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Aviso, Boton, Campo, Etiqueta, Tarjeta } from "@/components/ui";
import { euros, fechaLarga, leerImporte } from "@/lib/cierre";
import { CATEGORIAS, facturaFiable, type FacturaDatos } from "@/lib/factura";
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
  const leidas = documento.facturas.length > 0;
  const facturas: FacturaDatos[] = leidas ? documento.facturas : [{ categoria: "Otros", lineas: [] }];
  const [incluidas, setIncluidas] = useState<boolean[]>(() => facturas.map(() => true));
  const [importes, setImportes] = useState<string[]>(() => facturas.map((f) => coma(f.importe)));
  const [corregir, setCorregir] = useState(!leidas);
  const [verDocumento, setVerDocumento] = useState(false);

  const total = facturas.reduce((t, _, i) => t + (incluidas[i] ? (leerImporte(importes[i]) ?? 0) : 0), 0);
  const cuantas = incluidas.filter(Boolean).length;
  const trabajando = aprobando || descartando;

  if (estadoAprobar.ok) {
    return (
      <Tarjeta className="flex flex-col gap-3 border-exito">
        <p className="text-xl font-semibold text-exito">✓ Hecho: {cuantas === 1 ? "factura metida" : `${cuantas} facturas metidas`}</p>
        <p className="text-base">
          {documento.nombre} · {euros(total)}
        </p>
        <Link href={`/n/${org}/facturas`} className="text-base underline">
          Ver mis facturas
        </Link>
      </Tarjeta>
    );
  }
  if (estadoDescartar.ok) {
    return (
      <Tarjeta className="flex flex-col gap-2">
        <p className="text-xl font-semibold">Descartada</p>
        <p className="text-base text-texto-suave">
          {documento.nombre} no se ha metido. Si cambias de idea, vuelve a subir el archivo y podrás elegir de nuevo.
        </p>
      </Tarjeta>
    );
  }

  return (
    <Tarjeta className="flex flex-col gap-5 sm:p-6">
      <div className="flex flex-col gap-1">
        <p className="text-base font-medium text-texto-suave">
          {facturas.length > 1 ? `${facturas.length} facturas en este archivo` : "Factura"}
        </p>
        <h2 className="break-words text-lg font-semibold">{documento.nombre}</h2>
        <p className="text-sm text-texto-suave">Subido {documento.recibido}</p>
      </div>

      {leidas ? (
        <div className="rounded-xl bg-primario/10 px-4 py-4">
          <p className="text-base text-texto-suave">{cuantas > 1 ? "Suma de las facturas marcadas" : "Importe total"}</p>
          <p className="text-4xl font-bold tabular-nums">{euros(total)}</p>
        </div>
      ) : (
        <p className="rounded-xl bg-fondo px-4 py-3 text-base ring-1 ring-borde">
          No he podido leer este documento. Mira el documento y escribe los datos abajo.
        </p>
      )}

      <form action={aprobar} className="flex flex-col gap-5">
        <input type="hidden" name="org" value={org} />
        <input type="hidden" name="documento" value={documento.id} />
        <input type="hidden" name="cantidad" value={facturas.length} />

        {leidas && (
          <ul className="flex flex-col gap-2">
            {facturas.map((f, i) => {
              const cuadra = f.proveedor && f.fecha && f.importe && facturaFiable(f, hoy);
              return (
                <li key={i}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-borde px-4 py-3">
                    {facturas.length > 1 ? (
                      <input
                        type="checkbox"
                        name={`incluir_${i}`}
                        checked={incluidas[i]}
                        onChange={(e) => setIncluidas((a) => a.map((v, j) => (j === i ? e.target.checked : v)))}
                        className="size-6 shrink-0"
                      />
                    ) : (
                      <input type="hidden" name="incluir_0" value="on" />
                    )}
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-base font-semibold">{f.proveedor ?? "Proveedor sin leer"}</span>
                      <span className="text-sm text-texto-suave">
                        {f.fecha ? fechaLarga(f.fecha) : "Sin fecha"}
                        {f.numero ? ` · Nº ${f.numero}` : ""}
                        {f.lineas.length > 0 ? ` · ${f.lineas.length} productos` : ""}
                      </span>
                      <span className={`text-sm ${cuadra ? "text-exito" : "text-peligro"}`}>
                        {cuadra ? "✓ Datos completos" : "Revisa los datos"}
                      </span>
                    </span>
                    <span className="text-xl font-bold tabular-nums">{euros(leerImporte(importes[i]) ?? 0)}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => setCorregir((v) => !v)}
            className="self-start text-base underline"
            aria-expanded={corregir}
          >
            {corregir ? "Ocultar los datos" : leidas ? "Corregir algún dato" : "Escribir los datos"}
          </button>
          <div className={corregir || estadoAprobar.error ? "flex flex-col gap-4" : "hidden"}>
            {facturas.map((f, i) => {
              const id = `${documento.id}-${i}`;
              return (
                <fieldset key={id} className="flex flex-col gap-3 rounded-xl border border-borde p-4">
                  {facturas.length > 1 && <legend className="px-1 text-base font-medium">Factura {i + 1}</legend>}
                  <div className="flex flex-col gap-1.5">
                    <Etiqueta htmlFor={`proveedor-${id}`} className="text-base">
                      Proveedor
                    </Etiqueta>
                    <Campo id={`proveedor-${id}`} name={`proveedor_${i}`} autoComplete="off" defaultValue={f.proveedor ?? ""} maxLength={120} className="h-12" />
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
                      value={importes[i]}
                      onChange={(e) => setImportes((a) => a.map((v, j) => (j === i ? e.target.value : v)))}
                      className="h-14 text-2xl font-semibold"
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                      <Etiqueta htmlFor={`fecha-${id}`} className="text-base">
                        Fecha
                      </Etiqueta>
                      <Campo id={`fecha-${id}`} type="date" name={`fecha_${i}`} max={hoy} defaultValue={f.fecha ?? (leidas ? "" : hoy)} className="h-12" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Etiqueta htmlFor={`categoria-${id}`} className="text-base">
                        Tipo de gasto
                      </Etiqueta>
                      <select
                        id={`categoria-${id}`}
                        name={`categoria_${i}`}
                        defaultValue={f.categoria}
                        className="h-12 rounded-lg border border-borde bg-superficie px-3 text-base"
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
                    <Etiqueta htmlFor={`numero-${id}`} className="text-base">
                      Número de factura (si lo tiene)
                    </Etiqueta>
                    <Campo id={`numero-${id}`} name={`numero_${i}`} autoComplete="off" defaultValue={f.numero ?? ""} maxLength={60} className="h-12" />
                  </div>
                </fieldset>
              );
            })}
          </div>
        </div>

        <Aviso>{estadoAprobar.error}</Aviso>
        <Boton type="submit" disabled={trabajando || cuantas === 0} className="h-16 text-lg">
          {aprobando ? "Metiendo…" : cuantas > 1 ? `Meter las ${cuantas} facturas` : "Meter en mis facturas"}
        </Boton>
      </form>

      <form action={descartar} className="flex flex-col gap-2">
        <input type="hidden" name="org" value={org} />
        <input type="hidden" name="documento" value={documento.id} />
        <input type="hidden" name="mantener" value="1" />
        <Aviso>{estadoDescartar.error}</Aviso>
        <Boton type="submit" variante="secundario" disabled={trabajando} className="h-14 text-base">
          {descartando ? "Descartando…" : "No meter"}
        </Boton>
      </form>

      <div className="flex flex-col gap-3">
        <button type="button" onClick={() => setVerDocumento((v) => !v)} className="self-start text-base underline" aria-expanded={verDocumento}>
          {verDocumento ? "Ocultar el documento" : "Ver el documento"}
        </button>
        {verDocumento && <VistaPrevia url={documento.url} tipo={documento.tipoArchivo} nombre={documento.nombre} />}
      </div>

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
