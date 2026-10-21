"use client";

import { Check, Combine, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "~/trpc/react";
import { useSession } from "next-auth/react";
import { CashChange } from "~/app/_components/CashChange";
import { ReceiptPhotoButton } from "~/app/_components/ReceiptPhotoButton";
import { useDialog } from "~/app/_components/ui/useDialog";
import { formatCOP as fmt } from "~/lib/format/money";
import { guestTotal, plural } from "./mesaStatus";

type Order = { subtotal: number; taxAmount: number; taxLines: unknown; total: number };
type Guest = { id: string; name: string; description: string | null; customerId: string | null; orders: Order[] };
type PaymentMethod = "CASH" | "CARD" | "CREDIT" | "TRANSFER";

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  CASH: "Efectivo",
  CARD: "Tarjeta",
  TRANSFER: "Transferencia",
  CREDIT: "Fiado",
};
const PAYMENT_ORDER: PaymentMethod[] = ["CASH", "CARD", "TRANSFER", "CREDIT"];

type PayGroup = { id: string; guestIds: string[]; paymentMethod: PaymentMethod; invoice: boolean; receiptPath: string | null };

type Props = {
  sessionId: string;
  sessionName: string;
  guests: Guest[];
  onClose: () => void;
  /** invoicedSaleIds: ventas del cobro que salieron con factura, para mostrarlas al terminar. */
  onSuccess: (msg: string, invoicedSaleIds: string[]) => void;
};

/** Mismas reglas que el servidor: para fiar, todo el grupo es el mismo cliente registrado. */
function creditProblem(guests: Guest[]): string | null {
  const ids = guests.map((g) => g.customerId);
  if (ids.some((id) => !id)) {
    return "Para fiar, el cliente debe estar registrado. Agrégalo con \"+ Cliente\" → \"Vincular a cliente registrado\".";
  }
  if (new Set(ids).size > 1) return "Para fiar juntos, todos deben ser el mismo cliente registrado.";
  return null;
}

