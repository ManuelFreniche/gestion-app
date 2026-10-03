"use client";

import { useState, useTransition } from "react";
import { Aviso, Boton } from "@/components/ui";
import { protegerAccion } from "@/lib/enviar-formulario";
import { marcarTodasPagadas } from "./acciones";

const marcarSeguro = protegerAccion(marcarTodasPagadas);

// Marca como pagadas todas las facturas pendientes de una vez. Pide confirmación porque son muchas; cada una
// se puede volver a poner como pendiente con su propio botón.
export function MarcarTodasPagadas({ org, pendientes }: { org: string; pendientes: number }) {
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState("");
  const [trabajando, empezar] = useTransition();

  const marcar = () =>
    empezar(async () => {
      const datos = new FormData();
      datos.set("org", org);
      const r = await marcarSeguro({}, datos);
      setError(r.error ?? "");
      setConfirmando(false);
    });

  const texto = pendientes === 1 ? "la factura pendiente" : `las ${pendientes} facturas pendientes`;

  return (
    <div className="flex flex-col gap-2">
      {error && <Aviso>{error}</Aviso>}
      {confirmando ? (
        <>
          <p className="text-base font-semibold">¿Marcar {texto} como pagadas?</p>
          <div className="flex gap-2">
            <Boton className="h-14 flex-1 text-base" disabled={trabajando} onClick={marcar}>
              {trabajando ? "Marcando…" : "Sí, marcar"}
            </Boton>
            <Boton variante="secundario" className="h-14 flex-1 text-base" disabled={trabajando} onClick={() => setConfirmando(false)}>
              No
            </Boton>
          </div>
        </>
      ) : (
        <Boton variante="secundario" className="h-14 text-base" onClick={() => setConfirmando(true)}>
          Marcar todas como pagadas ({pendientes})
        </Boton>
      )}
    </div>
  );
}
