import { describe, expect, it } from "vitest";

import { type ActionState, planAction, type QuoteResult } from "./planAction";

const now = new Date("2026-09-29T15:00:00Z");
const endsAt = new Date("2026-10-30T15:00:00Z");

const period = (pesos: number): QuoteResult => ({
  ok: true,
  kind: "PERIOD",
  charge: { amountInCents: pesos * 100, vatInCents: 0 },
});

const active: ActionState = { plan: "BUSINESS", billingCycle: "MONTHLY", phase: "ACTIVE", mode: "FULL", endsAt };

describe("planAction", () => {
  it("upgrade: cobra la diferencia y aplica ya", () => {
    const a = planAction({
      state: active,
      target: "PRO",
      cycle: "MONTHLY",
      quote: { ok: true, kind: "UPGRADE", charge: { amountInCents: 1_230_000, vatInCents: 0 } },
      now,
    });
    expect(a.enabled && a.label).toBe("Subir a Pro por 12.300");
  });

  it("mismo plan y ciclo con período vigente: renovar", () => {
    const a = planAction({ state: active, target: "BUSINESS", cycle: "MONTHLY", quote: period(49_900), now });
    expect(a.label).toBe("Renovar por 49.900");
  });

  it("plan menor con período vigente: queda programado", () => {
    const a = planAction({ state: active, target: "BASIC", cycle: "MONTHLY", quote: period(29_900), now });
    expect(a.label).toBe("Cambiar a Básico desde el 30 de octubre");
  });

  it("solo lectura: pagar y empieza ya", () => {
    const a = planAction({
      state: { ...active, phase: "READ_ONLY", mode: "READ_ONLY", endsAt: new Date("2026-09-01T00:00:00Z") },
      target: "BASIC",
      cycle: "ANNUAL",
      quote: period(299_000),
      now,
    });
    expect(a.label).toBe("Pagar 299.000");
  });

  it("prueba: el pago empieza al terminar la prueba", () => {
    const a = planAction({
      state: { ...active, phase: "TRIAL" },
      target: "BUSINESS",
      cycle: "MONTHLY",
      quote: period(49_900),
      now,
    });
    expect(a.label).toBe("Pagar 49.900");
    expect(a.detail).toContain("termine tu prueba");
  });

  it("sin cotización: botón deshabilitado con el motivo", () => {
    const a = planAction({ state: active, target: "PRO", cycle: "MONTHLY", quote: { ok: false, reason: "X" }, now });
    expect(a.enabled).toBe(false);
    expect(a.detail).toBe("X");
  });
});
