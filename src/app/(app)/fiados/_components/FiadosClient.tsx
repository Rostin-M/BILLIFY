"use client";

import { useRef, useState } from "react";
import { HandCoins } from "lucide-react";
import { toast } from "sonner";
import { api } from "~/trpc/react";
import { EmptyState } from "~/app/_components/EmptyState";

const formatCOP = (v: number) =>
  v.toLocaleString("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0 });

const formatDay = (d: Date) =>
  new Date(d).toLocaleDateString("es-CO", { timeZone: "America/Bogota", weekday: "long", day: "2-digit", month: "long" });

const bogotaDayKey = (d: Date) => new Date(d).toLocaleDateString("en-CA", { timeZone: "America/Bogota" });

type CreditSale = {
  id: string;
  createdAt: Date;
  items: { name: string; quantity: number; subtotal: number }[];
};
type Payment = {
  id: string;
  amount: number;
  createdAt: Date;
  user: { name: string | null } | null;
};
type DayGroup = { key: string; date: Date; credits: CreditSale[]; payments: Payment[] };

function groupByDay(creditSales: CreditSale[], payments: Payment[]): DayGroup[] {
  const groups = new Map<string, DayGroup>();
  function group(date: Date) {
    const key = bogotaDayKey(date);
    let g = groups.get(key);
    if (!g) {
      g = { key, date, credits: [], payments: [] };
      groups.set(key, g);
    }
    return g;
  }
  for (const sale of creditSales) group(sale.createdAt).credits.push(sale);
  for (const payment of payments) group(payment.createdAt).payments.push(payment);
  return Array.from(groups.values()).sort((a, b) => b.date.getTime() - a.date.getTime());
}

function DebtorDetail({ customerId, debtTotal }: Readonly<{ customerId: string; debtTotal: number }>) {
  const { data, isPending } = api.customer.history.useQuery({ customerId });

  if (isPending) {
    return <p className="px-1 py-2 text-xs text-slate-500 dark:text-slate-500">Cargando detalle...</p>;
  }

  const creditSales = (data?.sales ?? []).filter((s) => s.paymentMethod === "CREDIT");
  const payments = data?.payments ?? [];

  if (creditSales.length === 0 && payments.length === 0) {
    return <p className="px-1 py-2 text-xs text-slate-500 dark:text-slate-500">Sin fiados registrados.</p>;
  }

  const days = groupByDay(creditSales, payments);

  return (
    <div className="space-y-3 px-1 py-2">
      <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
        Debe en total: {formatCOP(Math.max(debtTotal, 0))}
      </p>
      {days.map((day) => {
        const dayOwed = day.credits.reduce(
          (sum, s) => sum + s.items.reduce((isum, i) => isum + i.subtotal, 0),
          0,
        );
        return (
          <div key={day.key}>
            <div className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
              <span className="capitalize">{formatDay(day.date)}</span>
              {dayOwed > 0 && <span>{formatCOP(dayOwed)}</span>}
            </div>
            {day.credits.length > 0 && (
              <ul className="space-y-1">
                {day.credits.flatMap((s) =>
                  s.items.map((item, i) => (
                    <li
                      key={`${s.id}-${i}`}
                      className="flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs dark:bg-white/5"
                    >
                      <span className="text-slate-600 dark:text-slate-300">
                        {item.quantity} × {item.name}
                      </span>
                      <span className="font-medium text-slate-700 dark:text-slate-200">
                        {formatCOP(item.subtotal)}
                      </span>
                    </li>
                  )),
                )}
              </ul>
            )}
            {day.payments.length > 0 && (
              <ul className="mt-1 space-y-1">
                {day.payments.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs dark:bg-emerald-900/10"
                  >
                    <span className="text-emerald-700 dark:text-emerald-300">
                      Abonó{p.user?.name ? ` · ${p.user.name}` : ""}
                    </span>
                    <span className="font-medium text-emerald-700 dark:text-emerald-300">
                      − {formatCOP(p.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function FiadosClient() {
  const utils = api.useUtils();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");

  const { data: debtors = [], isPending } = api.customer.listDebtors.useQuery();

  // Clave de idempotencia del abono en curso, atada a (cliente, monto): un reintento del mismo
  // abono reutiliza la clave y el servidor no lo registra dos veces.
  const paymentKeyRef = useRef<{ signature: string; key: string } | null>(null);

  const addPayment = api.customer.addPayment.useMutation({
    onSuccess: async (data) => {
      paymentKeyRef.current = null;
      toast.success(data.message);
      setPayingId(null);
      setPaymentAmount("");
      await Promise.all([
        utils.customer.listDebtors.invalidate(),
        expandedId ? utils.customer.history.invalidate({ customerId: expandedId }) : Promise.resolve(),
      ]);
    },
    onError: (err) => toast.error(err.message),
  });

  function submitPayment(customerId: string, amount: number) {
    if (addPayment.isPending) return;
    const signature = `${customerId}|${amount}`;
    if (paymentKeyRef.current?.signature !== signature) {
      paymentKeyRef.current = { signature, key: crypto.randomUUID() };
    }
    addPayment.mutate({ customerId, amount, idempotencyKey: paymentKeyRef.current.key });
  }

  const totalDebt = debtors.reduce((sum, d) => sum + d.debt, 0);

  if (isPending) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">Cargando fiados...</p>;
  }

  if (debtors.length === 0) {
    return (
      <EmptyState
        icon={HandCoins}
        title="Sin fiados pendientes"
        description="Cuando registres una venta a crédito con un cliente identificado, aparecerá aquí."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-900/10">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
          Total fiado
        </p>
        <p className="mt-0.5 text-2xl font-bold text-amber-800 dark:text-amber-200">
          {formatCOP(totalDebt)}
        </p>
        <p className="mt-0.5 text-xs text-amber-600 dark:text-amber-400">
          {debtors.length} {debtors.length === 1 ? "cliente debe" : "clientes deben"}
        </p>
      </div>

      <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white dark:divide-white/5 dark:border-white/10 dark:bg-white/5">
        {debtors.map((c) => (
          <li key={c.id} className="p-3">
            <button
              type="button"
              onClick={() => {
                const next = expandedId === c.id ? null : c.id;
                setExpandedId(next);
                setPayingId(null);
                setPaymentAmount("");
              }}
              className="flex w-full items-center justify-between gap-3 text-left"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                  {c.name}
                  {c.alias && <span className="ml-1.5 text-xs text-slate-500">&quot;{c.alias}&quot;</span>}
                </p>
                {c.phone && (
                  <p className="text-xs text-slate-500 dark:text-slate-500">{c.phone}</p>
                )}
              </div>
              <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                {formatCOP(c.debt)}
              </span>
            </button>

            {expandedId === c.id && (
              <div className="mt-3 space-y-3">
                <div>
                  <button
                    type="button"
                    onClick={() => {
                      setPayingId(payingId === c.id ? null : c.id);
                      setPaymentAmount("");
                    }}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                      payingId === c.id
                        ? "border-amber-300 bg-amber-100 text-amber-700 dark:border-amber-500/40 dark:bg-amber-900/20 dark:text-amber-300"
                        : "border-slate-200 text-slate-500 hover:border-amber-200 hover:text-amber-600 dark:border-white/10 dark:text-slate-400"
                    }`}
                  >
                    Abonar
                  </button>

                  {payingId === c.id && (
                    <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-500/30 dark:bg-amber-900/10">
                      <p className="mb-2 text-xs font-semibold text-amber-700 dark:text-amber-300">
                        Deuda actual: {formatCOP(c.debt)}
                      </p>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={paymentAmount}
                        onChange={(e) => setPaymentAmount(e.target.value)}
                        placeholder="Monto a abonar"
                        className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 dark:border-amber-500/30 dark:bg-slate-900 dark:text-white"
                      />
                      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                        <button
                          onClick={() => submitPayment(c.id, Number(paymentAmount))}
                          disabled={!paymentAmount || Number(paymentAmount) <= 0 || addPayment.isPending}
                          className="min-h-11 flex-1 rounded-lg bg-amber-600 text-sm font-semibold text-white transition hover:bg-amber-500 disabled:opacity-50"
                        >
                          {addPayment.isPending ? "Guardando..." : "Abonar"}
                        </button>
                        <button
                          onClick={() => submitPayment(c.id, c.debt)}
                          disabled={addPayment.isPending}
                          className="min-h-11 flex-1 rounded-lg bg-emerald-600 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
                        >
                          Pagar deuda completa
                        </button>
                        <button
                          onClick={() => setPayingId(null)}
                          className="min-h-11 rounded-lg border border-amber-200 px-3 text-sm text-amber-700 hover:bg-amber-100 dark:border-amber-500/30 dark:text-amber-300"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <DebtorDetail customerId={c.id} debtTotal={c.debt} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
