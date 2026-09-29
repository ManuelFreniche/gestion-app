import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";

// Cliente de Supabase para Server Components, Server Actions y Route Handlers.
// Crea uno nuevo en cada petición: nunca se comparte entre usuarios.
export async function crearClienteServidor() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Desde un Server Component no se pueden escribir cookies;
            // el proxy ya renueva la sesión en cada petición.
          }
        },
      },
    },
  );
}
