import { describe, expect, it } from "vitest";

import { PLAN_FEATURES, isPlanFeatureEnabled } from "./plans";

describe("isPlanFeatureEnabled", () => {
  it("habilita las features del plan", () => {
    for (const feature of PLAN_FEATURES.MVP) {
      expect(isPlanFeatureEnabled("MVP", feature)).toBe(true);
    }
  });

  it("rechaza features que el plan no incluye", () => {
    expect(isPlanFeatureEnabled("MVP", "facturacion-electronica")).toBe(false);
  });

  it("rechaza planes desconocidos", () => {
    expect(isPlanFeatureEnabled("PRO", "ventas")).toBe(false);
  });
});
