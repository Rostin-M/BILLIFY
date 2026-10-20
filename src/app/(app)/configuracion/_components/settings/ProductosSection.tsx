"use client";

import { useState } from "react";

import type { SectionProps } from "./types";
import { dividerClass, inputClass, SubHeading, ToggleRow, Unsaved } from "./ui";

const MAX_CATEGORIES = 40;

export function ProductosSection({ form, saved, update }: SectionProps) {
  const [categoryDraft, setCategoryDraft] = useState("");
  const limitReached = form.categories.length >= MAX_CATEGORIES;
  const removedCount = saved.categories.filter((c) => !form.categories.includes(c)).length;

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
        <SubHeading>
          <span className="flex flex-wrap items-center gap-2">
            Categorías de productos
            <Unsaved show={form.categories.join("\n") !== saved.categories.join("\n")} />
          </span>
        </SubHeading>
        <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
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
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            Aún no has agregado categorías.
          </p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-2">
            {form.categories.map((c) => {
              // Las recién agregadas se ven punteadas hasta guardar.
              const isNew = !saved.categories.includes(c);
              return (
              <li
                key={c}
                className={`flex items-center gap-1 rounded-full border py-0.5 pl-3 pr-0.5 text-xs font-medium ${
                  isNew
                    ? "border-dashed border-amber-400 bg-amber-50 text-amber-800 dark:border-amber-500/60 dark:bg-amber-900/20 dark:text-amber-300"
                    : "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/30 dark:bg-violet-900/20 dark:text-violet-300"
                }`}
              >
                {c}
                {isNew && <span className="sr-only">(sin guardar)</span>}
                <button
                  type="button"
                  onClick={() => removeCategory(c)}
                  aria-label={`Eliminar categoría ${c}`}
                  className="flex h-7 w-7 items-center justify-center rounded-full text-base leading-none opacity-70 transition hover:bg-black/10 hover:opacity-100 dark:hover:bg-white/10"
                >
                  ×
                </button>
              </li>
              );
            })}
          </ul>
        )}
        {removedCount > 0 && (
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
            {removedCount === 1 ? "1 categoría quitada" : `${removedCount} categorías quitadas`}: {removedCount === 1 ? "se elimina" : "se eliminan"} al guardar.
          </p>
        )}
      </div>

      <div className={dividerClass} />

      {/* Frutas y verduras (venta por peso) */}
      <div>
        <SubHeading>Frutas y verduras</SubHeading>
        <ToggleRow
          changed={form.produceModuleEnabled !== saved.produceModuleEnabled}
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
