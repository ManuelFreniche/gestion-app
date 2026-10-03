// El código de una invitación vive solo en el enlace: la base de datos guarda su resumen irreversible
// (sha-256), así que nadie puede reconstruir un enlace mirando la tabla. Solo para el servidor.

import { createHash, randomBytes } from "node:crypto";

// 32 bytes al azar en letras y números seguros para una dirección web.
export function codigoNuevo(): string {
  return randomBytes(32).toString("base64url");
}

export function resumenCodigo(codigo: string): string {
  return createHash("sha256").update(codigo, "utf8").digest("hex");
}
