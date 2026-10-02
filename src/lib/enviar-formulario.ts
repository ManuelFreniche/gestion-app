import { startTransition, type FormEvent } from "react";

// React 19 vacía el formulario cuando termina su acción, también si falló: la persona perdería lo que ha
// corregido. Enviándolo así, los campos conservan lo escrito y solo cambia lo que dice el servidor.
export function enviar(e: FormEvent<HTMLFormElement>, accion: (datos: FormData) => void) {
  e.preventDefault();
  const datos = new FormData(e.currentTarget);
  startTransition(() => accion(datos));
}

export const SIN_CONEXION = "No he podido conectar con el servidor. Revisa tu conexión y vuelve a intentarlo: si ya estaba hecho, te lo dirá.";

// Una acción de servidor que no llega (sin cobertura en el móvil, tiempo agotado) rechaza su promesa y React
// tira la página entera al "error boundary", con un mensaje en inglés y perdiendo lo que se había escrito.
// Envuelta así, el fallo llega a la pantalla como cualquier otro error, en español y sin perder nada.
export function protegerAccion<E extends { error?: string }, A extends unknown[]>(
  accion: (...args: A) => Promise<E>,
  mensaje = SIN_CONEXION,
): (...args: A) => Promise<E | { error: string }> {
  return async (...args: A) => {
    try {
      return await accion(...args);
    } catch {
      return { error: mensaje };
    }
  };
}
