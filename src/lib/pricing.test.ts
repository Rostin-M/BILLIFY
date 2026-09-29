import { describe, expect, it } from "vitest";

import { computeItemTaxBreakdown, computeSaleTotals, type TaxConfig } from "./pricing";

const taxes: TaxConfig[] = [
  { name: "IVA", rate: 19, enabled: true },
  { name: "INC", rate: 8, enabled: true },
  { name: "Deshabilitado", rate: 5, enabled: false },
  { name: "Cero", rate: 0, enabled: true },
];

describe("computeSaleTotals", () => {
  it("sin impuesto automático el subtotal es el total", () => {
    const result = computeSaleTotals([{ price: 1000, quantity: 3, taxSlots: [0] }], taxes, false);
    expect(result).toEqual({ subtotal: 3000, taxAmount: 0, taxLines: [], total: 3000 });
  });

  it("extrae el IVA hacia atrás desde el precio final", () => {
    const result = computeSaleTotals([{ price: 11900, quantity: 1, taxSlots: [0] }], taxes, true);
    expect(result).toEqual({
      subtotal: 10000,
      taxAmount: 1900,
      taxLines: [{ name: "IVA", rate: 19, amount: 1900 }],
      total: 11900,
    });
  });

  it("reparte el impuesto proporcionalmente cuando hay varios", () => {
    const result = computeSaleTotals([{ price: 12700, quantity: 1, taxSlots: [0, 1] }], taxes, true);
    expect(result.subtotal).toBe(10000);
    expect(result.taxLines).toEqual([
      { name: "IVA", rate: 19, amount: 1900 },
      { name: "INC", rate: 8, amount: 800 },
    ]);
    expect(result.taxAmount).toBe(2700);
    expect(result.total).toBe(12700);
  });

  it("ignora impuestos deshabilitados, con tasa 0 o slots inexistentes", () => {
    const result = computeSaleTotals(
      [
        { price: 500, quantity: 2, taxSlots: [2, 3, 9] },
        { price: 700, quantity: 1 },
      ],
      taxes,
      true,
    );
    expect(result).toEqual({ subtotal: 1700, taxAmount: 0, taxLines: [], total: 1700 });
  });

  it("agrupa el mismo impuesto de varias líneas en una sola línea", () => {
    const result = computeSaleTotals(
      [
        { price: 11900, quantity: 1, taxSlots: [0] },
        { price: 5950, quantity: 2, taxSlots: [0] },
        { price: 1000, quantity: 1 },
      ],
      taxes,
      true,
    );
    expect(result.taxLines).toEqual([{ name: "IVA", rate: 19, amount: 3800 }]);
    expect(result.subtotal).toBe(21000);
    expect(result.total).toBe(24800);
  });

  it("maneja una venta vacía", () => {
    expect(computeSaleTotals([], taxes, true)).toEqual({
      subtotal: 0,
      taxAmount: 0,
      taxLines: [],
      total: 0,
    });
  });
});

describe("computeItemTaxBreakdown", () => {
  it("devuelve la línea sin impuestos cuando no aplica ninguno", () => {
    expect(computeItemTaxBreakdown({ price: 2000, quantity: 2 }, taxes)).toEqual({
      subtotal: 4000,
      taxLines: [],
      taxAmount: 0,
    });
  });

  it("desglosa cada impuesto de la línea", () => {
    expect(computeItemTaxBreakdown({ price: 12700, quantity: 2, taxSlots: [0, 1] }, taxes)).toEqual({
      subtotal: 20000,
      taxLines: [
        { name: "IVA", rate: 19, amount: 3800 },
        { name: "INC", rate: 8, amount: 1600 },
      ],
      taxAmount: 5400,
    });
  });
});
