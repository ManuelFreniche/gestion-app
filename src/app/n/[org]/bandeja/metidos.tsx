"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Aviso, Boton } from "@/components/ui";
import { protegerAccion } from "@/lib/enviar-formulario";
import type { ResumenMetido } from "@/lib/metidos";
import { deshacerDocumentoAccion } from "./acciones";

const deshacerSeguro = protegerAccion(deshacerDocumentoAccion);

export type Metido = ResumenMetido & { nombre: string; metido: string };

// Lo que se metió hace poco en las cuentas desde la Bandeja. Si algo entró mal, «Deshacer» lo quita de Ventas
// y de Facturas y devuelve el documento a «Por revisar» para leerlo o corregirlo otra vez. Antes de quitar
// nada pide confirmación y dice exactamente qué se va a quitar.
export function Metidos({ org, documentos }: { org: string; documentos: Metido[] }) {
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [hecho, setHecho] = useState("");
  const [trabajando, empezar] = useTransition();

  // El mensaje de «Hecho» se queda aunque el documento ya no esté en la lista (ha vuelto a la Bandeja).
  if (documentos.length === 0 && !hecho) return null;

  const deshacer = (d: Metido) =>
    empezar(async () => {
      const datos = new FormData();
      datos.set("org", org);
      datos.set("documento", d.id);
      const r = await deshacerSeguro({}, datos);
      setConfirmando(null);
      setErrores((e) => {
        const siguiente = { ...e };
        if (r.error) siguiente[d.id] = r.error;
        else delete siguiente[d.id];
        return siguiente;
      });
      setHecho("mensaje" in r && r.mensaje ? r.mensaje : "");
    });

  return (
    <>
      {hecho && (
        <p role="status" className="rounded-lg bg-fondo px-3 py-2 text-base font-medium">
          {hecho}
        </p>
      )}
      {documentos.length > 0 && (
        <details className="rounded-xl border border-borde px-4 py-3">
          <summary className="cursor-pointer text-base font-medium">Metidos hace poco ({documentos.length})</summary>
          <div className="mt-3 flex flex-col gap-3">
            <p className="text-base text-texto-suave">
              Si algo entró mal en tus cuentas, pulsa «Deshacer»: lo quito de Ventas y de Facturas y vuelve arriba, a «Por revisar», para que lo corrijas.
            </p>
            <ul className="flex flex-col gap-3">
              {documentos.map((d) => (
                <li key={d.id} className="flex flex-col gap-2 rounded-lg border border-borde px-3 py-3">
                  <span className="break-words text-base font-medium">{d.nombre}</span>
                  <span className="text-sm text-texto-suave">
                    {d.etiqueta} · metido {d.metido}
                  </span>
                  {d.sinNada ? (
                    <p className="text-base">Ya no hay nada suyo en tus cuentas (otro documento ocupó su lugar). Deshacerlo solo lo devuelve a la Bandeja.</p>
                  ) : (
                    <ul className="flex flex-col gap-1 text-base">
                      {d.que.map((linea) => (
                        <li key={linea}>• {linea}</li>
                      ))}
                    </ul>
                  )}
                  {d.hayPagadas && (
                    <p className="text-base text-peligro">
                      Alguna factura está marcada como pagada. Márcala como pendiente en{" "}
                      <Link href={`/n/${org}/facturas`} className="underline">
                        Facturas
                      </Link>{" "}
                      y podrás deshacerlo.
                    </p>
                  )}
                  {errores[d.id] && <Aviso>{errores[d.id]}</Aviso>}
                  {confirmando === d.id ? (
                    <div className="flex flex-col gap-2">
                      <p className="text-base font-semibold">¿Quitar de tus cuentas y devolver a la Bandeja?</p>
                      <div className="flex gap-2">
                        <Boton variante="principal" className="h-14 flex-1 text-base" disabled={trabajando} onClick={() => deshacer(d)}>
                          {trabajando ? "Quitando…" : "Sí, quitar"}
                        </Boton>
                        <Boton variante="secundario" className="h-14 flex-1 text-base" disabled={trabajando} onClick={() => setConfirmando(null)}>
                          No
                        </Boton>
                      </div>
                    </div>
                  ) : (
                    <Boton
                      variante="secundario"
                      className="h-14 text-base"
                      disabled={trabajando || d.hayPagadas}
                      onClick={() => {
                        setHecho("");
                        setConfirmando(d.id);
                      }}
                    >
                      Deshacer
                    </Boton>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </details>
      )}
    </>
  );
}
