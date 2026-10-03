import { NextResponse, type NextRequest } from "next/server";
import { destinoSeguro } from "@/lib/destino-invitacion";
import { crearClienteServidor } from "@/lib/supabase/server";

// El enlace del correo de confirmación vuelve aquí con un código de un solo uso.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const codigo = searchParams.get("code");

  if (codigo) {
    const supabase = await crearClienteServidor();
    const { error } = await supabase.auth.exchangeCodeForSession(codigo);
    if (!error) return NextResponse.redirect(`${origin}${destinoSeguro(searchParams.get("siguiente")) ?? "/negocios"}`);
  }

  return NextResponse.redirect(`${origin}/login`);
}
