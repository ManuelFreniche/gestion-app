// Versión del código que está funcionando (la fija Vercel en cada despliegue): sirve para saber, sin
// dudas, si una corrección ya está en la web que se está usando.
export function versionDesplegada(): string {
  return process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local";
}
