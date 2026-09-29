import { Tarjeta } from "@/components/ui";
import { FormularioLogin } from "./formulario";

export default function PaginaLogin() {
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <Tarjeta className="w-full max-w-sm">
        <h1 className="mb-1 text-xl font-semibold">Gestión</h1>
        <p className="mb-6 text-sm text-texto-suave">Entra para ver tu negocio.</p>
        <FormularioLogin />
      </Tarjeta>
    </main>
  );
}
