"use client";

import { CalendarClock, Repeat } from "lucide-react";
import { useEffect, useState } from "react";

import { addMonths, cycleMonths } from "~/lib/subscription/billing";
import { CYCLE_LABELS, getPlan, GRACE_DAYS, TRIAL_DAYS } from "~/lib/subscription/catalog";
import { formatDate } from "~/lib/subscription/notices";
import { days, PHASE_CHIP_CLASSES, PHASE_LABELS } from "~/app/_components/subscription/labels";
import { type RouterOutputs } from "~/trpc/react";
import { CancelControl } from "./CancelControl";

type Status = RouterOutputs["billing"]["status"];

const DAY_MS = 24 * 60 * 60 * 1000;

/** Línea principal bajo el nombre del plan, según la fase. */
function headline(s: Status): string {
  const date = s.endsAt ? formatDate(s.endsAt) : null;
  switch (s.phase) {
    case "TRIAL":
      return date ? `Tu prueba gratis termina el ${date}. Quedan ${days(s.daysLeft)}.` : "Estás en la prueba gratis.";
    case "ACTIVE":
      return date ? `Vence el ${date}. Quedan ${days(s.daysLeft)}.` : "Tu plan está activo.";
    case "PAST_DUE":
      return `Tu plan venció${date ? ` el ${date}` : ""}. Te quedan ${days(s.graceDaysLeft)} de gracia con acceso completo.`;
    case "CANCELED":
      return date ? `Cancelaste la renovación. Tienes acceso hasta el ${date}.` : "Cancelaste la renovación.";
    case "READ_ONLY":
      return "Tu cuenta está en solo lectura: puedes consultar tu historial, pero no vender ni crear.";
  }
}

/** Qué pasa al llegar a la fecha de fin (texto corto bajo la barra). */
function afterEnd(s: Status): string | null {
  switch (s.phase) {
    case "TRIAL":
      return "Si no pagas antes, la cuenta pasa directo a solo lectura (la prueba no tiene días de gracia).";
    case "ACTIVE":
      return `Después del vencimiento tienes ${days(GRACE_DAYS)} de gracia; luego, solo lectura.`;
    case "CANCELED":
      return "Al terminar, la cuenta pasa directo a solo lectura, sin días de gracia.";
    case "PAST_DUE":
      return "Si no renuevas, la cuenta pasa a solo lectura al terminar la gracia.";
    default:
      return null;
  }
}

/** Porcentaje del período ya consumido, para la barra de tiempo. */
function periodProgress(s: Status, now: number): { start: Date; end: Date; pct: number } | null {
  if (!s.endsAt || s.phase === "READ_ONLY") return null;
  const end = s.endsAt;
  const start =
    s.phase === "TRIAL" ? new Date(end.getTime() - TRIAL_DAYS * DAY_MS) : addMonths(end, -cycleMonths(s.billingCycle));
  const total = end.getTime() - start.getTime();
  if (total <= 0) return null;
  const pct = Math.min(100, Math.max(0, ((now - start.getTime()) / total) * 100));
  return { start, end, pct };
}

const BAR_COLOR: Record<Status["phase"], string> = {
  TRIAL: "bg-sky-500",
  ACTIVE: "bg-emerald-500",
  PAST_DUE: "bg-amber-500",
  CANCELED: "bg-slate-400",
  READ_ONLY: "bg-red-500",
};

export function StatusCard({ status }: Readonly<{ status: Status }>) {
  const plan = getPlan(status.plan);
  // La hora actual solo en el cliente: evita diferencias de hidratación en la barra.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now()), []);
  const progress = periodProgress(status, now ?? 0);
  const note = afterEnd(status);
  const scheduled = status.scheduledPlan && status.scheduledFrom ? status : null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-slate-500 dark:text-slate-400">Tu plan</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{plan.name}</h2>
            {status.phase !== "TRIAL" && (
              <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
                {CYCLE_LABELS[status.billingCycle]}
              </span>
            )}
            <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${PHASE_CHIP_CLASSES[status.phase]}`}>
              {PHASE_LABELS[status.phase]}
            </span>
          </div>
        </div>
      </div>

      <p className="mt-3 text-sm text-slate-700 dark:text-slate-300">{headline(status)}</p>

      {progress && (
        <div className="mt-4">
          <div
            className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10"
            role="progressbar"
            aria-label="Tiempo usado del período"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={now === null ? undefined : Math.round(progress.pct)}
          >
            <div className={`h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none ${BAR_COLOR[status.phase]}`} style={{ width: now === null ? 0 : `${progress.pct}%` }} />
          </div>
          <div className="mt-1.5 flex justify-between text-xs text-slate-500 dark:text-slate-500">
            <span>{formatDate(progress.start)}</span>
            <span>{formatDate(progress.end)}</span>
          </div>
        </div>
      )}

      {note && <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{note}</p>}

      {scheduled && (
        <p className="mt-4 flex items-start gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2.5 text-sm text-violet-800 dark:border-violet-500/30 dark:bg-violet-900/20 dark:text-violet-200">
          <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            Cambio programado: desde el {formatDate(scheduled.scheduledFrom!)} pasas al plan{" "}
            {getPlan(scheduled.scheduledPlan!).name}
            {scheduled.scheduledCycle ? ` ${CYCLE_LABELS[scheduled.scheduledCycle].toLowerCase()}` : ""}. Ya está pagado.
          </span>
        </p>
      )}

      {status.phase === "CANCELED" && (
        <p className="mt-4 flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
          <Repeat className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>No te volveremos a recordar la renovación. Puedes reactivarla cuando quieras antes del vencimiento.</span>
        </p>
      )}

      {status.isOwner ? (
        <CancelControl status={status} />
      ) : (
        <p className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
          {status.phase === "READ_ONLY" || status.phase === "PAST_DUE"
            ? "Pídele al propietario que renueve el plan para seguir vendiendo."
            : "Los pagos y cambios de plan los hace el propietario del negocio."}
        </p>
      )}
    </section>
  );
}
