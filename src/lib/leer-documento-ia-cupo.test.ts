import { describe, expect, it } from "vitest";
import { analizar429, esModeloLigero } from "./leer-documento-ia";

const cuerpo = (quotaId: string, retryDelay?: string, message = "You exceeded your current quota") =>
  JSON.stringify({
    error: {
      code: 429,
      message,
      details: [
        { "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaId }] },
        ...(retryDelay ? [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay }] : []),
      ],
    },
  });

describe("analizar429", () => {
  it("detecta el cupo por día", () => {
    expect(analizar429(cuerpo("GenerateRequestsPerDayPerProjectPerModel-FreeTier")).tipo).toBe("dia");
  });
  it("detecta el cupo por minuto y respeta el tiempo de espera", () => {
    const a = analizar429(cuerpo("GenerateContentInputTokensPerMinutePerModel-FreeTier", "34s"));
    expect(a.tipo).toBe("minuto");
    expect(a.esperaMs).toBe(35_000);
  });
  it("detecta un modelo sin cupo gratuito", () => {
    expect(analizar429(cuerpo("X", undefined, "Quota exceeded, limit: 0")).tipo).toBe("sin-cupo");
  });
  it("con texto sin formato espera un poco", () => {
    expect(analizar429("raro")).toMatchObject({ tipo: "minuto", esperaMs: 20_000 });
  });
});

describe("esModeloLigero", () => {
  it("reconoce los modelos lite", () => {
    expect(esModeloLigero("gemini-2.5-flash-lite")).toBe(true);
    expect(esModeloLigero("gemini-2.5-flash")).toBe(false);
  });
});
