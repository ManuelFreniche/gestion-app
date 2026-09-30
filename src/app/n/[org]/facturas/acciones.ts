"use server";

import { revalidatePath } from "next/cache";
import { crearClienteServidor } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Marca una factura como pagada o pendiente de pago.
export async function marcarPago(formData: FormData): Promise<void> {
  const org = String(formData.get("org") ?? "");
  const factura = String(formData.get("factura") ?? "");
  const estado = String(formData.get("estado") ?? "");
  if (!UUID.test(org) || !UUID.test(factura) || (estado !== "pagada" && estado !== "pendiente")) return;

  const supabase = await crearClienteServidor();
  await supabase
    .from("facturas_recibidas")
    .update({ estado_pago: estado })
    .eq("id", factura)
    .eq("organizacion_id", org);
  revalidatePath(`/n/${org}/facturas`);
}

// Borra una factura (y sus líneas), por ejemplo si se leyó mal y se metió sola. Si era la única del
// documento, este queda descartado: al volver a subirlo se vuelve a leer.
export async function borrarFactura(formData: FormData): Promise<void> {
  const org = String(formData.get("org") ?? "");
  const factura = String(formData.get("factura") ?? "");
  if (!UUID.test(org) || !UUID.test(factura)) return;

  const supabase = await crearClienteServidor();
  const { data: fila } = await supabase
    .from("facturas_recibidas")
    .select("documento_id")
    .eq("id", factura)
    .eq("organizacion_id", org)
    .maybeSingle();
  await supabase.from("facturas_recibidas").delete().eq("id", factura).eq("organizacion_id", org);

  // Si el documento se queda sin facturas, vuelve a poder leerse al subirlo otra vez.
  if (fila?.documento_id) {
    const { count } = await supabase
      .from("facturas_recibidas")
      .select("id", { count: "exact", head: true })
      .eq("documento_id", fila.documento_id);
    if (count === 0) {
      await supabase.from("documentos_entrantes").update({ estado: "descartado" }).eq("id", fila.documento_id).eq("organizacion_id", org);
    }
  }
  revalidatePath(`/n/${org}/facturas`);
}
