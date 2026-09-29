import type { ComponentProps } from "react";

// Componentes base. Siguen la API de shadcn/ui para poder cambiarlos por los suyos
// cuando se inicialice shadcn en el proyecto.

function unir(...clases: (string | false | undefined)[]) {
  return clases.filter(Boolean).join(" ");
}

type VarianteBoton = "principal" | "secundario" | "fantasma";

const ESTILO_BOTON: Record<VarianteBoton, string> = {
  principal: "bg-primario text-primario-texto hover:opacity-90",
  secundario: "border border-borde bg-superficie hover:bg-fondo",
  fantasma: "hover:bg-fondo",
};

export function Boton({
  variante = "principal",
  className,
  ...props
}: ComponentProps<"button"> & { variante?: VarianteBoton }) {
  return (
    <button
      className={unir(
        "inline-flex h-11 items-center justify-center rounded-lg px-4 text-sm font-medium transition disabled:opacity-50",
        ESTILO_BOTON[variante],
        className,
      )}
      {...props}
    />
  );
}

export function Campo({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={unir(
        "h-11 w-full rounded-lg border border-borde bg-superficie px-3 text-base outline-none focus:ring-2 focus:ring-primario/40",
        className,
      )}
      {...props}
    />
  );
}

export function Etiqueta({ className, ...props }: ComponentProps<"label">) {
  return <label className={unir("text-sm font-medium", className)} {...props} />;
}

export function Tarjeta({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={unir("rounded-xl border border-borde bg-superficie p-5 shadow-sm", className)}
      {...props}
    />
  );
}

export function Aviso({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-lg bg-peligro/10 px-3 py-2 text-sm text-peligro">
      {children}
    </p>
  );
}
