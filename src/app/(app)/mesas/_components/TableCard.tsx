"use client";

import dynamic from "next/dynamic";
import { ArrowRightLeft, ChevronDown, ChevronRight, Pencil, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "~/trpc/react";
import { AddGuestModal } from "./AddGuestModal";
import { AddOrderModal } from "./AddOrderModal";
import { CheckoutModal } from "./CheckoutModal";
import type { MesaForPdf, TableGuestForPdf, TaxLineForPdf } from "~/lib/pdf/MesaPDF";

const MesaPdfActions = dynamic(
  () => import("~/lib/pdf/MesaPdfActions").then((m) => m.MesaPdfActions),
  { ssr: false, loading: () => <span className="text-xs text-slate-500">Generando…</span> },
);

type TaxLine = { name: string; rate: number; amount: number };

type OrderItem = { id: string; name: string; unit: string; price: number; quantity: number; subtotal: number; productId: string };
type Order = { id: string; createdAt: Date; note: string | null; subtotal: number; taxAmount: number; taxLines: unknown; total: number; items: OrderItem[]; userId: string | null; user: { name: string | null } | null };
type Guest = { id: string; name: string; description: string | null; customerId: string | null; orders: Order[] };
type Session = { id: string; name: string; openedAt: Date; user: { name: string | null } | null; guests: Guest[] };

const fmt = (v: number) => v.toLocaleString("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0 });
const fmtTime = (d: Date | string) => new Date(d).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });

type Props = {
  session: Session;
  business: { name: string; document: string; logoUrl?: string | null };
  expanded: boolean;
  onToggleExpanded: () => void;
  focusGuestId?: string | null;
};

