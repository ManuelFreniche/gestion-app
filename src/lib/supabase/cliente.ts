import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

// Cliente de Supabase para el navegador. Solo lleva la clave pública: lo que puede
// hacer cada persona lo decide la base de datos (RLS). Se usa para subir archivos
// directamente a Storage sin pasar por el servidor.
export function crearClienteNavegador() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
