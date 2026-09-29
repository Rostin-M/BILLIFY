"use client";

import Link from "next/link";
import { Receipt } from "lucide-react";

import { CYCLE_LABELS, getPlan } from "~/lib/subscription/catalog";
import { formatDate } from "~/lib/subscription/notices";
import {
  formatCents,
  PAYMENT_STATUS_CLASSES,
  PAYMENT_STATUS_LABELS,
} from "~/app/_components/subscription/labels";
import { EmptyState } from "~/app/_components/EmptyState";
import { api, type RouterOutputs } from "~/trpc/react";

type Payment = RouterOutputs["billing"]["payments"][number];

function concept(p: Payment): string {
  const plan = getPlan(p.plan).name;
  if (p.kind === "UPGRADE") return `Cambio a ${plan} (resto del período)`;
  return `Plan ${plan} ${CYCLE_LABELS[p.billingCycle].toLowerCase()}`;
}

function periodText(p: Payment): string | null {
  if (p.status !== "APPROVED" || !p.periodStart || !p.periodEnd) return null;
  return `${formatDate(p.periodStart)} – ${formatDate(p.periodEnd)}`;
}

export function PaymentHistory({ mockPayments }: Readonly<{ mockPayments: boolean }>) {
  const { data: payments, isPending } = api.billing.payments.useQuery();

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-white/5">
      <div className="border-b border-slate-100 px-5 py-4 dark:border-white/10 sm:px-6">
        <h2 className="font-semibold text-slate-800 dark:text-white">Historial de pagos</h2>
      </div>

      {isPending && <p className="px-5 py-8 text-center text-sm text-slate-500">Cargando pagos...</p>}

      {payments?.length === 0 && (
        <EmptyState icon={Receipt} title="Aún no tienes pagos" description="Cuando pagues un plan, aparecerá aquí." />
      )}

      {payments && payments.length > 0 && (
        <ul className="divide-y divide-slate-100 dark:divide-white/5">
          {payments.map((p) => {
            const period = periodText(p);
            const canComplete = mockPayments && p.provider === "mock" && p.status === "PENDING";
            return (
              <li key={p.id} className="flex flex-col gap-2 px-5 py-3.5 sm:flex-row sm:items-center sm:gap-4 sm:px-6">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{concept(p)}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-500">
                    {formatDate(p.paidAt ?? p.createdAt)}
                    {period && <span className="block sm:inline"> · Cubre {period}</span>}
                  </p>
                  {p.statusMessage && p.status !== "APPROVED" && (
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{p.statusMessage}</p>
                  )}
                  <p className="mt-0.5 font-mono text-[11px] text-slate-400 dark:text-slate-500">{p.reference}</p>
                </div>
                <div className="flex items-center gap-3 sm:justify-end">
                  <span className="text-sm font-semibold tabular-nums text-slate-800 dark:text-slate-100">
                    {formatCents(p.amountInCents)}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${PAYMENT_STATUS_CLASSES[p.status]}`}>
                    {PAYMENT_STATUS_LABELS[p.status]}
                  </span>
                  {canComplete && (
                    <Link
                      href={`/suscripcion/pago-simulado?ref=${encodeURIComponent(p.reference)}`}
                      className="text-xs font-semibold text-violet-600 underline underline-offset-2 dark:text-violet-400"
                    >
                      Completar
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
