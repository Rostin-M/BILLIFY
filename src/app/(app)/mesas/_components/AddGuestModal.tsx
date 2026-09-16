"use client";

import { useState } from "react";
import { api } from "~/trpc/react";

type CustomerResult = { id: string; name: string; document: string | null; phone: string | null };
type Props = { sessionId: string; onClose: () => void; onSuccess: () => void };

export function AddGuestModal({ sessionId, onClose, onSuccess }: Readonly<Props>) {
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerResult | null>(null);
  const [customerQuery, setCustomerQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", document: "", phone: "" });

  const utils = api.useUtils();

  const { data: customerResults = [] } = api.customer.search.useQuery(
    { q: customerQuery },
    { enabled: searchOpen && customerQuery.length >= 1 },
  );

  const addGuest = api.tableSession.addGuest.useMutation({
    onSuccess: async () => {
      await utils.tableSession.listActive.invalidate();
      onSuccess();
    },
  });

  function selectCustomer(c: CustomerResult) {
    setSelectedCustomer(c);
    setForm({ name: c.name, description: "", document: c.document ?? "", phone: c.phone ?? "" });
    setSearchOpen(false);
    setCustomerQuery("");
  }

  function clearCustomer() {
    setSelectedCustomer(null);
    setForm({ name: "", description: "", document: "", phone: "" });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    addGuest.mutate({
      sessionId,
      name: form.name.trim() !== "" ? form.name.trim() : undefined,
      description: form.description.trim() !== "" ? form.description.trim() : undefined,
      document: form.document.trim() !== "" ? form.document.trim() : undefined,
      phone: form.phone.trim() !== "" ? form.phone.trim() : undefined,
      customerId: selectedCustomer?.id,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-slate-800 dark:text-white">Agregar cliente a la mesa</h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-slate-200"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Customer search */}
          <div>
            <p className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">
              Vincular a cliente registrado <span className="font-normal text-slate-400">(opcional)</span>
            </p>
            {selectedCustomer ? (
              <div className="flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 dark:border-violet-500/30 dark:bg-violet-900/20">
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-medium text-violet-700 dark:text-violet-300">{selectedCustomer.name}</span>
                  {selectedCustomer.document && (
                    <span className="ml-2 text-xs text-violet-500 dark:text-violet-400">Doc: {selectedCustomer.document}</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={clearCustomer}
                  aria-label="Quitar cliente"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-lg text-violet-400 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                >
                  ×
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  type="text"
                  placeholder="Buscar por nombre o documento..."
                  value={customerQuery}
                  onChange={(e) => { setCustomerQuery(e.target.value); setSearchOpen(true); }}
                  onFocus={() => setSearchOpen(true)}
                  onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-violet-400 focus:ring-2 dark:border-white/15 dark:bg-slate-800 dark:text-white"
                />
                {searchOpen && customerQuery.length >= 1 && (
                  <div className="absolute z-20 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-lg dark:border-white/10 dark:bg-slate-800">
                    {customerResults.length > 0 ? (
                      <ul className="max-h-40 overflow-y-auto py-1">
                        {customerResults.map((c) => (
                          <li key={c.id}>
                            <button
                              type="button"
                              onMouseDown={(e) => { e.preventDefault(); selectCustomer(c); }}
                              className="flex w-full flex-col px-3 py-2 text-left hover:bg-violet-50 dark:hover:bg-violet-900/20"
                            >
                              <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{c.name}</span>
                              {(c.document ?? c.phone) && (
                                <span className="text-xs text-slate-400">{[c.document, c.phone].filter(Boolean).join(" · ")}</span>
                              )}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="px-3 py-2 text-sm text-slate-400 dark:text-slate-500">
                        Sin resultados para &quot;{customerQuery}&quot;
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-slate-100 dark:bg-white/10" />
            <span className="text-xs text-slate-400 dark:text-slate-500">datos en la mesa</span>
            <div className="h-px flex-1 bg-slate-100 dark:bg-white/10" />
          </div>

          <label className="block space-y-1 text-sm">
            <span className="text-slate-600 dark:text-slate-300">
              Nombre <span className="text-slate-400">(opcional — se auto-asigna si no se escribe)</span>
            </span>
            <input
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="Ej: Carlos, Cliente 1..."
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-violet-400 focus:ring-2 dark:border-white/15 dark:bg-slate-800 dark:text-white"
            />
          </label>

          <label className="block space-y-1 text-sm">
            <span className="text-slate-600 dark:text-slate-300">
              Descripción <span className="text-slate-400">(ej: señor de rojo, mesa del fondo)</span>
            </span>
            <input
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              placeholder="Descripción para identificar..."
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-violet-400 focus:ring-2 dark:border-white/15 dark:bg-slate-800 dark:text-white"
            />
          </label>

          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-white/5 dark:bg-white/5">
            <p className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">
              Datos opcionales — si agrega cédula se guardará en el sistema de clientes
            </p>
            <div className="space-y-2">
              <input
                value={form.document}
                onChange={(e) => setForm((p) => ({ ...p, document: e.target.value }))}
                placeholder="Cédula / documento"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-violet-400 focus:ring-2 dark:border-white/10 dark:bg-slate-800 dark:text-white"
              />
              <input
                value={form.phone}
                type="tel"
                onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                placeholder="Teléfono"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-violet-400 focus:ring-2 dark:border-white/10 dark:bg-slate-800 dark:text-white"
              />
            </div>
          </div>

          {addGuest.error && (
            <p className="text-xs text-red-500">{addGuest.error.message}</p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={addGuest.isPending}
              className="flex-1 rounded-xl bg-violet-600 py-2.5 text-sm font-bold text-white transition hover:bg-violet-500 disabled:opacity-50"
            >
              {addGuest.isPending ? "Agregando..." : "Agregar cliente"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 text-sm text-slate-500 hover:bg-slate-50 dark:border-white/10 dark:text-slate-400"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
