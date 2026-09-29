import Link from "next/link";
import { Boton, Tarjeta } from "@/components/ui";
import { NOMBRE_ROL } from "@/lib/permisos";
import { crearClienteServidor } from "@/lib/supabase/server";
import { salir } from "../login/acciones";
import { FormularioNegocio } from "./formulario";

// Lista de negocios del usuario. RLS solo devuelve aquellos de los que es miembro.
export default async function PaginaNegocios() {
  const supabase = await crearClienteServidor();
  const { data: claims } = await supabase.auth.getClaims();
  const { data: negocios } = await supabase
    .from("miembros")
    .select("rol, organizaciones (id, nombre)")
    .eq("usuario_id", claims?.claims.sub ?? "")
    .order("creado_en");

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Tus negocios</h1>
        <form action={salir}>
          <Boton variante="fantasma" type="submit">
            Salir
          </Boton>
        </form>
      </header>

      {negocios && negocios.length > 0 && (
        <ul className="flex flex-col gap-3">
          {negocios.map(
            ({ rol, organizaciones: org }) =>
              org && (
                <li key={org.id}>
                  <Link href={`/n/${org.id}`}>
                    <Tarjeta className="flex items-center justify-between hover:border-primario">
                      <span className="font-medium">{org.nombre}</span>
                      <span className="text-sm text-texto-suave">{NOMBRE_ROL[rol]}</span>
                    </Tarjeta>
                  </Link>
                </li>
              ),
          )}
        </ul>
      )}

      <Tarjeta>
        <h2 className="mb-4 font-semibold">
          {negocios?.length ? "Añadir otro negocio" : "Da de alta tu negocio"}
        </h2>
        <FormularioNegocio />
      </Tarjeta>
    </main>
  );
}
