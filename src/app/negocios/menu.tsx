import Link from "next/link";
import { Boton } from "@/components/ui";
import { salir } from "../login/acciones";
import { FormularioNegocio } from "./formulario";

// Desplegable de arriba a la derecha: cambiar de negocio, añadir uno nuevo y salir.
export function MenuNegocios({
  actual,
  negocios,
  prefijo,
}: {
  actual: string;
  negocios: { id: string; nombre: string }[];
  prefijo: string;
}) {
  const otros = negocios.filter((n) => n.id !== actual);
  return (
    <details className="group relative">
      <summary className="flex min-h-11 cursor-pointer list-none items-center rounded-lg border border-borde bg-superficie px-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
        Añadir un negocio ▾
      </summary>
      <div className="absolute right-0 z-20 mt-2 flex w-72 max-w-[calc(100vw-2rem)] flex-col gap-4 rounded-xl border border-borde bg-superficie p-4 shadow-lg">
        {otros.length > 0 && (
          <ul className="flex flex-col gap-1">
            {otros.map((n) => (
              <li key={n.id}>
                <Link href={`/n/${n.id}`} className="block rounded-lg px-3 py-2 hover:bg-fondo">
                  {n.nombre}
                </Link>
              </li>
            ))}
          </ul>
        )}
        <FormularioNegocio prefijo={prefijo} />
        <form action={salir}>
          <Boton variante="fantasma" type="submit" className="w-full">
            Salir
          </Boton>
        </form>
      </div>
    </details>
  );
}
