import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// Cliente con la clave de servicio: se salta la RLS. Solo para procesos sin persona detrás
// (el bot de Telegram y su aviso nocturno) y solo en servidor. Quien lo use debe acotar
// siempre cada consulta al negocio y al local que corresponda.
export function crearClienteAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !clave) return null;
  return createClient<Database>(url, clave, { auth: { persistSession: false, autoRefreshToken: false } });
}
