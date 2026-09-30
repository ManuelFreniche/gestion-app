import { FormularioNegocio } from "./formulario";

// Desplegable de arriba a la derecha de Mis negocios: alta de un negocio nuevo.
export function MenuNegocios() {
  return (
    <details className="relative">
      <summary className="flex min-h-11 cursor-pointer list-none items-center rounded-lg border border-borde bg-superficie px-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
        Añadir un negocio ▾
      </summary>
      <div className="absolute right-0 z-20 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-borde bg-superficie p-4 shadow-lg">
        <FormularioNegocio prefijo="lista-" />
      </div>
    </details>
  );
}
