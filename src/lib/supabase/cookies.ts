import type { CookieOptions } from "@supabase/ssr";

// Cookie que avisa de que la persona no quiso recordar la sesión en este dispositivo.
export const COOKIE_SESION_TEMPORAL = "sesion_temporal";

// Con "recordar mi sesión" las cookies de Supabase duran meses; sin ella, se pierden al cerrar el navegador.
export function opcionesSesion(options: CookieOptions, temporal: boolean): CookieOptions {
  if (!temporal || options.maxAge === 0) return options;
  const resto = { ...options };
  delete resto.maxAge;
  delete resto.expires;
  return resto;
}
