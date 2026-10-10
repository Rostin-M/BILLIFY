import { CalendarPlus, ClipboardCheck, type LucideIcon, LogIn, ScrollText, Undo2, Zap } from "lucide-react";
import Link from "next/link";

import { type PlatformAuditRow } from "~/lib/platform/contract";

import { formatDateTime } from "../_lib/format";
import { linkClass, mutedText } from "./ui";

const ACTIONS: Record<string, { label: string; icon: LucideIcon; tone: string }> = {
  GRANT_PLAN: {
    label: "Activó un plan",
    icon: Zap,
    tone: "bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-200",
  },
  EXTEND_TRIAL: {
    label: "Extendió una prueba",
    icon: CalendarPlus,
    tone: "bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-200",
  },
  REVOKE_GRANT: {
    label: "Revocó una activación",
    icon: Undo2,
    tone: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200",
  },
  RESOLVE_PAYMENT_REVIEW: {
    label: "Revisó un pago",
    icon: ClipboardCheck,
    tone: "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200",
  },
  ADMIN_LOGIN: {
    label: "Ingreso al panel",
    icon: LogIn,
    tone: "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-300",
  },
};

const FALLBACK = {
  icon: ScrollText,
  tone: "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-300",
};

/** Acción que el panel aún no conoce: "SOME_NEW_ACTION" → "Some new action". */
function readableAction(action: string): string {
  const text = action.replace(/_/g, " ").trim().toLowerCase();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "Acción";
}

/** Registro de acciones de administrador, de la más reciente a la más antigua. */
export function AuditList({
  entries,
  showBusiness = false,
}: Readonly<{
  entries: PlatformAuditRow[];
  /** En la bitácora global: nombre del negocio con enlace. */
  showBusiness?: boolean;
}>) {
  return (
    <ol className="divide-y divide-slate-100 dark:divide-white/5">
      {entries.map((entry) => {
        const known = ACTIONS[entry.action];
        const Icon = known?.icon ?? FALLBACK.icon;
        return (
          <li key={entry.id} className="flex gap-3 px-4 py-3.5 sm:px-5">
            <span
              aria-hidden
              className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${known?.tone ?? FALLBACK.tone}`}
            >
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className="font-semibold text-slate-900 dark:text-white">{known?.label ?? readableAction(entry.action)}</span>
                {showBusiness && entry.businessId && entry.businessName && (
                  <Link href={`/admin/negocios/${entry.businessId}`} className={`${linkClass} line-clamp-1`}>
                    {entry.businessName}
                  </Link>
                )}
              </p>
              <p className="mt-0.5 break-words text-sm text-slate-700 dark:text-slate-300">{entry.summary}</p>
              <p className={`mt-1 text-xs tabular-nums ${mutedText}`}>
                <time dateTime={entry.createdAt.toISOString()}>{formatDateTime(entry.createdAt)}</time>
                {`, ${entry.adminName ?? entry.adminEmail ?? "Administrador desconocido"}`}
                {entry.ip && `, IP ${entry.ip}`}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
