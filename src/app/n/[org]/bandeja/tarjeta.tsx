"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Aviso, Boton, Campo, Etiqueta, Tarjeta } from "@/components/ui";
import { euros, fechaLarga, leerImporte, leerImporteConSigno } from "@/lib/cierre";
import { enviar, protegerAccion } from "@/lib/enviar-formulario";
import { CATEGORIAS, facturaFiable, type FacturaDatos } from "@/lib/factura";
import type { IngresoDia } from "@/lib/leer-documento-ia";
import {
  aprobarFacturas,
  aprobarIngresos,
  cambiarTipoDocumento,
  descartarParte,
  type EstadoBandeja,
} from "./acciones";
import { VistaPrevia } from "./vista-previa";

export type DocumentoPendiente = {
  id: string;
  // Un mismo archivo puede dar varias tarjetas (sus facturas y sus ingresos): la clave las distingue.
  clave: string;
  tipo: "factura" | "ingresos";
  nombre: string;
  tipoArchivo: string;
  url: string;
  recibido: string;
  // Lo que el lector no pudo leer bien (se guarda al leerlo).
  aviso?: string;
  facturas: FacturaDatos[];
  // Una marca por factura: true si ya hay otra igual registrada (mismo proveedor, número y fecha).
  repetidas: boolean[];
  ingresos: IngresoDia[];
  // Para la tarjeta de ingresos: lo que ya hay en Ventas en esos días (fecha → venta).
  yaEnVentas?: Record<string, number>;
  // Quién leyó las facturas: la IA, o las reglas de texto (menos fiables con los importes).
  lector?: "ia" | "reglas";
  // La leyó un lector de respaldo (el más sencillo de Google, o uno gratuito de pruebas): nunca se da por completa.
  lectorDebil?: boolean;
};

type Local = { id: string; nombre: string };

// Sin conexión o con el tiempo agotado, el fallo sale en la tarjeta en vez de tirar la Bandeja entera.
const aprobarFacturasSeguro = protegerAccion(aprobarFacturas, "Se cortó la conexión y no sé si se ha guardado. Vuelve a pulsar el botón: si ya estaba metida, te lo dirá.");
const aprobarIngresosSeguro = protegerAccion(aprobarIngresos, "Se cortó la conexión y no sé si se ha guardado. Vuelve a pulsar el botón: si ya estaban metidos, te lo dirá.");
const descartarParteSeguro = protegerAccion(descartarParte);
const cambiarTipoSeguro = protegerAccion(cambiarTipoDocumento);

const coma = (n?: number) => (n === undefined ? "" : n.toString().replace(".", ","));

export function TarjetaDocumento(props: {
  org: string;
  documento: DocumentoPendiente;
  locales: Local[];
  hoy: string;
}) {
  if (props.documento.tipo === "ingresos") {
    return <TarjetaIngresos org={props.org} documento={props.documento} locales={props.locales} hoy={props.hoy} />;
  }
  return <TarjetaFactura org={props.org} documento={props.documento} hoy={props.hoy} />;
}

