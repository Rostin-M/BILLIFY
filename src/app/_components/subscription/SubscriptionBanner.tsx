"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, Clock, LockKeyhole, type LucideIcon } from "lucide-react";

import { formatDate } from "~/lib/subscription/notices";
import { api, type RouterOutputs } from "~/trpc/react";
import { days } from "./labels";

type Status = RouterOutputs["billing"]["status"];
type Tone = "quiet" | "notice" | "warning" | "danger";

type Banner = { tone: Tone; icon: LucideIcon; text: string; cta: string | null };

const TONE_CLASSES: Record<Tone, string> = {
  quiet: "border-slate-200 bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300",
  notice: "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-500/30 dark:bg-violet-900/20 dark:text-violet-200",
  warning: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-900/20 dark:text-amber-200",
  danger: "border-red-200 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-900/20 dark:text-red-200",
};

const CTA_CLASSES: Record<Tone, string> = {
  quiet: "text-violet-700 underline underline-offset-2 hover:text-violet-900 dark:text-violet-300 dark:hover:text-violet-100",
  notice: "rounded-lg bg-violet-600 px-3 py-1 text-white hover:bg-violet-500",
  warning: "rounded-lg bg-amber-600 px-3 py-1 text-white hover:bg-amber-500",
  danger: "rounded-lg bg-red-600 px-3 py-1 text-white hover:bg-red-500",
};

/** Qué aviso mostrar según el estado. `null` = nada. Exportado para pruebas. */
export function bannerFor(status: Status): Banner | null {
  const owner = status.isOwner;

  switch (status.phase) {
    case "READ_ONLY":
      return {
        tone: "danger",
        icon: LockKeyhole,
        text: owner
          ? "Tu cuenta está en solo lectura. Puedes ver tu historial, pero no vender."
          : "La cuenta está en solo lectura. Pídele al propietario que renueve el plan.",
        cta: owner ? "Pagar y reactivar" : null,
      };
    case "PAST_DUE":
      return {
        tone: "warning",
        icon: AlertTriangle,
        text: owner
          ? `Tu plan venció. Te quedan ${days(status.graceDaysLeft)} de gracia.`
          : `El plan venció. Quedan ${days(status.graceDaysLeft)} de gracia: avísale al propietario.`,
        cta: owner ? "Renovar" : null,
      };
    case "TRIAL": {
      const lastDays = status.daysLeft <= 2;
      if (!owner && !lastDays) return null;
      const when = status.daysLeft <= 1 ? "Hoy es el último día de" : `Quedan ${days(status.daysLeft)} de`;
      return {
        tone: lastDays ? "notice" : "quiet",
        icon: Clock,
        text: owner
          ? `${when} tu prueba gratis.${lastDays ? " Elige un plan para seguir vendiendo." : ""}`
          : `${when} la prueba gratis. Avísale al propietario.`,
        cta: owner ? "Elegir plan" : null,
      };
    }
    case "ACTIVE":
    case "CANCELED": {
      if (!owner || status.daysLeft > 7 || !status.endsAt) return null;
      const date = formatDate(status.endsAt);
      return {
        tone: "quiet",
        icon: Clock,
        text:
          status.phase === "CANCELED"
            ? `Cancelaste la renovación. Tu plan termina el ${date}.`
            : `Tu plan vence el ${date} (en ${days(status.daysLeft)}).`,
        cta: status.phase === "CANCELED" ? "Reactivar" : "Renovar",
      };
    }
  }
}

export function SubscriptionBanner() {
  const pathname = usePathname();
  const { data: status } = api.billing.status.useQuery(undefined, {
    refetchInterval: 5 * 60_000,
    refetchIntervalInBackground: false,
  });

  if (!status) return null;
  const banner = bannerFor(status);
  if (!banner) return null;

  const onSubscriptionPage = pathname.startsWith("/suscripcion");
  const Icon = banner.icon;

  return (
    <div
      role={banner.tone === "danger" || banner.tone === "warning" ? "alert" : "status"}
      className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b px-4 py-2 text-sm ${TONE_CLASSES[banner.tone]}`}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      <p className="min-w-0 flex-1">{banner.text}</p>
      {banner.cta && !onSubscriptionPage && (
        <Link href="/suscripcion" className={`shrink-0 text-xs font-semibold transition ${CTA_CLASSES[banner.tone]}`}>
          {banner.cta}
        </Link>
      )}
    </div>
  );
}
