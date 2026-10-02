"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { Aviso, Boton, Campo, Etiqueta, Tarjeta } from "@/components/ui";
import { enviar, protegerAccion } from "@/lib/enviar-formulario";
import { esFecha, euros, fechaLarga, leerImporte } from "@/lib/cierre";
import {
  marcadoPorDefecto,
  ordenarCierres,
  problemasFila,
  valoresIniciales,
  type CierrePendiente,
  type ValoresFila,
} from "@/lib/cierres-bandeja";
import { aprobarCierres, cambiarTipoDocumento, descartarDocumento, releerDocumentoAccion, type EstadoBandeja } from "./acciones";
import { VistaPrevia } from "./vista-previa";

type Local = { id: string; nombre: string };

// Sin conexión o con el tiempo agotado, el fallo sale en la pantalla en vez de tirar la Bandeja entera.
const aprobarSeguro = protegerAccion(aprobarCierres, "Se cortó la conexión y no sé si se ha guardado. Vuelve a pulsar el botón: si ya estaba metido, te lo dirá.");
const releerSeguro = protegerAccion(releerDocumentoAccion);
const descartarSeguro = protegerAccion(descartarDocumento);
const cambiarTipoSeguro = protegerAccion(cambiarTipoDocumento);

// Todos los cierres de caja que esperan visto bueno, en una sola tarjeta: se ven las cifras de cada día,
// se corrige lo que haga falta, se marcan los que están bien y se meten de una vez en Ventas.
export function TarjetaCierres({
  org,
  cierres,
  locales,
  hoy,
  ventasPorDia,
}: {
  org: string;
  cierres: CierrePendiente[];
  locales: Local[];
  hoy: string;
  // Lo que ya hay en Ventas (fecha → venta), para avisar de lo que se cambiaría.
  ventasPorDia: Record<string, number>;
}) {
  const [estado, aprobar, aprobando] = useActionState<EstadoBandeja, FormData>(aprobarSeguro, {});
  // Lo que la persona ha tocado, por clave de fila: si el lector devuelve datos nuevos, la fila empieza de cero.
  const [valores, setValores] = useState<Record<string, ValoresFila>>({});
  const [elegidos, setElegidos] = useState<Record<string, boolean>>({});

  const filas = ordenarCierres(cierres);
  const valorDe = (c: CierrePendiente) => valores[c.clave] ?? valoresIniciales(c);
  const marcado = (c: CierrePendiente) => elegidos[c.clave] ?? marcadoPorDefecto(c);
  const cambiar = (c: CierrePendiente, parte: Partial<ValoresFila>) => setValores((v) => ({ ...v, [c.clave]: { ...valorDe(c), ...parte } }));

  // Días repetidos entre los marcados: el segundo pisaría al primero.
  const diasMarcados = new Map<string, number>();
  for (const c of filas) {
    const f = valorDe(c).fecha;
    if (marcado(c) && f) diasMarcados.set(f, (diasMarcados.get(f) ?? 0) + 1);
  }

  const marcados = filas.filter(marcado);
  const total = marcados.reduce((t, c) => t + (leerImporte(valorDe(c).venta) ?? 0), 0);
  const conProblemas = marcados.filter((c) => problemasFila(c, valorDe(c), { hoy, repetidoEnLote: (diasMarcados.get(valorDe(c).fecha) ?? 0) > 1, ventasPorDia }).bloqueantes.length > 0).length;

  if (filas.length === 0) {
    if (!estado.ok) return null;
    return (
      <Tarjeta className="flex flex-col gap-3 border-exito">
        <p className="text-xl font-semibold text-exito">
          ✓ Hecho: {estado.metidos === 1 ? "1 cierre metido" : `${estado.metidos ?? ""} cierres metidos`} en Ventas
        </p>
        <Link href={`/n/${org}/ventas`} className="text-base underline">
          Ver mis ventas
        </Link>
      </Tarjeta>
    );
  }

  return (
    <Tarjeta className="flex flex-col gap-5 sm:p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold">{filas.length === 1 ? "Cierre de caja" : `Cierres de caja (${filas.length})`}</h2>
        <p className="text-base text-texto-suave">
          Esto es lo que he leído de cada ticket. Compruébalo, corrige lo que haga falta y mete los que estén bien: nada entra en Ventas sin tu visto bueno.
        </p>
      </div>

      {estado.ok && (
        <p className="rounded-xl border border-exito px-4 py-3 text-base font-semibold text-exito">
          ✓ Hecho: {estado.metidos === 1 ? "1 cierre metido" : `${estado.metidos} cierres metidos`} en Ventas.{" "}
          <Link href={`/n/${org}/ventas`} className="underline">
            Ver mis ventas
          </Link>
        </p>
      )}

      {/* noValidate: el servidor y problemasFila ya validan solo lo marcado; sin esto el navegador bloquea el envío por
            una fecha de una fila desmarcada y no dice nada. */}
      <form noValidate onSubmit={(e) => enviar(e, aprobar)} className="flex flex-col gap-4">
        <input type="hidden" name="org" value={org} />
        <input type="hidden" name="cantidad" value={filas.length} />
        {locales.length === 1 && <input type="hidden" name="local" value={locales[0].id} />}

        <div className="rounded-xl bg-primario/10 px-4 py-4">
          <p className="text-base text-texto-suave">
            {marcados.length === 1 ? "1 día marcado · suma" : `${marcados.length} días marcados · suman`}
          </p>
          <p className="text-4xl font-bold tabular-nums">{euros(total)}</p>
        </div>

        <ul className="flex flex-col gap-3">
          {filas.map((c, i) => {
            const v = valorDe(c);
            const { bloqueantes, avisos } = problemasFila(c, v, { hoy, repetidoEnLote: (diasMarcados.get(v.fecha) ?? 0) > 1, ventasPorDia });
            return (
              <FilaCierre
                key={c.clave}
                org={org}
                indice={i}
                cierre={c}
                valores={v}
                marcado={marcado(c)}
                bloqueantes={bloqueantes}
                avisos={avisos}
                locales={locales}
                hoy={hoy}
                alMarcar={(m) => setElegidos((e) => ({ ...e, [c.clave]: m }))}
                alCambiar={(parte) => cambiar(c, parte)}
              />
            );
          })}
        </ul>

        <Aviso>{estado.error}</Aviso>
        {marcados.length > 0 && conProblemas > 0 && (
          <p className="text-base text-peligro">
            {conProblemas === 1 ? "Hay 1 cierre marcado con un problema:" : `Hay ${conProblemas} cierres marcados con problemas:`} arréglalo o desmárcalo antes de meter.
          </p>
        )}
        <Boton type="submit" disabled={aprobando || marcados.length === 0 || conProblemas > 0} className="h-16 text-lg">
          {aprobando ? "Metiendo…" : marcados.length === 1 ? "Meter 1 día en Ventas" : `Meter ${marcados.length} días en Ventas`}
        </Boton>
      </form>
    </Tarjeta>
  );
}

