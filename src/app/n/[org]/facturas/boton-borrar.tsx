"use client";

import { borrarFactura } from "./acciones";

export function BotonBorrar({ org, factura }: { org: string; factura: string }) {
  return (
    <form
      action={borrarFactura}
      onSubmit={(e) => {
        if (!confirm("¿Borrar esta factura? No se puede deshacer.")) e.preventDefault();
      }}
    >
      <input type="hidden" name="org" value={org} />
      <input type="hidden" name="factura" value={factura} />
      <button type="submit" className="text-sm text-peligro underline">
        Borrar
      </button>
    </form>
  );
}
