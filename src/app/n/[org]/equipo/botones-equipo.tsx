"use client";

import { useState, useTransition } from "react";
import { Aviso, Boton } from "@/components/ui";
import { protegerAccion } from "@/lib/enviar-formulario";
import { anularInvitacionAccion, quitarMiembroAccion } from "./acciones";

const quitarSeguro = protegerAccion(quitarMiembroAccion);
const anularSeguro = protegerAccion(anularInvitacionAccion);

// Botón con confirmación en dos pasos: nada se quita de un solo toque.
function Confirmable({
  etiqueta,
  pregunta,
  enviando,
  error,
  onConfirmar,
}: {
  etiqueta: string;
  pregunta: string;
  enviando: boolean;
  error: string;
  onConfirmar: () => void;
}) {
  const [confirmando, setConfirmando] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      {error && <Aviso>{error}</Aviso>}
      {confirmando ? (
        <div className="flex flex-col gap-2">
          <p className="text-base font-semibold">{pregunta}</p>
          <div className="flex gap-2">
            <Boton variante="principal" className="h-12 flex-1 text-base" disabled={enviando} onClick={onConfirmar}>
              {enviando ? "Un momento…" : `Sí, ${etiqueta.toLowerCase()}`}
            </Boton>
            <Boton variante="secundario" className="h-12 flex-1 text-base" disabled={enviando} onClick={() => setConfirmando(false)}>
              No
            </Boton>
          </div>
        </div>
      ) : (
        <Boton variante="secundario" className="h-12 text-base" onClick={() => setConfirmando(true)}>
          {etiqueta}
        </Boton>
      )}
    </div>
  );
}

export function QuitarMiembro({ org, usuario, nombre }: { org: string; usuario: string; nombre: string }) {
  const [error, setError] = useState("");
  const [enviando, empezar] = useTransition();
  return (
    <Confirmable
      etiqueta="Quitar"
      pregunta={`¿Quitar a ${nombre} del negocio? Dejará de ver los datos.`}
      enviando={enviando}
      error={error}
      onConfirmar={() =>
        empezar(async () => {
          const datos = new FormData();
          datos.set("org", org);
          datos.set("usuario", usuario);
          const r = await quitarSeguro({}, datos);
          setError(r.error ?? "");
        })
      }
    />
  );
}

export function AnularInvitacion({ org, invitacion }: { org: string; invitacion: string }) {
  const [error, setError] = useState("");
  const [enviando, empezar] = useTransition();
  return (
    <Confirmable
      etiqueta="Anular"
      pregunta="¿Anular este enlace? Ya no se podrá usar."
      enviando={enviando}
      error={error}
      onConfirmar={() =>
        empezar(async () => {
          const datos = new FormData();
          datos.set("org", org);
          datos.set("invitacion", invitacion);
          const r = await anularSeguro({}, datos);
          setError(r.error ?? "");
        })
      }
    />
  );
}
