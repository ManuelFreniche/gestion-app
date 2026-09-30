import Link from "next/link";
import { redirect } from "next/navigation";
import { Boton, Tarjeta } from "@/components/ui";
import { NOMBRE_ROL } from "@/lib/permisos";
import { crearClienteServidor } from "@/lib/supabase/server";
import { salir } from "../login/acciones";
import { FormularioNegocio } from "./formulario";
import { MenuNegocios } from "./menu";

// Lista de negocios del usuario. RLS solo devuelve aquellos de los que es miembro.
export default async function PaginaNegocios({ searchParams }: PageProps<"/negocios">) {
  const { todos } = await searchParams;
  const supabase = await crearClienteServidor();
  const { data: claims } = await supabase.auth.getClaims();
  const { data: negocios } = await supabase
    .from("miembros")
    .select("rol, organizaciones (id, nombre)")
    .eq("usuario_id", claims?.claims.sub ?? "")
    .order("creado_en");

  // Con un negocio ya creado se entra directamente en él.
  const primero = negocios?.find((n) => n.organizaciones)?.organizaciones;
  if (primero && !todos) redirect(`/n/${primero.id}`);

  const lista = (negocios ?? []).flatMap((n) => (n.organizaciones ? [{ ...n.organizaciones, rol: n.rol }] : []));

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 p-4">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{lista.length ? "Tus negocios" : "Da de alta tu negocio"}</h1>
        {lista.length > 0 && <MenuNegocios />}
      </header>
      {lista.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {lista.map((org) => (
            <li key={org.id}>
              <Link href={`/n/${org.id}`}>
                <Tarjeta className="flex items-center justify-between hover:border-primario">
                  <span className="font-medium">{org.nombre}</span>
                  <span className="text-sm text-texto-suave">{NOMBRE_ROL[org.rol]}</span>
                </Tarjeta>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Tarjeta>
          <FormularioNegocio />
        </Tarjeta>
      )}
      <form action={salir} className="mt-auto">
        <Boton variante="fantasma" type="submit">
          Cerrar sesión
        </Boton>
      </form>
    </main>
  );
}
