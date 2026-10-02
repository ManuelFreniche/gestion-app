import type { DetalleCorreo, ResultadoCorreo, Tramo } from "./correo";

// Lo que se suma de todas las vueltas de una revisión del correo.
export type AcumuladoCorreo = Pick<ResultadoCorreo, "nuevos" | "repetidos" | "sinLeer" | "encontrados" | "fueraDeTramo" | "sinAdjuntos" | "yaRevisados"> & {
  detalle: DetalleCorreo[];
};

export function acumuladoVacio(): AcumuladoCorreo {
  return { nuevos: 0, repetidos: 0, sinLeer: 0, encontrados: 0, fueraDeTramo: 0, sinAdjuntos: 0, detalle: [] };
}

const MAX_DETALLE = 60;

export function sumarVuelta(a: AcumuladoCorreo, r: ResultadoCorreo): AcumuladoCorreo {
  return {
    nuevos: a.nuevos + r.nuevos,
    repetidos: a.repetidos + r.repetidos,
    sinLeer: a.sinLeer + r.sinLeer,
    // Gmail da el total en cada vuelta: se queda con el más alto, no se suma.
    encontrados: Math.max(a.encontrados, r.encontrados),
    fueraDeTramo: a.fueraDeTramo + r.fueraDeTramo,
    sinAdjuntos: a.sinAdjuntos + r.sinAdjuntos,
    yaRevisados: r.yaRevisados ?? a.yaRevisados,
    detalle: [...a.detalle, ...r.detalle].slice(0, MAX_DETALLE),
  };
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

const fechaCorta = (iso: string) => iso.split("-").reverse().join("/");

// El mensaje que se enseña al terminar: siempre dice qué ha pasado y, si no hay nada nuevo, por qué.
export function resumenCorreo(a: AcumuladoCorreo, tramo?: Tramo): string {
  const frases: string[] = [];
  if (a.nuevos > 0) {
    frases.push(`Listo: ${plural(a.nuevos, "documento nuevo", "documentos nuevos")} en la Bandeja, aquí abajo para que los revises.`);
  } else if (a.encontrados === 0) {
    frases.push(
      tramo
        ? `Gmail no tiene ningún correo con adjuntos entre el ${fechaCorta(tramo.desde)} y el ${fechaCorta(tramo.hasta)}.`
        : a.yaRevisados
          ? `No hay correos nuevos: ya revisé los ${a.yaRevisados} correos con adjuntos de los últimos días. Para volver a traer alguno, usa «Buscar documentos entre dos fechas».`
          : "No hay correos con adjuntos en los últimos días.",
    );
  } else {
    frases.push(`He mirado ${plural(a.encontrados, "correo con adjuntos", "correos con adjuntos")} y no hay nada nuevo para la Bandeja.`);
  }
  const motivos = [
    a.repetidos > 0 && `${plural(a.repetidos, "documento ya estaba", "documentos ya estaban")} en la Bandeja o ya metidos`,
    a.fueraDeTramo > 0 && `${plural(a.fueraDeTramo, "correo cae", "correos caen")} fuera de esas fechas`,
    a.sinAdjuntos > 0 && `${plural(a.sinAdjuntos, "correo no trae", "correos no traen")} ningún PDF ni foto que leer`,
  ].filter(Boolean);
  if (motivos.length > 0) frases.push(`${motivos.join("; ")}.`.replace(/^./, (c) => c.toUpperCase()));
  if (a.sinLeer > 0) {
    frases.push(`${plural(a.sinLeer, "adjunto no se pudo leer", "adjuntos no se pudieron leer")}; se reintentará la próxima vez.`);
  }
  return frases.join(" ");
}
