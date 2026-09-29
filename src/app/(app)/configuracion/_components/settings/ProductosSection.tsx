"use client";

import { useState } from "react";

import type { SectionProps } from "./types";
import { CheckboxRow, dividerClass, inputClass, SubHeading } from "./ui";

const MAX_CATEGORIES = 40;

export function ProductosSection({ form, update }: SectionProps) {
  const [categoryDraft, setCategoryDraft] = useState("");
  const limitReached = form.categories.length >= MAX_CATEGORIES;

  function addCategory() {
    const name = categoryDraft.trim();
    if (!name || limitReached) return;
    if (!form.categories.some((c) => c.toLowerCase() === name.toLowerCase())) {
      update({ categories: [...form.categories, name] });
    }
    setCategoryDraft("");
  }

  function removeCategory(name: string) {
    update({ categories: form.categories.filter((c) => c !== name) });
  }

  return (
    <>
      {/* Categorías de productos */}
      <div>
        <SubHeading>Categorías de productos</SubHeading>
        <p className="mb-3 text-xs text-slate-500 dark:text-slate-500">
          Aparecerán como sugerencias al crear o editar un producto (máx. {MAX_CATEGORIES}).
        </p>
        <div className="flex gap-2">
          <input
            value={categoryDraft}
            maxLength={50}
            onChange={(e) => setCategoryDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCategory();
              }
            }}
            disabled={limitReached}
            placeholder={limitReached ? "Límite de categorías alcanzado" : "Ej: Bebidas frías"}
            aria-label="Nueva categoría"
            className={inputClass}
          />
          <button
            type="button"
            onClick={addCategory}
            disabled={!categoryDraft.trim() || limitReached}
            className="shrink-0 rounded-lg border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-medium text-violet-700 transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-violet-500/30 dark:bg-violet-900/20 dark:text-violet-300 dark:hover:bg-violet-900/30"
          >
            Agregar
          </button>
        </div>

        {form.categories.length === 0 ? (
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-500">
            Aún no has agregado categorías.
          </p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-2">
            {form.categories.map((c) => (
              <li
                key={c}
                className="flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 py-1 pl-3 pr-1.5 text-xs font-medium text-violet-700 dark:border-violet-500/30 dark:bg-violet-900/20 dark:text-violet-300"
              >
                {c}
                <button
                  type="button"
                  onClick={() => removeCategory(c)}
                  aria-label={`Eliminar categoría ${c}`}
                  className="flex h-4 w-4 items-center justify-center rounded-full text-violet-400 transition hover:bg-violet-200 hover:text-violet-700 dark:text-violet-500 dark:hover:bg-violet-800/40 dark:hover:text-violet-200"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={dividerClass} />

      {/* Frutas y verduras (venta por peso) */}
      <div>
        <SubHeading>Frutas y verduras</SubHeading>
        <CheckboxRow
          checked={form.produceModuleEnabled}
          onChange={(checked) => update({ produceModuleEnabled: checked })}
          title="Habilitar venta por peso"
          description={
            <>
              Actívalo si vendes productos por peso (ej. tomate, papa): habilita la opción
              &quot;Se vende por peso&quot; en el formulario de productos. Si no, déjalo
              desactivado para no complicar el formulario.
            </>
          }
        />
      </div>
    </>
  );
}