// Enlace discreto para corregir el tipo cuando no se ha adivinado bien.
function CambiarTipo({ org, id, a }: { org: string; id: string; a: "cierre" | "factura" }) {
  const [estado, cambiar, cambiando] = useActionState<EstadoBandeja, FormData>(cambiarTipoSeguro, {});
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
  const [estadoAprobar, aprobar, aprobando] = useActionState<EstadoBandeja, FormData>(aprobarFacturasSeguro, {});
  const [estadoDescartar, descartar, descartando] = useActionState<EstadoBandeja, FormData>(descartarParteSeguro, {});
  // Sin nada leído se ofrece una factura en blanco para escribirla mirando el documento.
  const leidas = documento.facturas.length > 0;
  const facturas: FacturaDatos[] = leidas ? documento.facturas : [{ categoria: "Otros", lineas: [] }];
  const [incluidas, setIncluidas] = useState<boolean[]>(() => facturas.map((_, i) => facturas.length === 1 || !documento.repetidas[i]));
  const [importes, setImportes] = useState<string[]>(() => facturas.map((f) => coma(f.importe)));
  const [fechas, setFechas] = useState<string[]>(() => facturas.map((f) => f.fecha ?? (leidas ? "" : hoy)));
  // Una fecha futura casi siempre es un error de lectura (un vencimiento, un año mal leído): se enseña el campo para corregirla.
  const [corregir, setCorregir] = useState(!leidas || facturas.some((f) => Boolean(f.fecha && f.fecha > hoy)));
  const [verDocumento, setVerDocumento] = useState(false);

  const total = facturas.reduce((t, _, i) => t + (incluidas[i] ? (leerImporteConSigno(importes[i]) ?? 0) : 0), 0);
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
          {documento.nombre} no se ha metido. Si cambias de idea, lo tienes en «Descartados», más abajo: ahí puedes volver a leerlo.
        </p>
      </Tarjeta>
    );
  }

  return (
    <Tarjeta className="flex flex-col gap-5 sm:p-6">
      <div className="flex flex-col gap-1">
        <p className="text-base font-medium text-texto-suave">
          {facturas.length > 1 ? `${facturas.length} facturas y gastos en este archivo` : "Factura o gasto"}
        </p>
        <h2 className="break-words text-lg font-semibold">{documento.nombre}</h2>
        <p className="text-sm text-texto-suave">Subido {documento.recibido}</p>
      </div>

      {documento.aviso && <p className="rounded-xl bg-fondo px-4 py-3 text-base ring-1 ring-borde">{documento.aviso}</p>}

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

      <form noValidate onSubmit={(e) => enviar(e, aprobar)} className="flex flex-col gap-5">
        <input type="hidden" name="org" value={org} />
        <input type="hidden" name="documento" value={documento.id} />
        <input type="hidden" name="cantidad" value={facturas.length} />

        {leidas && (
          <ul className="flex flex-col gap-2">
            {facturas.map((f, i) => {
              const cuadra = documento.lector === "ia" && !documento.lectorDebil && f.proveedor && f.fecha && f.importe && facturaFiable(f, hoy);
              const fechaFutura = Boolean(fechas[i] && fechas[i] > hoy);
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
                        {fechas[i] ? fechaLarga(fechas[i]) : "Sin fecha"} · {f.categoria}
                        {f.numero ? ` · Nº ${f.numero}` : ""}
                        {f.lineas.length > 0 ? ` · ${f.lineas.length} productos` : ""}
                      </span>
                      {documento.repetidas[i] && (
                        <span className="text-sm font-semibold text-peligro">
                          {facturas.length > 1
                            ? "Parece que ya la tienes registrada. Si la marcas, se contará dos veces."
                            : "Parece que ya la tienes registrada. Si la metes otra vez, se contará dos veces."}
                        </span>
                      )}
                      {fechaFutura && (
                        <span className="text-sm font-semibold text-peligro">
                          La fecha leída es futura: corrígela en «Corregir algún dato» antes de meterla.
                        </span>
                      )}
                      <span className={`text-sm ${cuadra ? "text-exito" : "text-peligro"}`}>
                        {cuadra
                          ? "✓ Datos completos"
                          : documento.lector === "ia" && !documento.lectorDebil
                            ? "Revisa los datos"
                            : "Lectura básica: comprueba el importe en el documento"}
                      </span>
                    </span>
                    <span className="text-xl font-bold tabular-nums">{euros(leerImporteConSigno(importes[i]) ?? 0)}</span>
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
                      inputMode="text"
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
                      <Campo
                        id={`fecha-${id}`}
                        type="date"
                        name={`fecha_${i}`}
                        value={fechas[i]}
                        onChange={(e) => setFechas((a) => a.map((v, j) => (j === i ? e.target.value : v)))}
                        className={`h-12 ${fechas[i] && fechas[i] > hoy ? "border-peligro" : ""}`}
                      />
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
        <input type="hidden" name="parte" value="facturas" />
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

      {documento.ingresos.length === 0 && <CambiarTipo org={org} id={documento.id} a="cierre" />}
    </Tarjeta>
  );
}

function TarjetaIngresos({
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
  const [estadoAprobar, aprobar, aprobando] = useActionState<EstadoBandeja, FormData>(aprobarIngresosSeguro, {});
  const [estadoDescartar, descartar, descartando] = useActionState<EstadoBandeja, FormData>(descartarParteSeguro, {});
  const dias = documento.ingresos;
  const [incluidos, setIncluidos] = useState<boolean[]>(() => dias.map((d) => d.fecha <= hoy));
  const [ventas, setVentas] = useState<string[]>(() => dias.map((d) => coma(d.venta)));
  const [verDocumento, setVerDocumento] = useState(false);

  const cuantos = incluidos.filter(Boolean).length;
  const total = dias.reduce((t, _, i) => t + (incluidos[i] ? (leerImporte(ventas[i]) ?? 0) : 0), 0);
  const trabajando = aprobando || descartando;

  if (estadoAprobar.ok) {
    return (
      <Tarjeta className="flex flex-col gap-3 border-exito">
        <p className="text-xl font-semibold text-exito">
          ✓ Hecho: {cuantos === 1 ? "1 día metido" : `${cuantos} días metidos`} en Ventas
        </p>
        <p className="text-base">
          {documento.nombre} · {euros(total)}
        </p>
        <Link href={`/n/${org}/ventas`} className="text-base underline">
          Ver mis ventas
        </Link>
      </Tarjeta>
    );
  }
  if (estadoDescartar.ok) {
    return (
      <Tarjeta className="flex flex-col gap-2">
        <p className="text-xl font-semibold">Ingresos descartados</p>
        <p className="text-base text-texto-suave">
          Los ingresos de {documento.nombre} no se han metido. Si cambias de idea, los tienes en «Descartados», más abajo.
        </p>
      </Tarjeta>
    );
  }

  return (
    <Tarjeta className="flex flex-col gap-5 sm:p-6">
      <div className="flex flex-col gap-1">
        <p className="text-base font-medium text-texto-suave">Hoja de ingresos · {dias.length} días</p>
        <h2 className="break-words text-lg font-semibold">{documento.nombre}</h2>
        <p className="text-sm text-texto-suave">Subido {documento.recibido}</p>
      </div>

      {documento.aviso && <p className="rounded-xl bg-fondo px-4 py-3 text-base ring-1 ring-borde">{documento.aviso}</p>}

      <div className="rounded-xl bg-primario/10 px-4 py-4">
        <p className="text-base text-texto-suave">{cuantos} días marcados · suman</p>
        <p className="text-4xl font-bold tabular-nums">{euros(total)}</p>
      </div>

      <form noValidate onSubmit={(e) => enviar(e, aprobar)} className="flex flex-col gap-5">
        <input type="hidden" name="org" value={org} />
        <input type="hidden" name="documento" value={documento.id} />
        <input type="hidden" name="cantidad" value={dias.length} />
        {locales.length === 1 && <input type="hidden" name="local" value={locales[0].id} />}

        {locales.length > 1 && (
          <div className="flex flex-col gap-1.5">
            <Etiqueta htmlFor={`local-${documento.clave}`} className="text-base">
              ¿De qué local son?
            </Etiqueta>
            <select id={`local-${documento.clave}`} name="local" className="h-12 rounded-lg border border-borde bg-superficie px-3 text-base" required>
              {locales.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nombre}
                </option>
              ))}
            </select>
          </div>
        )}

        <ul className="flex flex-col gap-2">
          {dias.map((d, i) => {
            const antes = documento.yaEnVentas?.[d.fecha];
            const futuro = d.fecha > hoy;
            return (
              <li key={d.fecha} className="flex items-center gap-3 rounded-xl border border-borde px-3 py-2">
                <input
                  type="checkbox"
                  name={`incluir_${i}`}
                  checked={incluidos[i]}
                  disabled={futuro}
                  onChange={(e) => setIncluidos((a) => a.map((v, j) => (j === i ? e.target.checked : v)))}
                  className="size-6 shrink-0"
                  aria-label={`Meter el ${fechaLarga(d.fecha)}`}
                />
                <input type="hidden" name={`fecha_${i}`} value={d.fecha} />
                <input type="hidden" name={`efectivo_${i}`} value={coma(d.efectivo)} />
                <input type="hidden" name={`banco_${i}`} value={coma(d.banco)} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-base font-medium">{fechaLarga(d.fecha)}</span>
                  {d.filas && <span className="text-sm text-peligro">{d.filas} filas del mismo día sumadas: compruébalo</span>}
                  {futuro && <span className="text-sm text-peligro">Es un día futuro: no se puede meter</span>}
                  {antes !== undefined && Math.abs(antes - d.venta) >= 0.005 && (
                    <span className="text-sm text-texto-suave">Ahora en Ventas: {euros(antes)} (se cambiaría)</span>
                  )}
                </span>
                <span className="flex items-center gap-1">
                  <Campo
                    name={`venta_${i}`}
                    inputMode="decimal"
                    autoComplete="off"
                    value={ventas[i]}
                    onChange={(e) => setVentas((a) => a.map((v, j) => (j === i ? e.target.value : v)))}
                    className="h-12 w-28 text-right text-lg font-semibold tabular-nums"
                    aria-label={`Venta del ${fechaLarga(d.fecha)}`}
                  />
                  <span className="text-lg font-semibold">€</span>
                </span>
              </li>
            );
          })}
        </ul>

        <Aviso>{estadoAprobar.error}</Aviso>
        <Boton type="submit" disabled={trabajando || cuantos === 0} className="h-16 text-lg">
          {aprobando ? "Metiendo…" : cuantos === 1 ? "Meter 1 día en Ventas" : `Meter ${cuantos} días en Ventas`}
        </Boton>
      </form>

      <form action={descartar} className="flex flex-col gap-2">
        <input type="hidden" name="org" value={org} />
        <input type="hidden" name="documento" value={documento.id} />
        <input type="hidden" name="parte" value="ingresos" />
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
    </Tarjeta>
  );
}
