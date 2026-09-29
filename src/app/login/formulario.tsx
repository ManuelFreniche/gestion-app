"use client";

import { useActionState, useState } from "react";
import { Aviso, Boton, Campo, Etiqueta } from "@/components/ui";
import { crearCuenta, entrar, type EstadoLogin } from "./acciones";

export function FormularioLogin() {
  const [modo, setModo] = useState<"entrar" | "registro">("entrar");
  const [estado, accion, enviando] = useActionState<EstadoLogin, FormData>(
    modo === "entrar" ? entrar : crearCuenta,
    {},
  );

  return (
    <form action={accion} className="flex flex-col gap-4">
      {modo === "registro" && (
        <div className="flex flex-col gap-1.5">
          <Etiqueta htmlFor="nombre">Tu nombre</Etiqueta>
          <Campo id="nombre" name="nombre" autoComplete="name" required />
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <Etiqueta htmlFor="email">Correo</Etiqueta>
        <Campo id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Etiqueta htmlFor="password">Contraseña</Etiqueta>
        <Campo
          id="password"
          name="password"
          type="password"
          autoComplete={modo === "entrar" ? "current-password" : "new-password"}
          required
        />
      </div>

      <Aviso>{estado.error}</Aviso>
      {estado.mensaje && <p className="text-sm text-texto-suave">{estado.mensaje}</p>}

      <Boton type="submit" disabled={enviando}>
        {modo === "entrar" ? "Entrar" : "Crear cuenta"}
      </Boton>
      <Boton
        type="button"
        variante="fantasma"
        onClick={() => setModo(modo === "entrar" ? "registro" : "entrar")}
      >
        {modo === "entrar" ? "¿No tienes cuenta? Créala" : "Ya tengo cuenta"}
      </Boton>
    </form>
  );
}
