import Link from "next/link";

import { type PlatformOverview } from "~/lib/platform/contract";
import { type SubscriptionPhase } from "~/lib/subscription/access";

import { formatNumber } from "../_lib/format";
import { mutedText } from "./ui";

const SEGMENTS: { phase: SubscriptionPhase; key: keyof PlatformOverview; label: string; color: string }[] = [
  { phase: "TRIAL", key: "trial", label: "En prueba", color: "bg-sky-500" },
  { phase: "ACTIVE", key: "active", label: "Activos", color: "bg-emerald-500" },
  { phase: "PAST_DUE", key: "pastDue", label: "En gracia", color: "bg-amber-500" },
  { phase: "CANCELED", key: "canceled", label: "Cancelados", color: "bg-slate-400" },
  { phase: "READ_ONLY", key: "readOnly", label: "Solo lectura", color: "bg-red-500" },
];

/**
 * Todos los negocios repartidos por estado: una barra apilada y, debajo, cada
 * estado con su número, que es un enlace a la lista ya filtrada.
 */
export function PhaseBreakdown({ overview }: Readonly<{ overview: PlatformOverview }>) {
  return (
    <div>
      <p className="flex items-baseline gap-2">
        <span className="text-3xl font-bold tabular-nums tracking-tight text-slate-900 dark:text-white">
          {formatNumber(overview.total)}
        </span>
        <span className={`text-sm ${mutedText}`}>
          {overview.total === 1 ? "negocio registrado" : "negocios registrados"}
          {overview.newLast30Days > 0 && `, ${formatNumber(overview.newLast30Days)} en los últimos 30 días`}
        </span>
      </p>

      <div aria-hidden className="mt-4 flex h-3 gap-0.5 overflow-hidden rounded-full">
        {SEGMENTS.filter((s) => overview[s.key] > 0).map((s) => (
          <div key={s.phase} className={`${s.color} min-w-1.5`} style={{ flexGrow: overview[s.key], flexBasis: 0 }} />
        ))}
      </div>

      <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
        {SEGMENTS.map((s) => (
          <li key={s.phase}>
            <Link
              href={`/admin/negocios?estado=${s.phase}`}
              className="group -mx-2 flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-100 dark:hover:bg-white/5"
            >
              <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-sm ${s.color}`} />
              <span className="text-sm text-slate-700 group-hover:text-slate-900 dark:text-slate-300 dark:group-hover:text-white">
                {s.label}
              </span>
              <span className="ml-auto text-sm font-semibold tabular-nums text-slate-900 dark:text-white">
                {formatNumber(overview[s.key])}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
