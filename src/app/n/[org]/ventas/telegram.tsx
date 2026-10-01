"use client";

import { useActionState } from "react";
import { Aviso, Boton } from "@/components/ui";
import { conectarTelegram, type EstadoTelegram } from "./acciones-telegram";

export function BotonTelegram({ org, local }: { org: string; local: string }) {
  const [estado, accion, enviando] = useActionState<EstadoTelegram, FormData>(conectarTelegram, {});

  return (
    <form action={accion} className="flex flex-col gap-3">
      <input type="hidden" name="org" value={org} />
      <input type="hidden" name="local" value={local} />
      {estado.enlace ? (
        <>
          <a
            href={estado.enlace}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-14 items-center justify-center rounded-lg bg-primario px-4 text-lg font-medium text-primario-texto"
          >
            Abrir Telegram y conectar
          </a>
          <p className="text-sm text-texto-suave">
            En Telegram pulsa «Iniciar». El enlace sirve 15 minutos. Cuando lo hagas, recarga esta página.
          </p>
        </>
      ) : (
        <Boton type="submit" disabled={enviando} className="h-14 text-lg">
          {enviando ? "Preparando…" : "Conectar Telegram"}
        </Boton>
      )}
      <Aviso>{estado.error}</Aviso>
    </form>
  );
}
