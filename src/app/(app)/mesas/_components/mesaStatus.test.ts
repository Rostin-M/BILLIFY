import { describe, expect, it } from "vitest";

import { elapsedLabel, itemCount, plural, tableStatus } from "./mesaStatus";

const order = (total: number, quantities: number[]) => ({ total, items: quantities.map((quantity) => ({ quantity })) });

describe("estado de la mesa", () => {
  it("con rondas sin cobrar está pendiente", () => {
    expect(tableStatus([{ orders: [] }, { orders: [order(5000, [1])] }], 0)).toBe("PENDING");
    expect(tableStatus([{ orders: [order(5000, [1])] }], 3)).toBe("PENDING");
  });

  it("sin rondas distingue 'aún no piden' de 'ya se cobró'", () => {
    expect(tableStatus([{ orders: [] }, { orders: [] }], 0)).toBe("NO_ORDERS");
    expect(tableStatus([], 0)).toBe("NO_ORDERS");
    expect(tableStatus([{ orders: [] }], 1)).toBe("CHARGED");
  });
});

describe("textos", () => {
  const opened = new Date("2026-10-20T20:00:00Z");
  const at = (min: number) => opened.getTime() + min * 60_000;

  it("tiempo transcurrido", () => {
    expect(elapsedLabel(opened, at(0))).toBe("recién abierta");
    expect(elapsedLabel(opened, at(45))).toBe("hace 45 min");
    expect(elapsedLabel(opened, at(60))).toBe("hace 1 h");
    expect(elapsedLabel(opened, at(80))).toBe("hace 1 h 20 min");
    // Reloj del dispositivo atrasado: nunca tiempo negativo.
    expect(elapsedLabel(opened, at(-3))).toBe("recién abierta");
  });

  it("cuenta unidades; peso y monto libre cuentan como una", () => {
    expect(itemCount([order(0, [2, 1]), order(0, [0.35])])).toBe(4);
  });

  it("plurales", () => {
    expect(plural(1, "ronda", "rondas")).toBe("1 ronda");
    expect(plural(0, "ronda", "rondas")).toBe("0 rondas");
  });
});
