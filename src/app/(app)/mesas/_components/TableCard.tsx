"use client";

import dynamic from "next/dynamic";
import { ArrowRightLeft, ChevronDown, ChevronRight, Clock, FileText, Pencil, Plus, StickyNote, Trash2, UserMinus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "~/trpc/react";
import { AddGuestModal } from "./AddGuestModal";
import { AddOrderModal } from "./AddOrderModal";
import { CheckoutModal } from "./CheckoutModal";
import { elapsedLabel, guestTotal, itemCount, LONG_OPEN_MINUTES, minutesSince, plural, tableStatus, type TableStatus } from "./mesaStatus";
import type { MesaForPdf, TableGuestForPdf, TaxLineForPdf } from "~/lib/pdf/MesaPDF";
import { formatCOP as fmt } from "~/lib/format/money";

const MesaPdfActions = dynamic(
  () => import("~/lib/pdf/MesaPdfActions").then((m) => m.MesaPdfActions),
  { ssr: false, loading: () => <span className="text-xs text-slate-500">Generando…</span> },
);

type TaxLine = { name: string; rate: number; amount: number };

type OrderItem = { id: string; name: string; unit: string; price: number; quantity: number; subtotal: number; productId: string };
type Order = { id: string; createdAt: Date; note: string | null; subtotal: number; taxAmount: number; taxLines: unknown; total: number; items: OrderItem[]; userId: string | null; user: { name: string | null } | null };
type Guest = { id: string; name: string; description: string | null; customerId: string | null; orders: Order[] };
type Session = { id: string; name: string; openedAt: Date; user: { name: string | null } | null; _count: { sales: number }; guests: Guest[] };

const fmtTime = (d: Date | string) => new Date(d).toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit" });

const STATUS_BADGE: Record<TableStatus, { label: string; className: string }> = {
  PENDING: { label: "Por cobrar", className: "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-200" },
  NO_ORDERS: { label: "Sin pedidos", className: "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300" },
  CHARGED: { label: "Cobrada", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200" },
};

const iconButton =
  "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-200";
const smallGhost =
  "inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5";

type Props = {
  session: Session;
  business: { name: string; document: string; logoUrl?: string | null };
  expanded: boolean;
  onToggleExpanded: () => void;
  now: number;
  focusGuestId?: string | null;
  /** Se llama con las ventas facturadas del cobro (el modal vive en MesasClient: la mesa puede cerrarse). */
  onInvoices?: (saleIds: string[]) => void;
};

export function TableCard({ session, business, expanded, onToggleExpanded, now, focusGuestId, onInvoices }: Readonly<Props>) {
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

  const utils = api.useUtils();

  const removeOrder = api.tableSession.removeOrder.useMutation({
    onSuccess: async (data) => {
      await utils.tableSession.listActive.invalidate();
      await utils.product.search.invalidate();
      await utils.product.list.invalidate();
      toast.success(data.message);
    },
  });

  const removeGuest = api.tableSession.removeGuest.useMutation({
    onSuccess: async (data) => {
      await utils.tableSession.listActive.invalidate();
      toast.success(data.message);
    },
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

  const mutationError =
    removeOrder.error ?? removeGuest.error ?? renameGuest.error ?? moveOrder.error ?? closeSession.error ?? cancelSession.error;

  const tableTotal = session.guests.reduce((s, g) => s + guestTotal(g), 0);
  const guestsWithDebt = session.guests.filter((g) => g.orders.length > 0).length;
  const status = tableStatus(session.guests, session._count.sales);
  const hasAnyOrders = status === "PENDING";
  const badge = STATUS_BADGE[status];
  const longOpen = minutesSince(session.openedAt, now) >= LONG_OPEN_MINUTES;

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

  function renderOrder(guest: Guest, order: Order, index: number) {
    let confirmRow: React.ReactNode = null;
    if (movingOrderId === order.id) {
      confirmRow = (
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 px-3 py-2 dark:border-white/10">
          <select
            aria-label="Mover ronda a"
            value={moveTargetGuestId}
            onChange={(e) => setMoveTargetGuestId(e.target.value)}
            className="min-h-10 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 text-sm dark:border-white/10 dark:bg-slate-800 dark:text-white"
          >
            <option value="">Mover a...</option>
            {session.guests.filter((g) => g.id !== guest.id).map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
          <button
            onClick={() => moveOrder.mutate({ orderId: order.id, toGuestId: moveTargetGuestId })}
            disabled={!moveTargetGuestId || moveOrder.isPending}
            aria-busy={moveOrder.isPending}
            className="min-h-10 rounded-lg bg-violet-600 px-3 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {moveOrder.isPending ? "Moviendo..." : "Mover"}
          </button>
          <button
            onClick={() => { setMovingOrderId(null); setMoveTargetGuestId(""); }}
            className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm text-slate-500 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300"
          >
            Cancelar
          </button>
        </div>
      );
    } else if (confirmDeleteOrder === order.id) {
      confirmRow = (
        <div className="flex flex-wrap items-center gap-2 border-t border-red-200 bg-red-50 px-3 py-2 dark:border-red-500/30 dark:bg-red-900/10">
          <span className="flex-1 text-sm text-red-700 dark:text-red-300">¿Eliminar la ronda {index + 1}? El stock se devuelve.</span>
          <button
            onClick={() => { removeOrder.mutate({ orderId: order.id }); setConfirmDeleteOrder(null); }}
            disabled={removeOrder.isPending}
            aria-busy={removeOrder.isPending}
            className="min-h-10 rounded-lg bg-red-600 px-3 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
          >
            Sí, eliminar
          </button>
          <button
            onClick={() => setConfirmDeleteOrder(null)}
            className="min-h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-transparent dark:text-slate-300"
          >
            No
          </button>
        </div>
      );
    }

    const taxLines = Array.isArray(order.taxLines) ? (order.taxLines as TaxLine[]) : [];

    return (
      <li key={order.id} className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/5">
        <div className="flex items-center gap-2 py-1.5 pl-3 pr-1">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Ronda {index + 1} · <span className="tabular-nums">{fmt(order.total)}</span>
            </p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
              {fmtTime(order.createdAt)}
              {order.user?.name && <> · {order.user.name}</>}
            </p>
          </div>
          {session.guests.length > 1 && (
            <button
              onClick={() => { setMovingOrderId(order.id); setMoveTargetGuestId(""); setConfirmDeleteOrder(null); }}
              className={iconButton}
              title="Mover a otro cliente"
              aria-label={`Mover la ronda ${index + 1} a otro cliente`}
            >
              <ArrowRightLeft className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={() => { setConfirmDeleteOrder(order.id); setMovingOrderId(null); }}
            disabled={removeOrder.isPending}
            className={`${iconButton} hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400`}
            title="Eliminar ronda"
            aria-label={`Eliminar la ronda ${index + 1}`}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>

        {order.note && (
          <p className="mx-3 mb-2 flex items-start gap-1.5 rounded-lg bg-amber-100 px-2.5 py-1.5 text-sm font-medium text-amber-900 dark:bg-amber-500/15 dark:text-amber-200">
            <StickyNote className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span><span className="sr-only">Nota: </span>{order.note}</span>
          </p>
        )}

        <ul className="divide-y divide-slate-200/70 border-t border-slate-200 bg-white px-3 dark:divide-white/5 dark:border-white/10 dark:bg-transparent">
          {order.items.map((item) => (
            <li key={item.id} className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
              <span className="min-w-0 text-slate-700 dark:text-slate-200">
                <span className="font-semibold tabular-nums text-slate-900 dark:text-white">{item.quantity}×</span> {item.name}
              </span>
              <span className="shrink-0 tabular-nums text-slate-500 dark:text-slate-400">{fmt(item.subtotal)}</span>
            </li>
          ))}
        </ul>
        {order.taxAmount > 0 && (
          <div className="space-y-0.5 border-t border-slate-200 bg-white px-3 py-1.5 dark:border-white/10 dark:bg-transparent">
            <div className="flex justify-between text-xs text-slate-500">
              <span>Subtotal</span><span className="tabular-nums">{fmt(order.subtotal)}</span>
            </div>
            {taxLines.map((tl) => (
              <div key={`${tl.name}|${tl.rate}`} className="flex justify-between text-xs text-slate-500">
                <span>{tl.name} ({tl.rate}%)</span><span className="tabular-nums">{fmt(tl.amount)}</span>
              </div>
            ))}
          </div>
        )}
        {confirmRow}
      </li>
    );
  }

  function renderGuest(guest: Guest) {
    const gTotal = guestTotal(guest);
    const isGuestExpanded = expandedGuestId === guest.id;
    const hasOrders = guest.orders.length > 0;
    let summary: string;
    if (hasOrders) summary = `${plural(guest.orders.length, "ronda", "rondas")} · ${plural(itemCount(guest.orders), "producto", "productos")}`;
    else summary = status === "CHARGED" ? "Sin pedidos pendientes" : "Sin pedidos aún";

    return (
      <li key={guest.id} className="px-4 py-3 sm:px-5">
        {renamingGuestId === guest.id ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const trimmed = renameValue.trim();
              if (!trimmed) return;
              renameGuest.mutate({ guestId: guest.id, name: trimmed });
            }}
            className="flex flex-wrap items-center gap-2"
          >
            <input
              aria-label={`Nuevo nombre para ${guest.name}`}
              autoFocus
              value={renameValue}
              maxLength={120}
              onChange={(e) => setRenameValue(e.target.value)}
              className="min-h-11 min-w-0 flex-1 basis-40 rounded-lg border border-violet-300 bg-white px-3 text-base outline-none focus:ring-2 focus:ring-violet-500 sm:text-sm dark:border-violet-500/50 dark:bg-slate-800 dark:text-white"
            />
            <button
              type="submit"
              disabled={renameGuest.isPending || !renameValue.trim()}
              aria-busy={renameGuest.isPending}
              className="min-h-11 rounded-lg bg-violet-600 px-4 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-50"
            >
              {renameGuest.isPending ? "Guardando..." : "Guardar"}
            </button>
            <button
              type="button"
              onClick={() => setRenamingGuestId(null)}
              className="min-h-11 rounded-lg border border-slate-200 px-4 text-sm text-slate-500 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300"
            >
              Cancelar
            </button>
          </form>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => toggleGuestExpanded(guest.id)}
              aria-expanded={isGuestExpanded}
              className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left"
            >
              {isGuestExpanded ? (
                <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
              ) : (
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
              )}
              <span className="min-w-0">
                <span className="block break-words font-semibold text-slate-800 dark:text-slate-100">
                  {guest.name}
                  {guest.description && (
                    <span className="ml-1.5 text-xs font-normal text-slate-500 dark:text-slate-400">· {guest.description}</span>
                  )}
                </span>
                <span className={`block text-xs ${hasOrders ? "text-slate-500 dark:text-slate-400" : "italic text-slate-400 dark:text-slate-500"}`}>
                  {summary}
                </span>
              </span>
            </button>
            {hasOrders && (
              <span className="shrink-0 text-sm font-bold tabular-nums text-slate-800 dark:text-slate-100">{fmt(gTotal)}</span>
            )}
            <button
              onClick={() => setAddingOrderFor({ id: guest.id, name: guest.name })}
              className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-3 text-sm font-semibold text-violet-700 transition hover:bg-violet-100 dark:border-violet-500/30 dark:bg-violet-900/20 dark:text-violet-300 dark:hover:bg-violet-900/30"
              aria-label={`Agregar pedido para ${guest.name}`}
            >
              <Plus className="h-4 w-4" aria-hidden />
              Pedido
            </button>
          </div>
        )}

        {isGuestExpanded && renamingGuestId !== guest.id && (
          <div className="mt-2 space-y-2 sm:pl-6">
            {hasOrders && <ul className="space-y-2">{guest.orders.map((order, oi) => renderOrder(guest, order, oi))}</ul>}

            {confirmRemoveGuest === guest.id ? (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 dark:border-red-500/30 dark:bg-red-900/10">
                <span className="flex-1 text-sm text-red-700 dark:text-red-300">¿Quitar a {guest.name} de la mesa?</span>
                <button
                  onClick={() => { removeGuest.mutate({ guestId: guest.id }); setConfirmRemoveGuest(null); }}
                  disabled={removeGuest.isPending}
                  aria-busy={removeGuest.isPending}
                  className="min-h-10 rounded-lg bg-red-600 px-3 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  Sí, quitar
                </button>
                <button
                  onClick={() => setConfirmRemoveGuest(null)}
                  className="min-h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-transparent dark:text-slate-300"
                >
                  No
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button onClick={() => { setRenamingGuestId(guest.id); setRenameValue(guest.name); }} className={smallGhost}>
                  <Pencil className="h-4 w-4" aria-hidden />
                  Renombrar
                </button>
                {!hasOrders && (
                  <button
                    onClick={() => setConfirmRemoveGuest(guest.id)}
                    className={`${smallGhost} hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:hover:border-red-500/30 dark:hover:bg-red-900/10 dark:hover:text-red-400`}
                  >
                    <UserMinus className="h-4 w-4" aria-hidden />
                    Quitar de la mesa
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </li>
    );
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
          onSuccess={(msg, invoicedSaleIds) => {
            setCheckingOut(false);
            toast.success(msg);
            if (invoicedSaleIds.length > 0) onInvoices?.(invoicedSaleIds);
          }}
        />
      )}

      <article className="min-w-0 rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-white/5">
        <div className="px-4 pt-4 sm:px-5">
          <button
            type="button"
            onClick={onToggleExpanded}
            aria-expanded={expanded}
            className="flex w-full items-start gap-2 text-left"
          >
            {expanded ? (
              <ChevronDown className="mt-1 h-5 w-5 shrink-0 text-slate-500" />
            ) : (
              <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-slate-500" />
            )}
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h2 className="break-words text-lg font-bold leading-tight text-slate-900 dark:text-white">{session.name}</h2>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badge.className}`}>{badge.label}</span>
              </span>
              <span
                className={`mt-1 flex items-center gap-1 text-xs ${longOpen ? "font-semibold text-amber-700 dark:text-amber-300" : "text-slate-500 dark:text-slate-400"}`}
              >
                <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span suppressHydrationWarning>
                  {elapsedLabel(session.openedAt, now)} · {fmtTime(session.openedAt)}
                </span>
              </span>
              <span className="mt-0.5 block truncate text-xs text-slate-500 dark:text-slate-400">
                {plural(session.guests.length, "cliente", "clientes")}
                {hasAnyOrders && ` · ${guestsWithDebt} por cobrar`}
                {session.user?.name && ` · abrió ${session.user.name}`}
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block text-xl font-bold tabular-nums leading-tight text-slate-900 dark:text-white">{fmt(tableTotal)}</span>
              <span className="block text-xs text-slate-500 dark:text-slate-400">{hasAnyOrders ? "por cobrar" : "total"}</span>
            </span>
          </button>
        </div>

        <div className="flex gap-2 px-4 pb-4 pt-3 sm:justify-end sm:px-5">
          <button
            onClick={() => setAddingGuest(true)}
            className="min-h-11 flex-1 rounded-xl border border-violet-200 bg-violet-50 px-4 text-sm font-semibold text-violet-700 transition hover:bg-violet-100 sm:flex-none dark:border-violet-500/30 dark:bg-violet-900/20 dark:text-violet-300"
          >
            + Cliente
          </button>
          <button
            onClick={() => setCheckingOut(true)}
            disabled={!hasAnyOrders}
            title={hasAnyOrders ? undefined : "Agrega un pedido para poder cobrar"}
            className="min-h-11 flex-[2] rounded-xl bg-violet-600 px-4 text-sm font-bold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none"
          >
            {hasAnyOrders ? `Cobrar ${fmt(tableTotal)}` : "Cobrar"}
          </button>
        </div>

        {expanded && (
          <div className="border-t border-slate-100 dark:border-white/10">
            {mutationError && (
              <p role="alert" className="mx-4 mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 sm:mx-5 dark:border-red-500/30 dark:bg-red-900/10 dark:text-red-300">
                {mutationError.message}
              </p>
            )}

            {status === "CHARGED" && (
              <div className="mx-4 mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800 sm:mx-5 dark:border-emerald-500/30 dark:bg-emerald-900/15 dark:text-emerald-200">
                <span className="min-w-0 flex-1">
                  {closeConfirm ? "¿Cerrar la mesa? Los clientes salen de ella." : "Ya se cobró todo. Cierra la mesa cuando se vayan o agrega nuevos pedidos."}
                </span>
                {closeConfirm ? (
                  <>
                    <button
                      onClick={() => { setCloseConfirm(false); closeSession.mutate({ sessionId: session.id }); }}
                      disabled={closeSession.isPending}
                      aria-busy={closeSession.isPending}
                      className="min-h-10 rounded-lg bg-emerald-600 px-4 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      Sí, cerrar
                    </button>
                    <button
                      onClick={() => setCloseConfirm(false)}
                      className="min-h-10 rounded-lg border border-emerald-300 px-4 text-sm font-medium hover:bg-emerald-100 dark:border-emerald-500/40 dark:hover:bg-emerald-900/30"
                    >
                      No
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setCloseConfirm(true)}
                    disabled={closeSession.isPending}
                    className="min-h-10 rounded-lg bg-emerald-600 px-4 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {closeSession.isPending ? "Cerrando..." : "Cerrar mesa"}
                  </button>
                )}
              </div>
            )}

            {session.guests.length === 0 ? (
              <p className="px-5 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                Sin clientes aún. Toca &quot;+ Cliente&quot; para agregar el primero.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-white/5">{session.guests.map(renderGuest)}</ul>
            )}

            <div className="flex flex-col gap-2 border-t border-slate-100 px-4 py-3 sm:px-5 dark:border-white/10">
              {showPdf ? (
                <MesaPdfActions business={business} mesa={buildMesaForPdf()} fileName={`${session.name.replace(/\s+/g, "-")}.pdf`} onClose={() => setShowPdf(false)} />
              ) : null}
              {cancelConfirm ? (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm dark:border-red-500/30 dark:bg-red-900/10">
                  <span className="min-w-0 flex-1 text-red-700 dark:text-red-300">
                    ¿Cancelar {session.name} sin cobrar? Se borran sus pedidos y se devuelve el stock.
                  </span>
                  <button
                    onClick={() => { setCancelConfirm(false); cancelSession.mutate({ sessionId: session.id }); }}
                    disabled={cancelSession.isPending}
                    aria-busy={cancelSession.isPending}
                    className="min-h-10 rounded-lg bg-red-600 px-4 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    Sí, cancelar
                  </button>
                  <button onClick={() => setCancelConfirm(false)} className="min-h-10 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-transparent dark:text-slate-300">
                    No
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {!showPdf && (
                    <button onClick={() => setShowPdf(true)} className={smallGhost}>
                      <FileText className="h-4 w-4" aria-hidden />
                      Cuenta en PDF
                    </button>
                  )}
                  <button
                    onClick={() => setCancelConfirm(true)}
                    disabled={cancelSession.isPending}
                    className={`${smallGhost} hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:hover:border-red-500/30 dark:hover:bg-red-900/10 dark:hover:text-red-400`}
                  >
                    <X className="h-4 w-4" aria-hidden />
                    {cancelSession.isPending ? "Cancelando..." : "Cancelar mesa sin cobrar"}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </article>
    </>
  );
}
