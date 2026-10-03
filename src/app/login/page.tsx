import { Tarjeta } from "@/components/ui";
import { destinoSeguro } from "@/lib/destino-invitacion";
import { FormularioLogin } from "./formulario";

export default async function PaginaLogin({ searchParams }: PageProps<"/login">) {
  const siguiente = destinoSeguro((await searchParams).siguiente);
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <Tarjeta className="w-full max-w-sm">
        <h1 className="mb-1 text-xl font-semibold">Gestión</h1>
        <p className="mb-6 text-sm text-texto-suave">
          {siguiente ? "Te han invitado a un negocio. Entra, o crea tu cuenta si aún no tienes, para aceptar la invitación." : "Entra para ver tu negocio."}
        </p>
        <FormularioLogin siguiente={siguiente} />
      </Tarjeta>
    </main>
  );
}
