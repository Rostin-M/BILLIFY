"use client";

import { useState } from "react";

import type { SectionProps } from "./types";
import { dividerClass, inputClass, SubHeading, ToggleRow, Unsaved } from "./ui";

const MAX_CATEGORIES = 40;
const MAX_BRANDS = 200;

type Noun = { one: string; many: string };

/** Lista editable de nombres (categorías, marcas) mostrada como chips. */
function NameListEditor({
  title,
  description,
  noun,
  items,
  savedItems,
  max,
  maxLength,
  placeholder,
  onChange,
}: Readonly<{
  title: string;
  description: string;
  noun: Noun;
  items: string[];
  savedItems: string[];
  max: number;
  maxLength: number;
  placeholder: string;
  onChange: (items: string[]) => void;
}>) {
  const [draft, setDraft] = useState("");
  const limitReached = items.length >= max;
  const removedCount = savedItems.filter((c) => !items.includes(c)).length;

  function add() {
    const name = draft.trim();
    if (!name || limitReached) return;
    if (!items.some((c) => c.toLowerCase() === name.toLowerCase())) {
      onChange([...items, name]);
    }
    setDraft("");
  }

  return (
    <div>
      <SubHeading>
        <span className="flex flex-wrap items-center gap-2">
          {title}
          <Unsaved show={items.join("\n") !== savedItems.join("\n")} />
        </span>
      </SubHeading>
      <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">{description}</p>
      <div className="flex gap-2">
        <input
          value={draft}
          maxLength={maxLength}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          disabled={limitReached}
          placeholder={limitReached ? `Límite de ${noun.many} alcanzado` : placeholder}
          aria-label={`Nueva ${noun.one}`}
          className={inputClass}
        />
        <button
          type="button"
          onClick={add}
          disabled={!draft.trim() || limitReached}
          className="shrink-0 rounded-lg border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-medium text-violet-700 transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-violet-500/30 dark:bg-violet-900/20 dark:text-violet-300 dark:hover:bg-violet-900/30"
        >
          Agregar
        </button>
      </div>

      {items.length === 0 ? (
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          Aún no has agregado {noun.many}.
        </p>
      ) : (
        <ul className="mt-3 flex flex-wrap gap-2">
          {items.map((c) => {
            // Las recién agregadas se ven punteadas hasta guardar.
            const isNew = !savedItems.includes(c);
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
                onClick={() => onChange(items.filter((x) => x !== c))}
                aria-label={`Eliminar ${noun.one} ${c}`}
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
          {removedCount === 1 ? `1 ${noun.one} quitada` : `${removedCount} ${noun.many} quitadas`}: {removedCount === 1 ? "se elimina" : "se eliminan"} al guardar.
        </p>
      )}
    </div>
  );
}

export function ProductosSection({ form, saved, update }: SectionProps) {
  return (
    <>
      <NameListEditor
        title="Categorías de productos"
        description={`Aparecerán como sugerencias al crear o editar un producto (máx. ${MAX_CATEGORIES}).`}
        noun={{ one: "categoría", many: "categorías" }}
        items={form.categories}
        savedItems={saved.categories}
        max={MAX_CATEGORIES}
        maxLength={50}
        placeholder="Ej: Bebidas frías"
        onChange={(categories) => update({ categories })}
      />

      <div className={dividerClass} />

      {/* Marcas: también se agregan solas al guardar un producto con una marca nueva */}
      <NameListEditor
        title="Marcas"
        description={`Al escribir la marca de un producto se buscan aquí para elegirla con un toque. Las marcas nuevas que escribas en un producto se agregan solas (máx. ${MAX_BRANDS}).`}
        noun={{ one: "marca", many: "marcas" }}
        items={form.brands}
        savedItems={saved.brands}
        max={MAX_BRANDS}
        maxLength={120}
        placeholder="Ej: Diana"
        onChange={(brands) => update({ brands })}
      />

      <div className={dividerClass} />

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
