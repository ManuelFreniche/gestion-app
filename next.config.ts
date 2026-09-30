import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Paquetes con código nativo o de trabajo en segundo plano: no se empaquetan, se cargan tal cual.
  serverExternalPackages: ["tesseract.js", "@napi-rs/canvas", "sharp"],
  // El OCR necesita el idioma y el motor a mano en el servidor de la bandeja.
  outputFileTracingIncludes: {
    "/n/[org]/bandeja": [
      "./node_modules/@tesseract.js-data/spa/4.0.0_best_int/**",
      "./node_modules/tesseract.js/**",
      "./node_modules/tesseract.js-core/**",
      "./node_modules/@napi-rs/canvas*/**",
    ],
  },
};

export default nextConfig;
