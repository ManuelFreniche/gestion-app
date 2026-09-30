import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // sharp tiene código nativo y la lectura de correo usa sockets de Node: no se empaquetan, se cargan tal cual.
  serverExternalPackages: ["sharp", "imapflow", "mailparser"],
};

export default nextConfig;
