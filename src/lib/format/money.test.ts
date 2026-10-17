import { describe, expect, it } from "vitest";

import { formatCOP } from "./money";

describe("formatCOP", () => {
  it("da el mismo resultado que el formato que usaba cada pantalla", () => {
    const legacy = (v: number) =>
      v.toLocaleString("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0 });
    for (const v of [0, 1800, 27200, 1234500, 99999999, 1500.5, -5000]) {
      expect(formatCOP(v)).toBe(legacy(v));
    }
  });

  it("usa separador de miles con punto y sin decimales en valores enteros", () => {
    expect(formatCOP(1234500).replace(/\s/g, " ")).toBe("$ 1.234.500");
  });
});
