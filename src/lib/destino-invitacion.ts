// A dónde volver tras iniciar sesión cuando se llegó con un enlace de invitación. Sin dependencias de Node para
// poder usarlo también en el proxy.

export const CODIGO_VALIDO = /^[A-Za-z0-9_-]{20,100}$/;

// Solo enlaces de invitación de esta misma web, nunca una dirección ajena (evita redirecciones abiertas).
export function destinoSeguro(siguiente: unknown): string | null {
  if (typeof siguiente !== "string") return null;
  const m = /^\/invitacion\/([^/?#]+)$/.exec(siguiente);
  return m && CODIGO_VALIDO.test(m[1]) ? siguiente : null;
}
