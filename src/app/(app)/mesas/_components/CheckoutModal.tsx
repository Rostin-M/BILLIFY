"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { useSession } from "next-auth/react";

type Order = { subtotal: number; taxAmount: number; taxLines: unknown; total: number };
type Guest = { id: string; name: string; description: string | null; orders: Order[] };
type PaymentMethod = "CASH" | "CARD" | "CREDIT" | "TRANSFER";

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  CASH: "Efectivo",
  CARD: "Tarjeta",
  TRANSFER: "Transferencia",
  CREDIT: "Crédito",
};

const fmt = (v: number) => v.toLocaleString("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0 });

type PayGroup = { id: string; guestIds: string[]; paymentMethod: PaymentMethod };

type Props = {
  sessionId: string;
  sessionName: string;
  guests: Guest[];
  onClose: () => void;
  onSuccess: (msg: string) => void;
};

function guestTotal(guest: Guest) {
  return guest.orders.reduce((s, o) => s + o.total, 0);
}

export function CheckoutModal({ sessionId, sessionName, guests, onClose, onSuccess }: Readonly<Props>) {
  const { data: session } = useSession();
  const cashierName = session?.user?.name ?? "Cajero";

  const [groups, setGroups] = useState<PayGroup[]>(() =>
    guests.map((g) => ({ id: g.id, guestIds: [g.id], paymentMethod: "CASH" as const })),
  );
  const [selectedForGroup, setSelectedForGroup] = useState<Set<string>>(new Set());
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [keepGuests, setKeepGuests] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const utils = api.useUtils();
  const checkout = api.tableSession.checkout.useMutation({
    onSuccess: async (data) => {
      await utils.tableSession.listActive.invalidate();
      await utils.sale.list.invalidate();
      onSuccess(data.message);
    },
    onError: (e) => setError(e.message),
  });

  function groupOf(guestId: string) {
    return groups.find((g) => g.guestIds.includes(guestId));
  }

  function toggleGroupSelect(guestId: string) {
    setSelectedForGroup((prev) => {
      const next = new Set(prev);
      if (next.has(guestId)) next.delete(guestId);
      else next.add(guestId);
      return next;
    });
  }

  function excludeGuest(guestId: string) {
    const grp = groupOf(guestId);
    if (grp && grp.guestIds.length > 1) {
      setGroups((prev) => {
        const g = prev.find((x) => x.id === grp.id);
        if (!g) return prev;
        return [...prev.filter((x) => x.id !== grp.id), ...g.guestIds.map((id) => ({ id, guestIds: [id], paymentMethod: g.paymentMethod }))];
      });
    }
    setSelectedForGroup((prev) => { const next = new Set(prev); next.delete(guestId); return next; });
    setExcluded((prev) => { const next = new Set(prev); next.add(guestId); return next; });
  }

  function includeGuest(guestId: string) {
    setExcluded((prev) => { const next = new Set(prev); next.delete(guestId); return next; });
  }

  function mergeChecked() {
    if (selectedForGroup.size < 2) return;
    const ids = Array.from(selectedForGroup);
    const method = groups.find((g) => ids.some((id) => g.guestIds.includes(id)))?.paymentMethod ?? "CASH";
    setGroups((prev) => {
      const remaining = prev.filter((g) => !g.guestIds.some((id) => ids.includes(id)));
      return [...remaining, { id: ids[0]!, guestIds: ids, paymentMethod: method }];
    });
    setSelectedForGroup(new Set());
  }

  function splitGroup(groupId: string) {
    setGroups((prev) => {
      const grp = prev.find((g) => g.id === groupId);
      if (!grp || grp.guestIds.length < 2) return prev;
      return [...prev.filter((g) => g.id !== groupId), ...grp.guestIds.map((id) => ({ id, guestIds: [id], paymentMethod: grp.paymentMethod }))];
    });
  }

  function setMethod(groupId: string, method: PaymentMethod) {
    setGroups((prev) => prev.map((g) => g.id === groupId ? { ...g, paymentMethod: method } : g));
  }

  function groupLabel(grp: PayGroup) {
    return grp.guestIds.map((id) => guests.find((g) => g.id === id)?.name ?? id).join(" + ");
  }

  function groupTotalAmount(grp: PayGroup) {
    return grp.guestIds.reduce((sum, id) => {
      const g = guests.find((gg) => gg.id === id);
      return sum + (g ? guestTotal(g) : 0);
    }, 0);
  }

  const activeGroups = groups.filter((g) => g.guestIds.every((id) => !excluded.has(id)));
  const mergedGroups = activeGroups.filter((g) => g.guestIds.length > 1);
  const excludedGuests = guests.filter((g) => excluded.has(g.id));
  const includedGuests = guests.filter((g) => !excluded.has(g.id));

  const grandTotal = includedGuests.reduce((s, g) => s + guestTotal(g), 0);
  const noOrders = includedGuests.length === 0 || includedGuests.every((g) => g.orders.length === 0);
  const allIncluded = excluded.size === 0;

  // When keepGuests is on, closing requires all guests to be included
  const wouldCloseTable = !keepGuests && allIncluded;

  function confirm() {
    setError(null);
    if (activeGroups.length === 0) {
      setError("Selecciona al menos un cliente para cobrar.");
      return;
    }
    checkout.mutate({
      sessionId,
      keepGuests,
      groups: activeGroups.map((g) => ({ guestIds: g.guestIds, paymentMethod: g.paymentMethod })),
    });
  }

  let confirmLabel: string;
  if (checkout.isPending) {
    confirmLabel = "Procesando...";
  } else if (keepGuests) {
    confirmLabel = "Cobrar y mantener en mesa";
  } else if (allIncluded) {
    confirmLabel = "Confirmar y cerrar mesa";
  } else {
    confirmLabel = "Cobrar seleccionados";
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-10">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-white/10">
          <div>
            <h2 className="font-semibold text-slate-800 dark:text-white">Cobrar mesa</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {sessionName}
              <span className="ml-2 text-xs text-violet-500 dark:text-violet-400">· cobra: {cashierName}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-slate-200"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4 p-5">
          {noOrders && includedGuests.length > 0 && (
            <p className="text-sm text-amber-600 dark:text-amber-400">
              Los clientes seleccionados no tienen pedidos registrados.
            </p>
          )}

          {/* Individual guests */}
          <div>
            <p className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">
              Clientes — desmarca para cobrar después · toca el nombre para agrupar pago
            </p>
            <div className="space-y-2">
              {guests.map((guest) => {
                if (excluded.has(guest.id)) return null;
                const grp = groupOf(guest.id);
                if (grp && grp.guestIds.length > 1) return null;
                const total = guestTotal(guest);
                const isSelectedForGroup = selectedForGroup.has(guest.id);
                return (
                  <div
                    key={guest.id}
                    className={`flex items-center gap-3 rounded-xl border p-3 transition ${isSelectedForGroup ? "border-violet-400 bg-violet-50 dark:border-violet-500/50 dark:bg-violet-900/20" : "border-slate-200 bg-white dark:border-white/10 dark:bg-white/5"}`}
                  >
                    <input
                      type="checkbox"
                      checked={!excluded.has(guest.id)}
                      onChange={() => excludeGuest(guest.id)}
                      className="h-4 w-4 shrink-0 cursor-pointer accent-violet-600"
                      title="Desmarcar para cobrar después"
                    />
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => toggleGroupSelect(guest.id)}
                    >
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                        {guest.name}
                        {guest.description && <span className="ml-1 text-xs font-normal text-slate-400">· {guest.description}</span>}
                      </p>
                      <p className="text-xs text-slate-400">{guest.orders.length} ronda{guest.orders.length !== 1 ? "s" : ""}</p>
                    </button>
                    <button
                      type="button"
                      className="shrink-0 font-semibold text-slate-800 dark:text-slate-100"
                      onClick={() => toggleGroupSelect(guest.id)}
                    >
                      {fmt(total)}
                    </button>
                    {grp && (
                      <select
                        value={grp.paymentMethod}
                        onChange={(e) => setMethod(grp.id, e.target.value as PaymentMethod)}
                        className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs dark:border-white/10 dark:bg-slate-800 dark:text-white"
                      >
                        {(Object.keys(PAYMENT_LABELS) as PaymentMethod[]).map((m) => (
                          <option key={m} value={m}>{PAYMENT_LABELS[m]}</option>
                        ))}
                      </select>
                    )}
                  </div>
                );
              })}
            </div>

            {selectedForGroup.size >= 2 && (
              <button
                onClick={mergeChecked}
                className="mt-2 w-full rounded-xl border border-violet-300 bg-violet-50 py-2 text-sm font-semibold text-violet-700 transition hover:bg-violet-100 dark:border-violet-500/30 dark:bg-violet-900/20 dark:text-violet-300"
              >
                Pagar juntos ({selectedForGroup.size} clientes seleccionados)
              </button>
            )}
          </div>

          {/* Merged groups */}
          {mergedGroups.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Grupos combinados</p>
              {mergedGroups.map((grp) => (
                <div key={grp.id} className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-500/30 dark:bg-emerald-900/10">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{groupLabel(grp)}</p>
                      <p className="text-xs text-slate-500">{fmt(groupTotalAmount(grp))}</p>
                    </div>
                    <select
                      value={grp.paymentMethod}
                      onChange={(e) => setMethod(grp.id, e.target.value as PaymentMethod)}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs dark:border-white/10 dark:bg-slate-800 dark:text-white"
                    >
                      {(Object.keys(PAYMENT_LABELS) as PaymentMethod[]).map((m) => (
                        <option key={m} value={m}>{PAYMENT_LABELS[m]}</option>
                      ))}
                    </select>
                    <button onClick={() => splitGroup(grp.id)} className="shrink-0 text-xs text-slate-400 hover:text-red-500">
                      Separar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Deferred guests */}
          {excludedGuests.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-400 dark:text-slate-500">Cobrar más tarde</p>
              {excludedGuests.map((guest) => (
                <div key={guest.id} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3 opacity-60 dark:border-white/5 dark:bg-white/5">
                  <input
                    type="checkbox"
                    checked={!excluded.has(guest.id)}
                    onChange={() => includeGuest(guest.id)}
                    className="h-4 w-4 shrink-0 cursor-pointer accent-violet-600"
                    title="Marcar para incluir en cobro"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{guest.name}</p>
                    <p className="text-xs text-slate-400">{fmt(guestTotal(guest))}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Total */}
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-white/10 dark:bg-white/5">
            <span className="font-semibold text-slate-700 dark:text-slate-200">
              {allIncluded ? "Total mesa" : "Total a cobrar"}
            </span>
            <span className="text-xl font-bold text-slate-900 dark:text-white">{fmt(grandTotal)}</span>
          </div>

          {/* Opción: mantener clientes en mesa */}
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-white/10 dark:bg-white/5">
            <input
              type="checkbox"
              checked={keepGuests}
              onChange={(e) => setKeepGuests(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-violet-600"
            />
            <div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                Mantener clientes en mesa
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Los clientes quedan registrados en la mesa sin pedidos, listos para seguir pidiendo. Podrás cerrar la mesa cuando quieras.
              </p>
            </div>
          </label>

          {wouldCloseTable && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Al confirmar se cobrarán todos los clientes y la mesa quedará cerrada automáticamente.
            </p>
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex gap-2">
            <button
              onClick={confirm}
              disabled={noOrders || checkout.isPending || activeGroups.length === 0}
              className="flex-1 rounded-xl bg-violet-600 py-3 text-sm font-bold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {confirmLabel}
            </button>
            <button
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 text-sm text-slate-500 hover:bg-slate-50 dark:border-white/10 dark:text-slate-400"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
