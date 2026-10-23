"use client";

import { Check, Plus } from "lucide-react";
import { useId, useState } from "react";

import { INPUT } from "./productForm";

const MAX_SUGGESTIONS = 8;

// Sin mayúsculas ni tildes: "nestle" encuentra "Nestlé".
const fold = (value: string) =>
  value.trim().toLocaleLowerCase("es-CO").normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Marcas que contienen el texto; primero las que empiezan por él. */
export function matchBrands(brands: readonly string[], query: string): string[] {
  const q = fold(query);
  const scored = brands
    .map((brand) => ({ brand, at: fold(brand).indexOf(q) }))
    .filter((m) => m.at !== -1);
  scored.sort((a, b) => Number(a.at !== 0) - Number(b.at !== 0) || a.brand.localeCompare(b.brand, "es-CO"));
  return scored.slice(0, MAX_SUGGESTIONS).map((m) => m.brand);
}

/**
 * Campo de marca con buscador: al escribir muestra las marcas del negocio que
 * coinciden para elegirlas con un toque. Una marca que no existe se escribe
 * normal y se agrega a la lista al guardar el producto.
 */
export function BrandCombobox({
  id,
  value,
  brands,
  onChange,
}: Readonly<{
  id: string;
  value: string;
  brands: readonly string[];
  onChange: (value: string) => void;
}>) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);

  const matches = matchBrands(brands, value);
  const exact = brands.find((b) => fold(b) === fold(value));
  const isNew = value.trim() !== "" && !exact;
  const showList = open && (matches.length > 0 || isNew);

  function choose(brand: string) {
    onChange(brand);
    setOpen(false);
    setHighlighted(-1);
  }

  return (
    <div className="relative">
      <input
        id={id}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={highlighted >= 0 ? `${listId}-${highlighted}` : undefined}
        autoComplete="off"
        maxLength={120}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setHighlighted(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && matches.length > 0) {
            e.preventDefault();
            setOpen(true);
            setHighlighted((h) => (h + 1) % matches.length);
          } else if (e.key === "ArrowUp" && matches.length > 0) {
            e.preventDefault();
            setHighlighted((h) => (h <= 0 ? matches.length - 1 : h - 1));
          } else if (e.key === "Enter" && showList && highlighted >= 0) {
            // Enter elige la sugerencia marcada en vez de enviar el formulario.
            e.preventDefault();
            choose(matches[highlighted]!);
          } else if (e.key === "Escape" && showList) {
            e.preventDefault();
            setOpen(false);
          }
        }}
        className={INPUT}
        placeholder="Ej: Diana"
      />
      {showList && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-lg dark:border-white/10 dark:bg-slate-900">
          <ul id={listId} role="listbox" aria-label="Marcas guardadas">
            {matches.map((brand, i) => {
              const selected = exact === brand;
              return (
                <li
                  key={brand}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === highlighted}
                  // mousedown + preventDefault: el clic llega antes de que el campo pierda el foco.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(brand);
                  }}
                  onMouseEnter={() => setHighlighted(i)}
                  className={`flex min-h-10 cursor-pointer items-center justify-between gap-2 px-3 ${
                    i === highlighted
                      ? "bg-violet-50 text-violet-800 dark:bg-violet-900/30 dark:text-violet-200"
                      : "text-slate-700 dark:text-slate-200"
                  }`}
                >
                  <span className="truncate">{brand}</span>
                  {selected && <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-300" />}
                </li>
              );
            })}
          </ul>
          {isNew && (
            <p
              className={`flex items-center gap-2 px-3 py-2 text-xs text-slate-500 dark:text-slate-400 ${
                matches.length > 0 ? "border-t border-slate-100 dark:border-white/10" : ""
              }`}
            >
              <Plus aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 break-words">
                «{value.trim()}» es nueva: se agregará a tus marcas al guardar.
              </span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
