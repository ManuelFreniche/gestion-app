import { hoyEn, sumarDias } from "./cierre";

// A qué hora se pregunta por el cierre, según el día de la semana (0 = domingo) del día que se cierra.
// Los minutos cuentan desde las 00:00 de ese día: 1410 = 23:30 y 1500 = 01:00 de la madrugada siguiente.
// Por ahora es el horario de Alpino's; más adelante será un ajuste de cada negocio.
export const HORARIO_AVISO: Record<number, number> = {
  1: 1410, // lunes 23:30
  2: 1410,
  3: 1410,
  4: 1410, // jueves 23:30
  5: 1500, // viernes: a la 01:00 de la madrugada del sábado
  6: 1500, // sábado: a la 01:00 de la madrugada del domingo
  0: 1410, // domingo 23:30
};

// Margen para preguntar si el cron llega tarde; pasado este tiempo ya no se pregunta por ese día.
const VENTANA_MINUTOS = 5 * 60;

// Antes de esta hora, "hoy" para el cierre sigue siendo el día anterior (se cierra de madrugada).
const HORA_CAMBIO_DE_DIA = 6;

const enMinutos = (fecha: string) => Date.parse(`${fecha}T00:00:00Z`) / 60_000;

function minutosDelDia(zona: string, ahora: Date): number {
  const partes = new Intl.DateTimeFormat("en-GB", { timeZone: zona, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(ahora);
  const valor = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value ?? 0);
  return valor("hour") * 60 + valor("minute");
}

// El día que hay que preguntar ahora mismo, o null si todavía no toca (o ya pasó la ventana).
export function diaACerrar(zona: string, ahora: Date, horario = HORARIO_AVISO): string | null {
  const hoy = hoyEn(zona, ahora);
  const ahoraLocal = enMinutos(hoy) + minutosDelDia(zona, ahora);
  for (const dia of [hoy, sumarDias(hoy, -1)]) {
    const toca = enMinutos(dia) + (horario[new Date(`${dia}T12:00:00Z`).getUTCDay()] ?? 1410);
    if (ahoraLocal >= toca && ahoraLocal < toca + VENTANA_MINUTOS) return dia;
  }
  return null;
}

// El día al que pertenece un cierre pedido a mano con /cierre: de madrugada, el día anterior.
export function diaDeTrabajo(zona: string, ahora: Date): string {
  const hoy = hoyEn(zona, ahora);
  return minutosDelDia(zona, ahora) < HORA_CAMBIO_DE_DIA * 60 ? sumarDias(hoy, -1) : hoy;
}
