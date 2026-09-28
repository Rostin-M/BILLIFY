"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "~/trpc/react";

type SelectedCustomer = {
  id?: string;
  name: string;
  document?: string;
  email?: string | null;
  isGuestWithDoc?: boolean;
};

type Props = {
  value: SelectedCustomer | null;
  onChange: (customer: SelectedCustomer | null) => void;
};

export const CONSUMIDOR_FINAL: SelectedCustomer = {
  name: "Consumidor Final",
  document: "222222222",
};

export function CustomerSelector({ value, onChange }: Readonly<Props>) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showGuestDoc, setShowGuestDoc] = useState(false);
  const [newName, setNewName] = useState("");
  const [guestDoc, setGuestDoc] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: results = [] } = api.customer.search.useQuery(
    { q: query },
    { enabled: open && !value },
  );

  const utils = api.useUtils();
  const createCustomer = api.customer.create.useMutation({
    onSuccess: (data) => {
      onChange({ id: data.id, name: data.name });
      setShowCreate(false);
      setNewName("");
      setOpen(false);
      setQuery("");
      void utils.customer.search.invalidate();
      void utils.customer.list.invalidate();
    },
  });

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setShowCreate(false);
        setShowGuestDoc(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 dark:border-violet-500/30 dark:bg-violet-900/20">
        <div className="min-w-0 flex-1">
          <span className="text-sm font-medium text-violet-700 dark:text-violet-300">
            {value.name}
          </span>
          {value.document && (
            <span className="ml-2 text-xs text-violet-500 dark:text-violet-400">
              Doc: {value.document}
            </span>
          )}
        </div>
        <button
          onClick={() => onChange(null)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-lg text-violet-400 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20 dark:hover:text-red-400"
          aria-label="Quitar cliente"
        >
          ×
        </button>
      </div>
    );
  }

  const noResultsMessage = query
    ? `Sin coincidencias para "${query}"`
    : "Escribe para buscar por nombre o documento";

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        placeholder="Buscar por nombre o documento..."
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setShowCreate(false);
          setShowGuestDoc(false);
        }}
        onFocus={() => setOpen(true)}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 dark:border-white/10 dark:bg-white/5 dark:text-white dark:focus:border-violet-500 dark:focus:ring-violet-900/30"
      />

      {open && !showCreate && !showGuestDoc && (
        <div className="absolute z-20 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-lg dark:border-white/10 dark:bg-slate-800">
          {/* Opción rápida: Consumidor Final */}
          <div className="border-b border-slate-100 p-2 dark:border-white/10">
            <button
              onClick={() => {
                onChange(CONSUMIDOR_FINAL);
                setOpen(false);
                setQuery("");
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-violet-50 dark:hover:bg-violet-900/20"
            >
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                Consumidor Final
              </span>
              <span className="text-xs text-slate-500">NIT: 222222222</span>
            </button>
          </div>

          {results.length > 0 ? (
            <ul className="max-h-40 overflow-y-auto py-1">
              {results.map((c) => (
                <li key={c.id}>
                  <button
                    className="flex w-full flex-col px-3 py-2 text-left hover:bg-violet-50 dark:hover:bg-violet-900/20"
                    onClick={() => {
                      onChange({ id: c.id, name: c.name, document: c.document ?? undefined, email: c.email });
                      setOpen(false);
                      setQuery("");
                    }}
                  >
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-100">
                      {c.name}
                      {c.alias && <span className="ml-1 font-normal text-slate-500">&quot;{c.alias}&quot;</span>}
                    </span>
                    {(c.document ?? c.phone) && (
                      <span className="text-xs text-slate-500 dark:text-slate-500">
                        {[c.document, c.phone].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-2 text-sm text-slate-500 dark:text-slate-500">
              {noResultsMessage}
            </p>
          )}

          <div className="flex gap-1 border-t border-slate-100 p-2 dark:border-white/10">
            <button
              onClick={() => { setShowCreate(true); setNewName(query); }}
              className="flex-1 rounded-lg px-3 py-1.5 text-left text-xs font-medium text-violet-600 hover:bg-violet-50 dark:text-violet-400 dark:hover:bg-violet-900/20"
            >
              + Registrar cliente
            </button>
            <button
              onClick={() => setShowGuestDoc(true)}
              className="flex-1 rounded-lg px-3 py-1.5 text-left text-xs font-medium text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-white/5"
            >
              Solo documento
            </button>
          </div>
        </div>
      )}

      {/* Formulario: solo ingresar número de documento sin registrar */}
      {showGuestDoc && (
        <div className="absolute z-20 mt-1 w-full rounded-xl border border-slate-200 bg-white p-3 shadow-lg dark:border-white/10 dark:bg-slate-800">
          <p className="mb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
            Documento sin registrar
          </p>
          <input
            autoFocus
            type="text"
            placeholder="Ej: 1020304050"
            value={guestDoc}
            onChange={(e) => setGuestDoc(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 dark:border-white/10 dark:bg-white/5 dark:text-white"
          />
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => {
                if (guestDoc.trim()) {
                  onChange({ name: `Doc. ${guestDoc.trim()}`, document: guestDoc.trim(), isGuestWithDoc: true });
                  setShowGuestDoc(false);
                  setOpen(false);
                  setGuestDoc("");
                }
              }}
              disabled={!guestDoc.trim()}
              className="flex-1 rounded-lg bg-slate-700 py-1.5 text-sm font-semibold text-white transition hover:bg-slate-600 disabled:opacity-50"
            >
              Usar documento
            </button>
            <button
              onClick={() => { setShowGuestDoc(false); setOpen(true); }}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Formulario: registrar nuevo cliente */}
      {showCreate && (
        <div className="absolute z-20 mt-1 w-full rounded-xl border border-slate-200 bg-white p-3 shadow-lg dark:border-white/10 dark:bg-slate-800">
          <p className="mb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
            Nuevo cliente
          </p>
          <input
            autoFocus
            type="text"
            placeholder="Nombre completo *"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 dark:border-white/10 dark:bg-white/5 dark:text-white dark:focus:border-violet-500"
          />
          {createCustomer.error && (
            <p className="mt-1 text-xs text-red-500">{createCustomer.error.message}</p>
          )}
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => createCustomer.mutate({ name: newName })}
              disabled={newName.trim().length < 2 || createCustomer.isPending}
              className="flex-1 rounded-lg bg-violet-600 py-1.5 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:opacity-50"
            >
              {createCustomer.isPending ? "Guardando..." : "Guardar"}
            </button>
            <button
              onClick={() => { setShowCreate(false); setOpen(true); }}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
