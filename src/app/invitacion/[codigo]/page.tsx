import { Tarjeta } from "@/components/ui";
import { CODIGO_VALIDO } from "@/lib/destino-invitacion";
import { Aceptar } from "./aceptar";

// A esta página se llega con el enlace que manda el dueño de un negocio. El proxy ya ha pedido iniciar sesión
// (y vuelve aquí después). Aceptar es un botón y no pasa solo al abrir el enlace: así una vista previa de
// WhatsApp o del correo no gasta la invitación.
export default async function PaginaInvitacion({ params }: PageProps<"/invitacion/[codigo]">) {
  const { codigo } = await params;
  const valido = CODIGO_VALIDO.test(codigo);

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <Tarjeta className="flex w-full max-w-sm flex-col gap-4">
        <h1 className="text-2xl font-bold">Te han invitado</h1>
        {valido ? (
          <>
            <p className="text-base text-texto-suave">
              Alguien te ha invitado a un negocio en Gestión. Pulsa el botón para entrar con tu cuenta.
            </p>
            <Aceptar codigo={codigo} />
          </>
        ) : (
          <p className="text-base">Este enlace no es correcto. Pide otra invitación a quien te invitó.</p>
        )}
      </Tarjeta>
    </main>
  );
}
