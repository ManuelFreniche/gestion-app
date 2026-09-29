import Link from "next/link";
import { Tarjeta } from "@/components/ui";
import { cargarNegocio } from "@/lib/negocio";
import { modulosVisibles } from "@/lib/permisos";

export default async function InicioNegocio({ params }: PageProps<"/n/[org]">) {
  const { org } = await params;
  const negocio = await cargarNegocio(org);
  const modulos = modulosVisibles(negocio.permisos, negocio.modulosActivos);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{negocio.nombre}</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modulos.map((m) => (
          <Link key={m.clave} href={`/n/${org}/${m.clave}`}>
            <Tarjeta className="h-full hover:border-primario">
              <h2 className="font-semibold">{m.nombre}</h2>
              <p className="mt-1 text-sm text-texto-suave">{m.descripcion}</p>
            </Tarjeta>
          </Link>
        ))}
      </div>
    </div>
  );
}
