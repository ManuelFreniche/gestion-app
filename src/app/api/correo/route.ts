import { NextResponse } from "next/server";
import { configCorreo, revisarCorreo, tramoValido, type ResultadoCorreo } from "@/lib/correo";
import { crearClienteServidor } from "@/lib/supabase/server";

// Leer varios PDF con IA puede tardar: se procesa todo lo que dé tiempo y se avisa de lo que queda.
export const maxDuration = 60;

// Lo llama la Bandeja al abrirse o al pulsar "Revisar correo". Quien llama debe poder revisar
// documentos en ese negocio; el buzón configurado solo sirve para el negocio indicado en el entorno.
export async function POST(peticion: Request): Promise<NextResponse<ResultadoCorreo>> {
  const vacio = { nuevos: 0, repetidos: 0, sinLeer: 0, quedan: 0 };
  const cuerpo = (await peticion.json().catch(() => ({}))) as { org?: unknown; desde?: unknown; hasta?: unknown };
  const org = typeof cuerpo.org === "string" ? cuerpo.org : "";
  const config = configCorreo();
  if (!config || config.organizacion !== org) {
    return NextResponse.json({ ...vacio, error: "El correo no está conectado en este negocio." }, { status: 404 });
  }
  const supabase = await crearClienteServidor();
  const { data: permisos } = await supabase.rpc("mis_permisos", { p_organizacion: org });
  if (!permisos?.includes("documentos.revisar")) {
    return NextResponse.json({ ...vacio, error: "No tienes permiso para revisar el correo." }, { status: 403 });
  }
  const pideTramo = cuerpo.desde !== undefined || cuerpo.hasta !== undefined;
  const tramo = pideTramo ? tramoValido(cuerpo.desde, cuerpo.hasta) : null;
  if (pideTramo && !tramo) {
    return NextResponse.json({ ...vacio, error: "Las fechas no son válidas: la primera no puede ser posterior a la segunda y el tramo es de un año como máximo." }, { status: 400 });
  }
  return NextResponse.json(await revisarCorreo(supabase, config, 40_000, tramo ?? undefined));
}
