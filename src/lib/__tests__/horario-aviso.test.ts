import { describe, expect, it } from "vitest";
import { diaACerrar, diaDeTrabajo } from "../horario-aviso";

const Madrid = "Europe/Madrid";
// Septiembre: Madrid va a UTC+2. 30 de septiembre de 2026 es miércoles.

describe("diaACerrar", () => {
  it("de lunes a jueves pregunta a las 23:30 por el mismo día", () => {
    expect(diaACerrar(Madrid, new Date("2026-09-30T21:29:00Z"))).toBeNull(); // 23:29
    expect(diaACerrar(Madrid, new Date("2026-09-30T21:30:00Z"))).toBe("2026-09-30"); // 23:30
    expect(diaACerrar(Madrid, new Date("2026-09-30T21:50:00Z"))).toBe("2026-09-30");
  });

  it("viernes y sábado pregunta a la 01:00 de la madrugada por el día anterior", () => {
    expect(diaACerrar(Madrid, new Date("2026-10-02T21:30:00Z"))).toBeNull(); // viernes 23:30: aún no
    expect(diaACerrar(Madrid, new Date("2026-10-02T22:59:00Z"))).toBeNull(); // sábado 00:59
    expect(diaACerrar(Madrid, new Date("2026-10-02T23:00:00Z"))).toBe("2026-10-02"); // sábado 01:00 -> cierra el viernes
    expect(diaACerrar(Madrid, new Date("2026-10-03T23:10:00Z"))).toBe("2026-10-03"); // domingo 01:10 -> cierra el sábado
  });

  it("el domingo vuelve a las 23:30", () => {
    expect(diaACerrar(Madrid, new Date("2026-10-04T21:30:00Z"))).toBe("2026-10-04");
  });

  it("no pregunta por un día que ya pasó hace mucho", () => {
    expect(diaACerrar(Madrid, new Date("2026-09-30T23:30:00Z"))).toBe("2026-09-30"); // 01:30 del jueves: aún dentro del margen
    expect(diaACerrar(Madrid, new Date("2026-10-01T05:00:00Z"))).toBeNull(); // jueves 07:00: ya no toca el miércoles
    expect(diaACerrar(Madrid, new Date("2026-10-03T05:00:00Z"))).toBeNull(); // sábado 07:00
  });

  it("respeta el cambio horario de invierno (UTC+1)", () => {
    expect(diaACerrar(Madrid, new Date("2026-11-10T22:30:00Z"))).toBe("2026-11-10"); // martes 23:30
    expect(diaACerrar(Madrid, new Date("2026-11-10T21:30:00Z"))).toBeNull(); // martes 22:30
  });
});

describe("diaDeTrabajo", () => {
  it("de madrugada sigue siendo el día anterior", () => {
    expect(diaDeTrabajo(Madrid, new Date("2026-10-02T23:30:00Z"))).toBe("2026-10-02"); // sábado 01:30
    expect(diaDeTrabajo(Madrid, new Date("2026-10-03T03:59:00Z"))).toBe("2026-10-02"); // sábado 05:59
    expect(diaDeTrabajo(Madrid, new Date("2026-10-03T04:00:00Z"))).toBe("2026-10-03"); // sábado 06:00
  });
});
