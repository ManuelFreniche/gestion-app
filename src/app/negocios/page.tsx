import { redirect } from "next/navigation";
import { Boton, Tarjeta } from "@/components/ui";
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

  // Con un negocio ya creado se entra directamente en él.
  const primero = negocios?.find((n) => n.organizaciones)?.organizaciones;
  if (primero) redirect(`/n/${primero.id}`);

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Da de alta tu negocio</h1>
        <form action={salir}>
          <Boton variante="fantasma" type="submit">
            Salir
          </Boton>
        </form>
      </header>
      <Tarjeta>
        <FormularioNegocio />
      </Tarjeta>
    </main>
  );
}