export function CheckoutModal({ sessionId, sessionName, guests, onClose, onSuccess }: Readonly<Props>) {
  const dialogRef = useDialog(onClose);
  const { data: session } = useSession();
  const cashierName = session?.user?.name ?? "Cajero";

  // Guests kept at the table with no pending rounds have nothing to charge —
  // exclude them from checkout entirely so they don't show up as $0 rows.
  const payableGuests = guests.filter((g) => g.orders.length > 0);
  const waitingGuests = guests.filter((g) => g.orders.length === 0);

  const [groups, setGroups] = useState<PayGroup[]>(() =>
    payableGuests.map((g) => ({ id: g.id, guestIds: [g.id], paymentMethod: "CASH" as const, invoice: false, receiptPath: null })),
  );
  const [joining, setJoining] = useState(false);
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [keepGuests, setKeepGuests] = useState(false);
  const [changeOpen, setChangeOpen] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  // Clave de idempotencia del cobro: nace al abrir el cobro y se reutiliza en reintentos
  // (doble clic, red lenta); cambiar la forma de pago o los grupos lo convierte en otro cobro.
  const checkoutKeyRef = useRef<string | null>(null);
  useEffect(() => {
    checkoutKeyRef.current = crypto.randomUUID();
  }, [groups, excluded, keepGuests]);

  const utils = api.useUtils();
  const checkout = api.tableSession.checkout.useMutation({
    onSuccess: async (data) => {
      await utils.tableSession.listActive.invalidate();
      await utils.sale.list.invalidate();
      onSuccess(data.message, data.sales.filter((s) => s.invoiceNumber).map((s) => s.id));
    },
    onError: (e) => setError(e.message),
  });

  const guestById = (id: string) => payableGuests.find((g) => g.id === id);
  const groupGuests = (grp: PayGroup) => grp.guestIds.map(guestById).filter((g): g is Guest => !!g);
  const groupAmount = (grp: PayGroup) => groupGuests(grp).reduce((s, g) => s + guestTotal(g), 0);

  function updateGroup(groupId: string, patch: Partial<PayGroup>) {
    setGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, ...patch } : g)));
  }

  function setMethod(groupId: string, method: PaymentMethod) {
    setGroups((prev) => prev.map((g) => g.id === groupId ? { ...g, paymentMethod: method, receiptPath: method === "TRANSFER" ? g.receiptPath : null } : g));
  }

  function splitGroup(groupId: string) {
    setGroups((prev) => {
      const grp = prev.find((g) => g.id === groupId);
      if (!grp || grp.guestIds.length < 2) return prev;
      return [...prev.filter((g) => g.id !== groupId), ...grp.guestIds.map((id) => ({ id, guestIds: [id], paymentMethod: grp.paymentMethod, invoice: grp.invoice, receiptPath: grp.receiptPath }))];
    });
  }

  function excludeGuest(guestId: string) {
    const grp = groups.find((g) => g.guestIds.includes(guestId));
    if (grp && grp.guestIds.length > 1) splitGroup(grp.id);
    setExcluded((prev) => new Set(prev).add(guestId));
  }

  function includeGuest(guestId: string) {
    setExcluded((prev) => { const next = new Set(prev); next.delete(guestId); return next; });
  }

  function toggleSelected(groupId: string) {
    setSelectedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  function joinSelected() {
    const chosen = groups.filter((g) => selectedGroups.has(g.id));
    if (chosen.length < 2) return;
    const first = chosen[0]!;
    const merged: PayGroup = { ...first, guestIds: chosen.flatMap((g) => g.guestIds), receiptPath: null };
    setGroups((prev) => [...prev.filter((g) => !selectedGroups.has(g.id)), merged]);
    setSelectedGroups(new Set());
    setJoining(false);
  }

  function toggleChange(groupId: string) {
    setChangeOpen((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  const activeGroups = groups.filter((g) => g.guestIds.every((id) => !excluded.has(id)));
  const excludedGuests = payableGuests.filter((g) => excluded.has(g.id));
  const grandTotal = activeGroups.reduce((s, g) => s + groupAmount(g), 0);
  const allIncluded = excluded.size === 0;
  const wouldCloseTable = !keepGuests && allIncluded;
  const creditErrors = new Map(
    activeGroups
      .filter((g) => g.paymentMethod === "CREDIT")
      .map((g) => [g.id, creditProblem(groupGuests(g))] as const)
      .filter((e): e is readonly [string, string] => e[1] !== null),
  );
  const canJoin = activeGroups.length >= 2;

  function confirm() {
    if (checkout.isPending) return;
    setError(null);
    if (activeGroups.length === 0) {
      setError("Selecciona al menos un cliente para cobrar.");
      return;
    }
    checkoutKeyRef.current ??= crypto.randomUUID();
    checkout.mutate({
      sessionId,
      keepGuests,
      idempotencyKey: checkoutKeyRef.current,
      groups: activeGroups.map((g) => ({ guestIds: g.guestIds, paymentMethod: g.paymentMethod, invoice: g.invoice, receiptPath: g.receiptPath ?? undefined })),
    });
  }

  let confirmLabel: string;
  if (checkout.isPending) {
    confirmLabel = "Procesando...";
  } else if (wouldCloseTable) {
    confirmLabel = `Cobrar ${fmt(grandTotal)} y cerrar mesa`;
  } else {
    confirmLabel = `Cobrar ${fmt(grandTotal)}`;
  }

  let outcome: React.ReactNode;
  if (keepGuests) {
    outcome = "La mesa sigue abierta y todos los clientes se quedan, listos para seguir pidiendo.";
  } else if (allIncluded) {
    outcome = (
      <>
        Se cobra todo y <strong>la mesa se cierra</strong>.
        {waitingGuests.length > 0 && (
          <> También salen de la mesa {waitingGuests.map((g) => g.name).join(", ")} (sin pedidos). Si siguen sentados, marca &quot;Mantener clientes en mesa&quot;.</>
        )}
      </>
    );
  } else {
    outcome = (
      <>
        La mesa sigue abierta. Quedan por cobrar: {excludedGuests.map((g) => `${g.name} (${fmt(guestTotal(g))})`).join(", ")}.
      </>
    );
  }

  function renderGroup(grp: PayGroup) {
    const members = groupGuests(grp);
    const single = members.length === 1 ? members[0]! : null;
    const amount = groupAmount(grp);
    const isSelected = selectedGroups.has(grp.id);
    const creditError = creditErrors.get(grp.id);

    if (joining) {
      return (
        <li key={grp.id}>
          <button
            type="button"
            onClick={() => toggleSelected(grp.id)}
            aria-pressed={isSelected}
            className={`flex min-h-14 w-full items-center gap-3 rounded-xl border p-3 text-left transition ${isSelected ? "border-violet-500 bg-violet-50 ring-1 ring-violet-500 dark:bg-violet-900/25" : "border-slate-200 bg-white dark:border-white/10 dark:bg-white/5"}`}
          >
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${isSelected ? "border-violet-600 bg-violet-600 text-white" : "border-slate-300 dark:border-white/30"}`}>
              {isSelected && <Check className="h-4 w-4" />}
            </span>
            <span className="min-w-0 flex-1 font-medium text-slate-800 dark:text-slate-100">{members.map((g) => g.name).join(" + ")}</span>
            <span className="shrink-0 font-semibold tabular-nums text-slate-800 dark:text-slate-100">{fmt(amount)}</span>
          </button>
        </li>
      );
    }

    return (
      <li key={grp.id} className={`rounded-xl border p-3 ${members.length > 1 ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-500/30 dark:bg-emerald-900/10" : "border-slate-200 bg-white dark:border-white/10 dark:bg-white/5"}`}>
        <div className="flex items-start gap-3">
          {single && (
            <input
              type="checkbox"
              checked
              onChange={() => excludeGuest(single.id)}
              aria-label={`Cobrar a ${single.name} ahora (desmarca para cobrarle después)`}
              className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-violet-600"
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="break-words font-medium text-slate-800 dark:text-slate-100">
              {members.map((g) => g.name).join(" + ")}
              {single?.description && <span className="ml-1 text-xs font-normal text-slate-500">· {single.description}</span>}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {members.length > 1 ? "Pagan juntos" : plural(single?.orders.length ?? 0, "ronda", "rondas")}
            </p>
          </div>
          <span className="shrink-0 text-lg font-bold tabular-nums text-slate-900 dark:text-white">{fmt(amount)}</span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label={`Forma de pago de ${members.map((g) => g.name).join(" + ")}`}>
          {PAYMENT_ORDER.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMethod(grp.id, m)}
              aria-pressed={grp.paymentMethod === m}
              className={`min-h-11 rounded-lg border px-2 text-sm font-medium leading-tight transition ${
                grp.paymentMethod === m
                  ? "border-violet-400 bg-violet-100 text-violet-700 dark:border-violet-500 dark:bg-violet-900/30 dark:text-violet-300"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-white/10 dark:bg-transparent dark:text-slate-400 dark:hover:border-white/20"
              }`}
            >
              {PAYMENT_LABELS[m]}
            </button>
          ))}
        </div>

        {creditError && <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">{creditError}</p>}
        {grp.paymentMethod === "TRANSFER" && (
          <div className="mt-2">
            <ReceiptPhotoButton value={grp.receiptPath} onChange={(path) => updateGroup(grp.id, { receiptPath: path })} />
          </div>
        )}
        {grp.paymentMethod === "CASH" && (activeGroups.length === 1 || changeOpen.has(grp.id)) && (
          <CashChange key={amount} total={amount} className="mt-2" />
        )}

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={grp.invoice}
              onChange={(e) => updateGroup(grp.id, { invoice: e.target.checked })}
              className="h-5 w-5 cursor-pointer accent-violet-600"
            />
            Generar factura
          </label>
          {grp.paymentMethod === "CASH" && activeGroups.length > 1 && (
            <button type="button" onClick={() => toggleChange(grp.id)} className="min-h-10 text-sm font-medium text-violet-700 underline-offset-4 hover:underline dark:text-violet-300">
              {changeOpen.has(grp.id) ? "Ocultar vuelto" : "Calcular vuelto"}
            </button>
          )}
          {members.length > 1 && (
            <button type="button" onClick={() => splitGroup(grp.id)} className="min-h-10 text-sm font-medium text-slate-600 underline-offset-4 hover:text-red-600 hover:underline dark:text-slate-300">
              Separar cuentas
            </button>
          )}
        </div>
      </li>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-2 pt-6 sm:p-4 sm:pt-10">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={`Cobrar ${sessionName}`} className="w-full max-w-lg rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 sm:px-5 dark:border-white/10">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-slate-800 dark:text-white">Cobrar {sessionName}</h2>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">Cobra: {cashierName}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-4 sm:p-5">
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                {joining ? "Elige quiénes pagan juntos" : "¿Quién paga y cómo?"}
              </p>
              {canJoin && !joining && (
                <button
                  type="button"
                  onClick={() => setJoining(true)}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
                >
                  <Combine className="h-4 w-4" aria-hidden />
                  Juntar cuentas
                </button>
              )}
            </div>
            <ul className="space-y-2">{activeGroups.map(renderGroup)}</ul>
            {joining && (
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={joinSelected}
                  disabled={selectedGroups.size < 2}
                  className="min-h-11 flex-1 rounded-xl bg-violet-600 px-3 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-50"
                >
                  {selectedGroups.size < 2 ? "Elige al menos 2" : `Pagar juntos (${selectedGroups.size})`}
                </button>
                <button
                  type="button"
                  onClick={() => { setJoining(false); setSelectedGroups(new Set()); }}
                  className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300"
                >
                  Cancelar
                </button>
              </div>
            )}
          </div>

          {excludedGuests.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Cobrar más tarde</p>
              {excludedGuests.map((guest) => (
                <label key={guest.id} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 dark:border-white/15 dark:bg-white/5">
                  <input
                    type="checkbox"
                    checked={false}
                    onChange={() => includeGuest(guest.id)}
                    aria-label={`Cobrar a ${guest.name} ahora`}
                    className="h-5 w-5 shrink-0 cursor-pointer accent-violet-600"
                  />
                  <span className="min-w-0 flex-1 text-sm text-slate-600 dark:text-slate-300">{guest.name}</span>
                  <span className="text-sm tabular-nums text-slate-500">{fmt(guestTotal(guest))}</span>
                </label>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between rounded-xl bg-slate-900 px-4 py-3 text-white dark:bg-white/10">
            <span className="font-semibold">{allIncluded ? "Total mesa" : "Total a cobrar ahora"}</span>
            <span className="text-2xl font-bold tabular-nums">{fmt(grandTotal)}</span>
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-white/10 dark:bg-white/5">
            <input
              type="checkbox"
              checked={keepGuests}
              onChange={(e) => setKeepGuests(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-violet-600"
            />
            <span>
              <span className="block text-sm font-medium text-slate-700 dark:text-slate-200">Mantener clientes en mesa</span>
              <span className="block text-xs text-slate-500 dark:text-slate-400">
                Cobra lo pedido y deja a los clientes sentados para que sigan pidiendo.
              </span>
            </span>
          </label>

          <p role="status" className={`rounded-lg px-3 py-2 text-sm ${wouldCloseTable ? "bg-amber-50 text-amber-900 dark:bg-amber-900/20 dark:text-amber-200" : "bg-slate-50 text-slate-600 dark:bg-white/5 dark:text-slate-300"}`}>
            {outcome}
          </p>

          {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <div className="sticky bottom-0 -mx-4 -mb-4 flex gap-2 rounded-b-2xl border-t border-slate-100 bg-white px-4 py-3 sm:-mx-5 sm:-mb-5 sm:px-5 dark:border-white/10 dark:bg-slate-900">
            <button
              onClick={confirm}
              disabled={checkout.isPending || joining || activeGroups.length === 0 || creditErrors.size > 0}
              aria-busy={checkout.isPending}
              className="min-h-12 flex-1 rounded-xl bg-violet-600 px-3 text-sm font-bold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {confirmLabel}
            </button>
            <button
              onClick={onClose}
              className="min-h-12 rounded-xl border border-slate-200 px-4 text-sm text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
