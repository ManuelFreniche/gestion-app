import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // sharp tiene código nativo: no se empaqueta, se carga tal cual.
  serverExternalPackages: ["sharp"],
};

export default nextConfig;
