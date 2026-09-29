"use client";

import Link from "next/link";
import { BadgeCheck } from "lucide-react";

import { CYCLE_LABELS } from "~/lib/subscription/catalog";
import { formatDate } from "~/lib/subscription/notices";
import { PHASE_CHIP_CLASSES, PHASE_LABELS } from "~/app/_components/subscription/labels";
import { api } from "~/trpc/react";
import { cardClass } from "./ui";

// Resumen de solo lectura: el plan se cambia y se paga en /suscripcion.
export function PlanSection() {
  const { data: status, isPending } = api.billing.status.useQuery();

  return (
    <section className={cardClass}>
      <h2 className="font-semibold">Plan</h2>
      <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Tu plan actual de BILLIFY.</p>

      {isPending && <p className="mt-5 text-sm text-slate-500 dark:text-slate-400">Cargando plan...</p>}

      {status && (
        <div className="mt-5 rounded-xl border border-violet-200 bg-violet-50 p-4 dark:border-violet-500/30 dark:bg-violet-900/20">
          <div className="flex flex-wrap items-center gap-3">
            <BadgeCheck className="h-6 w-6 shrink-0 text-violet-600 dark:text-violet-400" aria-hidden />
            <p className="text-sm font-semibold text-violet-700 dark:text-violet-300">
              Plan {status.planName}
              {status.phase !== "TRIAL" && ` · ${CYCLE_LABELS[status.billingCycle]}`}
            </p>
            <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${PHASE_CHIP_CLASSES[status.phase]}`}>
              {PHASE_LABELS[status.phase]}
            </span>
          </div>
          <ul className="mt-3 space-y-1 text-xs text-violet-800/90 dark:text-violet-200/80">
            {status.endsAt && (
              <li>
                {status.phase === "TRIAL" ? "La prueba termina" : "Vence"} el {formatDate(status.endsAt)}
              </li>
            )}
            <li>
              Cajas abiertas al mismo tiempo: {status.usage.cashRegisters.effective} de {status.usage.cashRegisters.limit}
            </li>
            <li>
              Usuarios: {status.usage.users.used} de {status.usage.users.limit}
            </li>
          </ul>
          <Link
            href="/suscripcion"
            className="mt-4 inline-block rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-500"
          >
            Ver planes y pagos
          </Link>
        </div>
      )}
    </section>
  );
}
