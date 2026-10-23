"use client";

import { ChevronDown, ChevronRight, CircleCheck, StickyNote } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { api, type RouterOutputs } from "~/trpc/react";
import { EmptyState } from "~/app/_components/EmptyState";
import { formatCOP } from "~/lib/format/money";

type Purchase = RouterOutputs["purchase"]["list"][number];
type PayMethod = "CASH" | "TRANSFER" | "CARD";

const METHOD_LABELS: Record<string, string> = { CASH: "Efectivo", TRANSFER: "Transferencia", CARD: "Tarjeta" };

export const fmtDay = (d: Date | string) =>
  new Date(d).toLocaleDateString("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short", year: "numeric" });

function dueLabel(dueDate: Date | null): { text: string; overdue: boolean } {
  if (!dueDate) return { text: "Sin fecha · próxima entrega", overdue: false };
  const overdue = new Date(dueDate).getTime() < Date.now();
  return { text: `${overdue ? "Venció" : "Pagar antes del"} ${fmtDay(dueDate)}`, overdue };
}

function PaymentForm({ purchase, onDone }: Readonly<{ purchase: Purchase; onDone: () => void }>) {
  const [amount, setAmount] = useState(String(Math.round(purchase.balance)));
  const [method, setMethod] = useState<PayMethod>("CASH");
  const [note, setNote] = useState("");
  const keyRef = useRef<string | null>(null);
  const utils = api.useUtils();

  const pay = api.purchase.addPayment.useMutation({
    onSuccess: async (data) => {
      toast.success(data.message);
      await Promise.all([utils.purchase.invalidate(), utils.supplier.invalidate(), utils.cashRegister.getActive.invalidate()]);
      onDone();
    },
    onError: () => {
      keyRef.current = null;
    },
  });

  const value = Number.parseFloat(amount);
  const valid = Number.isFinite(value) && value > 0 && value <= purchase.balance + 0.01;
  let payLabel = "Pagar";
  if (pay.isPending) payLabel = "Registrando...";
  else if (valid) payLabel = `Pagar ${formatCOP(value)}`;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid || pay.isPending) return;
        keyRef.current ??= crypto.randomUUID();
        pay.mutate({ purchaseId: purchase.id, amount: value, paymentMethod: method, note: note.trim() || undefined, idempotencyKey: keyRef.current });
      }}
      className="space-y-2 border-t border-slate-100 bg-slate-50 px-4 py-3 dark:border-white/10 dark:bg-white/5"
    >
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <label className="relative block">
          <span className="sr-only">Monto a pagar</span>
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">$</span>
          <input
            type="number"
            inputMode="decimal"
            min="1"
            value={amount}
            onChange={(e) => { setAmount(e.target.value); keyRef.current = null; }}
            className="min-h-11 w-full rounded-xl border border-slate-300 bg-white pl-7 pr-3 text-base outline-none ring-violet-400 focus:ring-2 sm:text-sm dark:border-white/15 dark:bg-slate-900 dark:text-white"
          />
        </label>
        <fieldset aria-label="Forma de pago" className="grid grid-cols-3 gap-1">
          {(["CASH", "TRANSFER", "CARD"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => { setMethod(m); keyRef.current = null; }}
              aria-pressed={method === m}
              className={`min-h-11 rounded-lg border px-2 text-xs font-semibold ${
                method === m
                  ? "border-violet-500 bg-violet-50 text-violet-700 dark:border-violet-400 dark:bg-violet-900/30 dark:text-violet-200"
                  : "border-slate-200 bg-white text-slate-600 dark:border-white/10 dark:bg-transparent dark:text-slate-300"
              }`}
            >
              {METHOD_LABELS[m]}
            </button>
          ))}
        </fieldset>
      </div>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={500}
        placeholder="Nota (opcional)"
        aria-label="Nota del pago"
        className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base outline-none ring-violet-400 focus:ring-2 sm:text-sm dark:border-white/15 dark:bg-slate-900 dark:text-white"
      />
      {pay.error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{pay.error.message}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onDone} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm text-slate-600 dark:border-white/10 dark:text-slate-300">
          Cancelar
        </button>
        <button
          type="submit"
          disabled={!valid || pay.isPending}
          aria-busy={pay.isPending}
          className="min-h-11 flex-1 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {payLabel}
        </button>
      </div>
    </form>
  );
}

