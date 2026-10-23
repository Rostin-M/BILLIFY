"use client";

import { Plus, Truck, X } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { api } from "~/trpc/react";

export type PickedSupplier = { id: string; name: string };

type Props = {
  value: PickedSupplier | null;
  onChange: (supplier: PickedSupplier | null) => void;
  inputClassName: string;
  placeholder?: string;
};

/**
 * Proveedor de una salida o compra: busca entre los guardados (los de siempre salen al
 * escribir) y, si no está, lo crea con el nombre escrito sin salir del formulario.
 */
export function SupplierPicker({ value, onChange, inputClassName, placeholder = "Buscar o crear proveedor..." }: Readonly<Props>) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const utils = api.useUtils();
  const { data: suppliers = [] } = api.supplier.list.useQuery(undefined, { staleTime: 60_000 });

  const createSupplier = api.supplier.create.useMutation({
    onSuccess: async (created) => {
      await utils.supplier.list.invalidate();
      onChange({ id: created.id, name: created.name });
      setQuery("");
      setOpen(false);
      toast.success(`Proveedor "${created.name}" guardado.`);
    },
    onError: (e) => toast.error(e.message),
  });

  if (value) {
    return (
      <div className="flex min-h-11 items-center gap-2 rounded-xl border border-sky-300 bg-sky-50 px-3 dark:border-sky-500/40 dark:bg-sky-900/20">
        <Truck className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-300" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-sky-800 dark:text-sky-200">{value.name}</span>
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label={`Quitar proveedor ${value.name}`}
          className="-mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sky-700 hover:bg-sky-100 dark:text-sky-300 dark:hover:bg-sky-900/40"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  const q = query.trim().toLowerCase();
  const matches = (q ? suppliers.filter((s) => s.name.toLowerCase().includes(q)) : suppliers).slice(0, 8);
  const exact = suppliers.some((s) => s.name.toLowerCase() === q);
  const canCreate = q.length >= 2 && !exact;
  const showList = open && (matches.length > 0 || canCreate);

  return (
    <div className="relative">
      <input
        role="combobox"
        aria-label="Proveedor"
        aria-expanded={showList}
        aria-controls={listId}
        autoComplete="off"
        value={query}
        maxLength={120}
        placeholder={placeholder}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className={inputClassName}
      />
      {showList && (
        <ul id={listId} role="listbox" className="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-slate-800">
          {matches.map((s) => (
            <li key={s.id} role="option" aria-selected={false}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); onChange({ id: s.id, name: s.name }); setQuery(""); setOpen(false); }}
                className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-1.5 text-left hover:bg-sky-50 dark:hover:bg-sky-900/20"
              >
                <span className="min-w-0 truncate text-sm font-medium text-slate-800 dark:text-slate-100">{s.name}</span>
                {s.balance > 0 && (
                  <span className="shrink-0 text-xs font-semibold text-amber-700 dark:text-amber-300">
                    Le debes {s.balance.toLocaleString("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0 })}
                  </span>
                )}
              </button>
            </li>
          ))}
          {canCreate && (
            <li>
              <button
                type="button"
                disabled={createSupplier.isPending}
                onMouseDown={(e) => { e.preventDefault(); createSupplier.mutate({ name: query.trim() }); }}
                className="flex min-h-11 w-full items-center gap-2 border-t border-slate-100 px-3 py-1.5 text-left text-sm font-semibold text-sky-700 hover:bg-sky-50 disabled:opacity-50 dark:border-white/10 dark:text-sky-300 dark:hover:bg-sky-900/20"
              >
                <Plus className="h-4 w-4" aria-hidden />
                {createSupplier.isPending ? "Guardando..." : `Guardar "${query.trim()}" como proveedor nuevo`}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
