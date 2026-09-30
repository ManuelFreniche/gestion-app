import { NextResponse } from "next/server";
import { registrarDocumento, type ResultadoSubida } from "@/lib/registrar-documento";

// Leer un documento con IA puede tardar unos segundos.
export const maxDuration = 60;

// El navegador llama aquí (y no a una acción de servidor) para poder leer varios documentos a la vez.
// Los permisos los decide la base de datos con la sesión de quien llama.
export async function POST(peticion: Request): Promise<NextResponse<ResultadoSubida>> {
  let cuerpo: Record<string, unknown>;
  try {
    cuerpo = await peticion.json();
  } catch {
    return NextResponse.json({ error: "Petición no válida." }, { status: 400 });
  }
  const texto = (v: unknown) => (typeof v === "string" ? v : undefined);
  const imagenes = Array.isArray(cuerpo.imagenes) ? cuerpo.imagenes.filter((i): i is string => typeof i === "string") : [];
  const paginas = Array.isArray(cuerpo.paginas) ? cuerpo.paginas.filter((p): p is string => typeof p === "string").slice(0, 60) : [];
  const resultado = await registrarDocumento({
    org: texto(cuerpo.org) ?? "",
    ruta: texto(cuerpo.ruta) ?? "",
    nombre: texto(cuerpo.nombre) ?? "documento",
    tipoArchivo: texto(cuerpo.tipoArchivo) ?? "",
    fecha: texto(cuerpo.fecha),
    texto: texto(cuerpo.texto),
    imagenes,
    paginas,
    ocrHecho: cuerpo.ocrHecho === true,
  });
  return NextResponse.json(resultado);
}
