// Qué decirle a la persona cuando la base de datos rechaza algo de la Bandeja.
//
// Las funciones de la base de datos avisan con su propio mensaje, ya en español y sin jerga, cuando una regla
// del negocio no se cumple (una fecha futura, un cobro mayor que la venta, un día con notas que se perderían):
// ese texto se enseña tal cual. Lo demás se resume con una frase.

export type ErrorBd = { code?: string | null; message?: string | null };

// Los errores propios (raise exception sin código) llegan como P0001: su mensaje es para la persona.
export function mensajeDeLaRegla(error: ErrorBd): string | null {
  if (error.code !== "P0001") return null;
  const texto = (error.message ?? "").trim();
  return texto ? texto.slice(0, 300) : null;
}

export function mensajeDeshacer(error: ErrorBd): string {
  const regla = mensajeDeLaRegla(error);
  if (regla) return regla;
  if (error.code === "P0002") return "Ya no se puede deshacer: puede que ya lo hayas deshecho. Recarga la página.";
  return "No se pudo deshacer. Inténtalo de nuevo.";
}

// Al meter una factura: la misma factura (proveedor, número, fecha e importe) no se registra dos veces.
export const FACTURA_REPETIDA =
  "Alguna de estas facturas ya está registrada (mismo proveedor, número, fecha e importe). Desmárcala y vuelve a intentarlo.";
