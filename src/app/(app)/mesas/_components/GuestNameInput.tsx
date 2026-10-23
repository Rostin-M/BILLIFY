"use client";

import { UserCheck, X } from "lucide-react";
import { useDeferredValue, useId, useState } from "react";
import { api } from "~/trpc/react";

export type LinkedCustomer = { id: string; name: string };

type Props = {
  value: string;
  onChange: (value: string) => void;
  /** Cliente guardado con el que se identificó al comensal (null = solo nombre o seña). */
  customer: LinkedCustomer | null;
  onCustomerChange: (customer: LinkedCustomer | null) => void;
  placeholder?: string;
  ariaLabel: string;
  autoFocus?: boolean;
  className: string;
};

const MIN_QUERY = 2;

/**
 * Nombre o seña del comensal. Mientras se escribe, sugiere clientes guardados que coinciden;
 * elegir uno lo identifica (queda vinculado para fiados e historial). Si no se elige ninguno,
 * queda como nombre suelto.
 */
export function GuestNameInput({ value, onChange, customer, onCustomerChange, placeholder, ariaLabel, autoFocus, className }: Readonly<Props>) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const query = useDeferredValue(value.trim());

  const { data: results = [] } = api.customer.search.useQuery(
    { q: query },
    { enabled: open && !customer && query.length >= MIN_QUERY, staleTime: 30_000 },
  );
  const showList = open && !customer && query.length >= MIN_QUERY && results.length > 0;

  function pick(c: { id: string; name: string }) {
    onCustomerChange({ id: c.id, name: c.name });
    onChange(c.name);
    setOpen(false);
    setActive(-1);
  }

  if (customer) {
    return (
      <div className="flex min-h-11 w-full min-w-0 items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3 dark:border-emerald-500/40 dark:bg-emerald-900/20">
        <UserCheck className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-emerald-800 dark:text-emerald-200">
          {customer.name}
          <span className="ml-1.5 text-xs font-normal text-emerald-700/80 dark:text-emerald-300/80">· cliente guardado</span>
        </span>
        <button
          type="button"
          onClick={() => { onCustomerChange(null); onChange(""); }}
          aria-label={`Quitar a ${customer.name}`}
          className="-mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-emerald-700 hover:bg-emerald-100 dark:text-emerald-300 dark:hover:bg-emerald-900/40"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative w-full min-w-0">
      <input
        aria-label={ariaLabel}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        autoFocus={autoFocus}
        autoComplete="off"
        value={value}
        maxLength={120}
        placeholder={placeholder}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setActive(-1); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!showList) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, results.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, -1)); }
          else if (e.key === "Enter" && active >= 0) { e.preventDefault(); pick(results[active]!); }
          else if (e.key === "Escape") setOpen(false);
        }}
        className={className}
      />
      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-slate-800"
        >
          <li className="px-3 pb-1 pt-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">Clientes guardados</li>
          {results.map((c, i) => (
            <li key={c.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); pick(c); }}
                className={`flex min-h-11 w-full flex-col justify-center px-3 py-1.5 text-left hover:bg-violet-50 dark:hover:bg-violet-900/20 ${i === active ? "bg-violet-50 dark:bg-violet-900/20" : ""}`}
              >
                <span className="text-sm font-medium text-slate-800 dark:text-slate-100">
                  {c.name}
                  {c.alias && <span className="ml-1.5 text-xs font-normal text-slate-500">({c.alias})</span>}
                </span>
                {(c.document ?? c.phone) && (
                  <span className="text-xs text-slate-500">{[c.document, c.phone].filter(Boolean).join(" · ")}</span>
                )}
              </button>
            </li>
          ))}
          <li className="border-t border-slate-100 px-3 pb-1 pt-1.5 text-xs text-slate-500 dark:border-white/10 dark:text-slate-400">
            ¿No es ninguno? Sigue escribiendo y queda como nombre suelto.
          </li>
        </ul>
      )}
    </div>
  );
}
