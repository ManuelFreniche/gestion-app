import { createServerClient } from "@supabase/ssr";
import { COOKIE_SESION_TEMPORAL, opcionesSesion } from "@/lib/supabase/cookies";
import { NextResponse, type NextRequest } from "next/server";

// Rutas que se pueden abrir sin sesión. Las de Telegram las llaman Telegram y el cron de Vercel, que
// no tienen sesión: cada una comprueba su propio secreto.
const RUTAS_PUBLICAS = ["/login", "/auth", "/api/telegram"];

// Renueva la sesión de Supabase en cada petición y manda al login a quien no la tenga.
// Es solo una comprobación rápida: los permisos reales los decide la base de datos (RLS).
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const temporal = request.cookies.get(COOKIE_SESION_TEMPORAL)?.value === "1";

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, opcionesSesion(options, temporal)),
          );
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();
  const conSesion = Boolean(data?.claims);
  const { pathname } = request.nextUrl;
  const esPublica = RUTAS_PUBLICAS.some((ruta) => pathname.startsWith(ruta));

  if (!conSesion && !esPublica) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