function FilaCierre({
  org,
  indice,
  cierre: c,
  valores: v,
  marcado,
  bloqueantes,
  avisos,
  locales,
  hoy,
  alMarcar,
  alCambiar,
}: {
  org: string;
  indice: number;
  cierre: CierrePendiente;
  valores: ValoresFila;
  marcado: boolean;
  bloqueantes: string[];
  avisos: string[];
  locales: Local[];
  hoy: string;
  alMarcar: (m: boolean) => void;
  alCambiar: (parte: Partial<ValoresFila>) => void;
}) {
  const [verDocumento, setVerDocumento] = useState(false);
  const [error, setError] = useState<string>();
  const [nota, setNota] = useState<string>();
  const [trabajando, empezar] = useTransition();

  // Acciones sueltas de una fila (volver a leer, no meter, cambiar de tipo): son formularios aparte,
  // no pueden ir dentro del formulario de los cierres, así que se llaman directamente.
  const ejecutar = (accion: (e: EstadoBandeja, f: FormData) => Promise<EstadoBandeja>, extra: Record<string, string> = {}, alTerminar?: string) => {
    const datos = new FormData();
    datos.set("org", org);
    datos.set("documento", c.id);
    for (const [k, valor] of Object.entries(extra)) datos.set(k, valor);
    setError(undefined);
    setNota(undefined);
    empezar(async () => {
      const r = await accion({}, datos);
      if (r.error) setError(r.error);
      else if (alTerminar) setNota(alTerminar);
    });
  };

  const id = `${c.clave}`;
  const problema = marcado && bloqueantes.length > 0;
  return (
    <li className={`flex flex-col gap-3 rounded-xl border px-3 py-3 ${problema ? "border-peligro" : "border-borde"}`}>
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          name={`incluir_${indice}`}
          checked={marcado}
          onChange={(e) => alMarcar(e.target.checked)}
          className="size-7 shrink-0"
          aria-label={`Meter el cierre ${esFecha(v.fecha) ? `del ${fechaLarga(v.fecha)}` : c.nombre}`}
        />
        <input type="hidden" name={`documento_${indice}`} value={c.id} />
        {locales.length > 1 && (
          <select name={`local_${indice}`} className="h-11 rounded-lg border border-borde bg-superficie px-2 text-base" aria-label="Local" required>
            {locales.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nombre}
              </option>
            ))}
          </select>
        )}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-lg font-semibold">{esFecha(v.fecha) ? fechaLarga(v.fecha) : "Sin fecha: elígela"}</span>
          <span className="truncate text-sm text-texto-suave">
            {c.nombre} · recibido {c.recibido}
          </span>
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <Etiqueta htmlFor={`fecha-${id}`}>Día del cierre</Etiqueta>
          <Campo
            id={`fecha-${id}`}
            type="date"
            name={`fecha_${indice}`}
            max={hoy}
            value={v.fecha}
            onChange={(e) => alCambiar({ fecha: e.target.value })}
            className={v.fecha ? "" : "border-peligro"}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Etiqueta htmlFor={`venta-${id}`}>Venta del día (€)</Etiqueta>
          <Campo
            id={`venta-${id}`}
            name={`venta_${indice}`}
            inputMode="decimal"
            autoComplete="off"
            value={v.venta}
            onChange={(e) => alCambiar({ venta: e.target.value })}
            className="text-xl font-semibold"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Etiqueta htmlFor={`efectivo-${id}`}>Efectivo (€)</Etiqueta>
          <Campo
            id={`efectivo-${id}`}
            name={`efectivo_${indice}`}
            inputMode="decimal"
            autoComplete="off"
            value={v.efectivo}
            onChange={(e) => alCambiar({ efectivo: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Etiqueta htmlFor={`banco-${id}`}>Tarjeta (€)</Etiqueta>
          <Campo
            id={`banco-${id}`}
            name={`banco_${indice}`}
            inputMode="decimal"
            autoComplete="off"
            value={v.banco}
            onChange={(e) => alCambiar({ banco: e.target.value })}
          />
        </div>
      </div>

      {bloqueantes.map((b) => (
        <p key={b} className="text-sm font-semibold text-peligro">
          {b}
        </p>
      ))}
      {avisos.map((a) => (
        <p key={a} className="text-sm text-texto-suave">
          {a}
        </p>
      ))}
      {error && <Aviso>{error}</Aviso>}
      {nota && <p className="text-sm text-texto-suave">{nota}</p>}

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-base">
        <button type="button" onClick={() => setVerDocumento((x) => !x)} className="underline" aria-expanded={verDocumento}>
          {verDocumento ? "Ocultar el documento" : "Ver el documento"}
        </button>
        <button type="button" disabled={trabajando} onClick={() => ejecutar(releerSeguro, {}, "Lo he vuelto a leer. Si las cifras no han cambiado, es que el documento dice eso: compruébalo abriéndolo.")} className="underline disabled:opacity-50">
          {trabajando ? "Un momento…" : "Volver a leer"}
        </button>
        <button type="button" disabled={trabajando} onClick={() => ejecutar(descartarSeguro)} className="underline disabled:opacity-50">
          No meter
        </button>
        <button type="button" disabled={trabajando} onClick={() => ejecutar(cambiarTipoSeguro, { tipo: "factura" })} className="text-sm text-texto-suave underline disabled:opacity-50">
          Es una factura
        </button>
      </div>
      {verDocumento && <VistaPrevia url={c.url} tipo={c.tipoArchivo} nombre={c.nombre} />}
    </li>
  );
}
