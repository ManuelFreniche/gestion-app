import type { MetadataRoute } from "next";

// Permite instalar la app en el móvil desde el navegador («Añadir a pantalla de inicio»).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Gestión",
    short_name: "Gestión",
    description: "Gestión de ventas, gastos y facturas para tu negocio",
    lang: "es",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f7f9",
    theme_color: "#2563eb",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