export function TableCard({ session, business, expanded, onToggleExpanded, focusGuestId }: Readonly<Props>) {
  const [addingGuest, setAddingGuest] = useState(false);
  const [addingOrderFor, setAddingOrderFor] = useState<{ id: string; name: string } | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [closeConfirm, setCloseConfirm] = useState(false);
  const [confirmDeleteOrder, setConfirmDeleteOrder] = useState<string | null>(null);
  const [confirmRemoveGuest, setConfirmRemoveGuest] = useState<string | null>(null);
  const [showPdf, setShowPdf] = useState(false);
  // Accordion: only one guest expanded at a time per table, to keep the mobile view compact.
  const [expandedGuestId, setExpandedGuestId] = useState<string | null>(null);
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [renamingGuestId, setRenamingGuestId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [movingOrderId, setMovingOrderId] = useState<string | null>(null);
  const [moveTargetGuestId, setMoveTargetGuestId] = useState("");

  function toggleGuestExpanded(guestId: string) {
    setExpandedGuestId((prev) => (prev === guestId ? null : guestId));
  }

  useEffect(() => {
    if (focusGuestId) setExpandedGuestId(focusGuestId);
  }, [focusGuestId]);

  function toggleOrderExpanded(orderId: string) {
    setExpandedOrders((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  }

  const utils = api.useUtils();

  const removeOrder = api.tableSession.removeOrder.useMutation({
    onSuccess: async () => {
      await utils.tableSession.listActive.invalidate();
      await utils.product.search.invalidate();
      await utils.product.list.invalidate();
    },
  });

  const removeGuest = api.tableSession.removeGuest.useMutation({
    onSuccess: async () => { await utils.tableSession.listActive.invalidate(); },
  });

  const renameGuest = api.tableSession.renameGuest.useMutation({
    onSuccess: async () => {
      await utils.tableSession.listActive.invalidate();
      setRenamingGuestId(null);
    },
  });

  const moveOrder = api.tableSession.moveOrder.useMutation({
    onSuccess: async (data) => {
      await utils.tableSession.listActive.invalidate();
      setMovingOrderId(null);
      setMoveTargetGuestId("");
      toast.success(data.message);
    },
  });

  const cancelSession = api.tableSession.cancel.useMutation({
    onSuccess: async (data) => {
      await utils.tableSession.listActive.invalidate();
      await utils.product.search.invalidate();
      await utils.product.list.invalidate();
      toast.success(data.message);
    },
  });

  const closeSession = api.tableSession.close.useMutation({
    onSuccess: async (data) => {
      await utils.tableSession.listActive.invalidate();
      toast.success(data.message);
    },
  });

  const tableTotal = session.guests.reduce((s, g) => s + g.orders.reduce((ss, o) => ss + o.total, 0), 0);
  const openedTime = fmtTime(session.openedAt);
  const guestsWithDebt = session.guests.filter((g) => g.orders.length > 0).length;

  // True when all guests exist but none have pending orders (all paid, awaiting close)
  const allGuestsPaid = session.guests.length > 0 && session.guests.every((g) => g.orders.length === 0);
  const hasAnyOrders = session.guests.some((g) => g.orders.length > 0);

  function buildMesaForPdf(): MesaForPdf {
    return {
      name: session.name,
      openedAt: session.openedAt,
      closedAt: null,
      openedBy: session.user?.name ?? null,
      guests: session.guests.map((g): TableGuestForPdf => ({
        id: g.id,
        name: g.name,
        description: g.description,
        orders: g.orders.map((o) => ({
          id: o.id,
          createdAt: o.createdAt,
          note: o.note,
          servedBy: o.user?.name ?? null,
          subtotal: o.subtotal,
          taxAmount: o.taxAmount,
          taxLines: Array.isArray(o.taxLines) ? (o.taxLines as TaxLineForPdf[]) : null,
          total: o.total,
          items: o.items.map((i) => ({ id: i.id, name: i.name, unit: i.unit, quantity: i.quantity, price: i.price, subtotal: i.subtotal })),
        })),
      })),
    };
  }

  return (
    <>
      {addingGuest && (
        <AddGuestModal sessionId={session.id} onClose={() => setAddingGuest(false)} onSuccess={() => setAddingGuest(false)} />
      )}
      {addingOrderFor && (
        <AddOrderModal guestId={addingOrderFor.id} guestName={addingOrderFor.name} onClose={() => setAddingOrderFor(null)} onSuccess={() => setAddingOrderFor(null)} />
      )}
      {checkingOut && (
        <CheckoutModal
          sessionId={session.id}
          sessionName={session.name}
          guests={session.guests}
          onClose={() => setCheckingOut(false)}
          onSuccess={(msg) => { setCheckingOut(false); toast.success(msg); }}
        />
      )}

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-white/5">
        {/* Header de la mesa */}
        <div className={`flex items-center justify-between gap-3 px-5 py-4 ${expanded ? "border-b border-slate-100 dark:border-white/10" : ""}`}>
          <button
            type="button"
            onClick={onToggleExpanded}
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
            )}
            <div className="min-w-0">
              <h2 className="font-bold text-slate-800 dark:text-white">{session.name}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-500">
                Abierta {openedTime}{session.user?.name ? ` · ${session.user.name}` : ""}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {guestsWithDebt} cliente{guestsWithDebt !== 1 ? "s" : ""} con deuda
                {" · "}
                <span className="font-semibold text-slate-700 dark:text-slate-200">{fmt(tableTotal)}</span>
              </p>
            </div>
          </button>
          <div className="flex shrink-0 flex-wrap gap-2">
            {showPdf ? (
              <MesaPdfActions business={business} mesa={buildMesaForPdf()} fileName={`${session.name.replace(/\s+/g, "-")}.pdf`} onClose={() => setShowPdf(false)} />
            ) : (
              <button onClick={() => setShowPdf(true)} className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-50 dark:border-white/10 dark:bg-transparent dark:text-slate-400">
                PDF
              </button>
            )}
            <button
              onClick={() => setAddingGuest(true)}
              className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700 transition hover:bg-violet-100 dark:border-violet-500/30 dark:bg-violet-900/20 dark:text-violet-300"
            >
              + Cliente
            </button>
            <button
              onClick={() => setCheckingOut(true)}
              disabled={!hasAnyOrders}
              className="rounded-xl bg-violet-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Cobrar
            </button>
          </div>
        </div>

        {expanded && (
        <>
        {removeOrder.error && (
          <div className="mx-5 mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-500/30 dark:bg-red-900/10 dark:text-red-300">
            {removeOrder.error.message}
          </div>
        )}
        {closeSession.error && (
          <div className="mx-5 mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-500/30 dark:bg-red-900/10 dark:text-red-300">
            {closeSession.error.message}
          </div>
        )}

        {/* Banner cuando todos los clientes están cobrados esperando cierre */}
        {allGuestsPaid && (
          <div className="mx-5 mt-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-300">
            Sin deudas pendientes. Puedes cerrar la mesa o esperar un nuevo pedido.
          </div>
        )}

        {/* Guests */}
        <div className="divide-y divide-slate-100 dark:divide-white/5">
          {session.guests.length === 0 ? (
            <p className="px-5 py-6 text-center text-sm text-slate-500 dark:text-slate-500">
              Sin clientes aún. Agrega el primero.
            </p>
          ) : (
            session.guests.map((guest) => {
              const gTotal = guest.orders.reduce((s, o) => s + o.total, 0);
              const isGuestExpanded = expandedGuestId === guest.id;
              return (
                <div key={guest.id} className="px-5 py-4">
                  {/* Guest header */}
                  <div className="mb-3 flex items-center justify-between gap-2">
                    {renamingGuestId === guest.id ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const trimmed = renameValue.trim();
                          if (!trimmed) return;
                          renameGuest.mutate({ guestId: guest.id, name: trimmed });
                        }}
                        className="flex min-w-0 flex-1 items-center gap-1.5"
                      >
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          className="min-w-0 flex-1 rounded-lg border border-violet-300 bg-white px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-violet-200 dark:border-violet-500/50 dark:bg-slate-800 dark:text-white"
                        />
                        <button
                          type="submit"
                          disabled={renameGuest.isPending || !renameValue.trim()}
                          className="rounded-lg bg-violet-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-violet-700 disabled:opacity-50"
                        >
                          Guardar
                        </button>
                        <button
                          type="button"
                          onClick={() => setRenamingGuestId(null)}
                          className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-500 hover:bg-slate-50 dark:border-white/10"
                        >
                          Cancelar
                        </button>
                      </form>
                    ) : (
                      <button
                        type="button"
                        onClick={() => toggleGuestExpanded(guest.id)}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        {isGuestExpanded ? (
                          <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
                        ) : (
                          <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
                        )}
                        <div className="min-w-0">
                          <span className="font-semibold text-slate-700 dark:text-slate-200">{guest.name}</span>
                          {guest.description && (
                            <span className="ml-2 text-xs text-slate-500 dark:text-slate-500">· {guest.description}</span>
                          )}
                          <p className="text-xs text-slate-500 dark:text-slate-500">
                            {guest.orders.length} ronda{guest.orders.length !== 1 ? "s" : ""}
                          </p>
                        </div>
                      </button>
                    )}
                    <div className="flex items-center gap-2 shrink-0">
                      {renamingGuestId !== guest.id && (
                        <>
                      <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{fmt(gTotal)}</span>
                      <button
                        onClick={() => { setRenamingGuestId(guest.id); setRenameValue(guest.name); }}
                        className="text-slate-500 hover:text-violet-500"
                        title="Renombrar cliente"
                        aria-label={`Renombrar a ${guest.name}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      {guest.orders.length === 0 && (
                        confirmRemoveGuest === guest.id ? (
                          <span className="flex flex-wrap items-center justify-end gap-1.5">
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              ¿Quitar a {guest.name}?
                            </span>
                            <button
                              onClick={() => { removeGuest.mutate({ guestId: guest.id }); setConfirmRemoveGuest(null); }}
                              disabled={removeGuest.isPending}
                              className="rounded bg-red-500 px-2 py-0.5 text-xs font-bold text-white hover:bg-red-600 disabled:opacity-50"
                            >
                              Sí, quitar
                            </button>
                            <button
                              onClick={() => setConfirmRemoveGuest(null)}
                              className="rounded border border-slate-200 px-2 py-0.5 text-xs text-slate-500 hover:text-slate-600 dark:border-white/10"
                            >
                              No
                            </button>
                          </span>
                        ) : (
                          <button
                            onClick={() => setConfirmRemoveGuest(guest.id)}
                            className="text-slate-500 hover:text-red-500"
                            title="Quitar cliente"
                            aria-label="Quitar cliente"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )
                      )}
                        </>
                      )}
                    </div>
                  </div>

                  {isGuestExpanded && (
                  <>
                  {/* Orders */}
                  <div className="space-y-2 mb-3 pl-6">
                    {guest.orders.length === 0 ? (
                      <p className="text-xs text-slate-500 dark:text-slate-500 italic">Pagado — sin pedidos pendientes</p>
                    ) : (
                      guest.orders.map((order, oi) => {
                        const isOrderExpanded = expandedOrders.has(order.id);

                        let orderActions: React.ReactNode;
                        if (movingOrderId === order.id) {
                          orderActions = (
                            <span className="flex flex-wrap items-center justify-end gap-1.5">
                              <select
                                value={moveTargetGuestId}
                                onChange={(e) => setMoveTargetGuestId(e.target.value)}
                                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs dark:border-white/10 dark:bg-slate-800 dark:text-white"
                              >
                                <option value="">Mover a...</option>
                                {session.guests.filter((g) => g.id !== guest.id).map((g) => (
                                  <option key={g.id} value={g.id}>{g.name}</option>
                                ))}
                              </select>
                              <button
                                onClick={() => moveOrder.mutate({ orderId: order.id, toGuestId: moveTargetGuestId })}
                                disabled={!moveTargetGuestId || moveOrder.isPending}
                                className="rounded bg-violet-600 px-2 py-0.5 text-xs font-bold text-white hover:bg-violet-700 disabled:opacity-50"
                              >
                                Mover
                              </button>
                              <button
                                onClick={() => { setMovingOrderId(null); setMoveTargetGuestId(""); }}
                                className="rounded border border-slate-200 px-2 py-0.5 text-xs text-slate-500 hover:text-slate-600 dark:border-white/10"
                              >
                                Cancelar
                              </button>
                            </span>
                          );
                        } else if (confirmDeleteOrder === order.id) {
                          orderActions = (
                            <span className="flex flex-wrap items-center justify-end gap-1.5">
                              <span className="text-xs text-slate-500 dark:text-slate-400">
                                ¿Eliminar esta ronda?
                              </span>
                              <button
                                onClick={() => { removeOrder.mutate({ orderId: order.id }); setConfirmDeleteOrder(null); }}
                                disabled={removeOrder.isPending}
                                className="rounded bg-red-500 px-2 py-0.5 text-xs font-bold text-white hover:bg-red-600 disabled:opacity-50"
                              >
                                Sí, eliminar
                              </button>
                              <button
                                onClick={() => setConfirmDeleteOrder(null)}
                                className="rounded border border-slate-200 px-2 py-0.5 text-xs text-slate-500 hover:text-slate-600 dark:border-white/10"
                              >
                                No
                              </button>
                            </span>
                          );
                        } else {
                          orderActions = (
                            <div className="flex shrink-0 items-center gap-2">
                              {session.guests.length > 1 && (
                                <button
                                  onClick={() => { setMovingOrderId(order.id); setMoveTargetGuestId(""); }}
                                  className="text-slate-300 hover:text-violet-500 transition"
                                  title="Mover a otro cliente"
                                  aria-label="Mover ronda a otro cliente"
                                >
                                  <ArrowRightLeft className="h-3.5 w-3.5" />
                                </button>
                              )}
                              <button
                                onClick={() => setConfirmDeleteOrder(order.id)}
                                disabled={removeOrder.isPending}
                                className="text-slate-300 hover:text-red-500 transition disabled:opacity-50"
                                title="Eliminar ronda"
                                aria-label="Eliminar ronda"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          );
                        }

                        return (
                        <div key={order.id} className="rounded-xl border border-slate-100 bg-slate-50 dark:border-white/5 dark:bg-white/5">
                          <div className="flex items-center justify-between gap-2 p-3">
                            <button
                              type="button"
                              onClick={() => toggleOrderExpanded(order.id)}
                              className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                            >
                              {isOrderExpanded ? (
                                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                              )}
                              <span className="min-w-0 truncate text-xs font-semibold text-slate-500 dark:text-slate-400">
                                Ronda #{oi + 1} · <span className="text-slate-700 dark:text-slate-200">{fmt(order.total)}</span>
                              </span>
                            </button>
                            {orderActions}
                          </div>
                          {isOrderExpanded && (
                            <div className="border-t border-slate-200 px-3 pb-3 pt-2 dark:border-white/10">
                              <p className="mb-1.5 text-xs text-slate-500 dark:text-slate-500">
                                {fmtTime(order.createdAt)}
                                {order.note && <span> · {order.note}</span>}
                                {order.user?.name && (
                                  <span className="text-violet-500 dark:text-violet-400"> · {order.user.name}</span>
                                )}
                              </p>
                              <ul className="divide-y divide-slate-100 dark:divide-white/5">
                                {order.items.map((item) => (
                                  <li key={item.id} className="flex justify-between py-1.5 text-sm first:pt-0 last:pb-0">
                                    <span className="text-slate-700 dark:text-slate-300">{item.name} × {item.quantity}</span>
                                    <span className="text-slate-500 dark:text-slate-400">{fmt(item.subtotal)}</span>
                                  </li>
                                ))}
                              </ul>
                              {order.taxAmount > 0 && (
                                <div className="mt-2 space-y-1 border-t border-slate-200 pt-2 dark:border-white/10">
                                  <div className="flex justify-between text-xs text-slate-500">
                                    <span>Subtotal</span><span>{fmt(order.subtotal)}</span>
                                  </div>
                                  {(Array.isArray(order.taxLines) ? (order.taxLines as TaxLine[]) : []).map((tl) => (
                                    <div key={`${tl.name}|${tl.rate}`} className="flex justify-between text-xs text-slate-500">
                                      <span>{tl.name} ({tl.rate}%)</span><span>{fmt(tl.amount)}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        );
                      })
                    )}
                  </div>

                  <button
                    onClick={() => setAddingOrderFor({ id: guest.id, name: guest.name })}
                    className="ml-6 text-xs font-semibold text-violet-600 hover:text-violet-500 dark:text-violet-400 dark:hover:text-violet-300"
                  >
                    + Agregar pedido
                  </button>
                  </>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-col gap-2 border-t border-slate-100 px-5 py-3 dark:border-white/10">
          {/* Cerrar mesa (cuando todos los clientes están cobrados) */}
          {allGuestsPaid && (
            closeConfirm ? (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-slate-500 dark:text-slate-400">¿Cerrar la mesa?</span>
                <button
                  onClick={() => { setCloseConfirm(false); closeSession.mutate({ sessionId: session.id }); }}
                  disabled={closeSession.isPending}
                  className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-violet-700 disabled:opacity-50"
                >
                  Sí, cerrar
                </button>
                <button onClick={() => setCloseConfirm(false)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50 dark:border-white/10">
                  No
                </button>
              </div>
            ) : (
              <button
                onClick={() => setCloseConfirm(true)}
                className="self-start rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700 transition hover:bg-violet-100 dark:border-violet-500/30 dark:bg-violet-900/20 dark:text-violet-300 dark:hover:bg-violet-900/30"
              >
                Cerrar mesa
              </button>
            )
          )}

          {/* Cancelar mesa sin cobrar */}
          {cancelConfirm ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-slate-500 dark:text-slate-400">¿Cancelar mesa sin cobrar? Se restaurará el stock.</span>
              <button
                onClick={() => { setCancelConfirm(false); cancelSession.mutate({ sessionId: session.id }); }}
                disabled={cancelSession.isPending}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
              >
                Sí, cancelar
              </button>
              <button onClick={() => setCancelConfirm(false)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50 dark:border-white/10">
                No
              </button>
            </div>
          ) : (
            <button
              onClick={() => setCancelConfirm(true)}
              className="self-start rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-500 dark:border-white/10 dark:text-slate-500 dark:hover:border-red-500/30 dark:hover:bg-red-900/10 dark:hover:text-red-400"
            >
              Cancelar mesa sin cobrar
            </button>
          )}
        </div>
        </>
        )}
      </div>
    </>
  );
}
