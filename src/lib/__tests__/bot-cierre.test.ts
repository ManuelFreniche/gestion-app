import { describe, expect, it } from "vitest";
import { tecladoTandas, textoFinal, textoTandas } from "../bot-cierre";
import { secretoWebhook } from "../telegram";

const sabores = [
  { id: "1", nombre: "Fresa" },
  { id: "2", nombre: "Chocolate" },
  { id: "3", nombre: "Limón" },
];

describe("tecladoTandas", () => {
  it("pone los sabores de dos en dos y un botón final", () => {
    const t = tecladoTandas(sabores, []);
    expect(t.map((f) => f.length)).toEqual([2, 1, 1]);
    expect(t[0][0]).toEqual({ texto: "Fresa", dato: "s:0" });
    expect(t[2][0]).toEqual({ texto: "Ninguna, listo ✅", dato: "ok" });
  });

  it("marca los elegidos y cambia el botón final", () => {
    const t = tecladoTandas(sabores, [1]);
    expect(t[0][1].texto).toBe("✅ Chocolate");
    expect(t[2][0].texto).toBe("Listo ✅");
  });

  it("los datos de los botones caben en los 64 bytes de Telegram", () => {
    const muchos = Array.from({ length: 80 }, (_, i) => ({ id: String(i), nombre: `Sabor ${i}` }));
    for (const fila of tecladoTandas(muchos, [])) for (const b of fila) expect(Buffer.byteLength(b.dato)).toBeLessThanOrEqual(64);
  });
});

describe("textos del bot", () => {
  it("enseña la fecha y la venta", () => {
    const t = textoTandas("2026-09-30", 512.4);
    expect(t).toContain("miércoles, 30 de septiembre");
    expect(t).toContain("512,40");
  });

  it("resume el cierre con o sin tandas", () => {
    expect(textoFinal(100, ["Fresa", "Limón"])).toContain("Fresa, Limón");
    expect(textoFinal(100, [])).toContain("Ninguna tanda completa");
  });
});

describe("secretoWebhook", () => {
  it("es estable, distinto por token y no contiene el token", () => {
    expect(secretoWebhook("123:abc")).toBe(secretoWebhook("123:abc"));
    expect(secretoWebhook("123:abc")).not.toBe(secretoWebhook("123:abd"));
    expect(secretoWebhook("123:abc")).not.toContain("abc");
    expect(secretoWebhook("123:abc")).toMatch(/^[0-9a-f]{48}$/);
  });
});