export function PurchaseCard({ purchase, showSupplier = true }: Readonly<{ purchase: Purchase; showSupplier?: boolean }>) {
  const [open, setOpen] = useState(false);
  const [paying, setPaying] = useState(false);
  const due = dueLabel(purchase.dueDate);
  const pending = purchase.balance > 0.01;

  return (
    <li className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-white/5">
      <div className="flex items-start gap-2 px-4 py-3">
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex min-w-0 flex-1 items-start gap-2 text-left">
          {open ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />}
          <span className="min-w-0">
            <span className="block truncate font-semibold text-slate-800 dark:text-slate-100">
              {showSupplier ? (purchase.supplier?.name ?? "Sin proveedor") : `Compra del ${fmtDay(purchase.createdAt)}`}
            </span>
            <span className="block text-xs text-slate-500 dark:text-slate-400">
              {showSupplier && <>{fmtDay(purchase.createdAt)} · </>}Total {formatCOP(purchase.total)}
              {purchase.paid > 0 && <> · pagado {formatCOP(purchase.paid)}</>}
            </span>
            {pending && (
              <span className={`block text-xs font-semibold ${due.overdue ? "text-red-600 dark:text-red-400" : "text-amber-700 dark:text-amber-300"}`}>
                {due.text}
              </span>
            )}
          </span>
        </button>
        <span className="shrink-0 text-right">
          {pending ? (
            <>
              <span className="block text-base font-bold tabular-nums text-amber-700 dark:text-amber-300">{formatCOP(purchase.balance)}</span>
              <span className="block text-xs text-slate-500">por pagar</span>
            </>
          ) : (
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
              <CircleCheck className="h-4 w-4" aria-hidden /> Pagada
            </span>
          )}
        </span>
      </div>

      {open && (
        <div className="space-y-2 border-t border-slate-100 px-4 py-3 text-sm dark:border-white/10">
          {purchase.items.length > 0 ? (
            <ul className="space-y-1">
              {purchase.items.map((i) => (
                <li key={i.id} className="flex justify-between gap-3">
                  <span className="text-slate-700 dark:text-slate-200">
                    <span className="font-semibold tabular-nums">{i.quantity}×</span> {i.name}
                    <span className="text-xs text-slate-500"> · {formatCOP(i.unitCost)} c/u</span>
                  </span>
                  <span className="shrink-0 tabular-nums text-slate-500">{formatCOP(i.subtotal)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-slate-500 dark:text-slate-400">Compra registrada solo con el total.</p>
          )}
          {purchase.note && (
            <p className="flex items-start gap-1.5 rounded-lg bg-amber-100 px-2.5 py-1.5 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200">
              <StickyNote className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {purchase.note}
            </p>
          )}
          {purchase.payments.length > 0 && (
            <ul className="space-y-1">
              {purchase.payments.map((p) => (
                <li key={p.id} className="flex justify-between gap-3 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-800 dark:bg-emerald-900/15 dark:text-emerald-200">
                  <span>
                    Pago {METHOD_LABELS[p.paymentMethod]?.toLowerCase() ?? ""} · {fmtDay(p.createdAt)}
                    {p.user?.name && ` · ${p.user.name}`}
                  </span>
                  <span className="font-semibold tabular-nums">{formatCOP(p.amount)}</span>
                </li>
              ))}
            </ul>
          )}
          {purchase.user?.name && <p className="text-xs text-slate-500">Registró {purchase.user.name}</p>}
        </div>
      )}

      {pending && (paying ? (
        <PaymentForm purchase={purchase} onDone={() => setPaying(false)} />
      ) : (
        <div className="border-t border-slate-100 px-4 py-2 dark:border-white/10">
          <button
            type="button"
            onClick={() => setPaying(true)}
            className="min-h-10 w-full rounded-lg border border-emerald-200 bg-emerald-50 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-900/20 dark:text-emerald-300"
          >
            Registrar pago o abono
          </button>
        </div>
      ))}
    </li>
  );
}

export function PayablesList() {
  const { data: purchases, isPending } = api.purchase.list.useQuery({ pendingOnly: true });

  if (isPending) return <p className="py-6 text-center text-sm text-slate-500">Cargando...</p>;
  if (!purchases || purchases.length === 0) {
    return (
      <EmptyState
        icon={CircleCheck}
        title="No le debes nada a tus proveedores"
        description="Las compras a crédito o con abono aparecen aquí hasta que las termines de pagar."
      />
    );
  }

  return (
    <ul className="space-y-3">
      {purchases.map((p) => <PurchaseCard key={p.id} purchase={p} />)}
    </ul>
  );
}
