import { describe, expect, it } from "vitest";

import { matchBrands } from "./BrandCombobox";

const brands = ["Postobón", "Diana", "Nestlé", "Colombina", "La Muñeca", "Natipan"];

describe("matchBrands", () => {
  it("encuentra sin importar mayúsculas ni tildes, primero las que empiezan por el texto", () => {
    expect(matchBrands(brands, "nestle")).toEqual(["Nestlé"]);
    expect(matchBrands(brands, "MUÑ")).toEqual(["La Muñeca"]);
    expect(matchBrands(brands, "na")).toEqual(["Natipan", "Colombina", "Diana"]);
  });

  it("sin texto muestra las marcas en orden alfabético, máximo 8", () => {
    expect(matchBrands(brands, "")).toEqual(["Colombina", "Diana", "La Muñeca", "Natipan", "Nestlé", "Postobón"]);
    const many = Array.from({ length: 12 }, (_, i) => `Marca ${String(i).padStart(2, "0")}`);
    expect(matchBrands(many, " ")).toHaveLength(8);
  });

  it("no sugiere nada si ninguna coincide", () => {
    expect(matchBrands(brands, "zzz")).toEqual([]);
  });
});
