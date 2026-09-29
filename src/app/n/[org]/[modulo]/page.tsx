import { notFound } from "next/navigation";
import { Tarjeta } from "@/components/ui";
import { exigirPermiso } from "@/lib/negocio";
import { buscarModulo } from "@/lib/permisos";

// Página provisional de cada módulo hasta que se construya en la Fase 1.
// Ya comprueba el permiso: un empleado que escriba /margenes en la barra recibe un 404.
export default async function PaginaModulo({ params }: PageProps<"/n/[org]/[modulo]">) {
  const { org, modulo: clave } = await params;
  const modulo = buscarModulo(clave);
  if (!modulo) notFound();

  const negocio = await exigirPermiso(org, modulo.permisoVer);
  if (!negocio.modulosActivos.includes(modulo.clave)) notFound();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">{modulo.nombre}</h1>
      <Tarjeta>
        <p className="text-texto-suave">{modulo.descripcion}</p>
        <p className="mt-2 text-sm text-texto-suave">Este módulo llega en la Fase 1.</p>
      </Tarjeta>
    </div>
  );
}
