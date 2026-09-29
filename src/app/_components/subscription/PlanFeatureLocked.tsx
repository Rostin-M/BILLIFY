"use client";

import Link from "next/link";
import { Lock } from "lucide-react";

import { cheapestPlanWith, getPlan, planHasFeature, type PlanFeature } from "~/lib/subscription/catalog";
import { api } from "~/trpc/react";

/**
 * ¿El plan actual incluye la función? `undefined` mientras carga el estado, para
 * que la pantalla no llame (ni muestre) nada hasta saberlo.
 */
export function usePlanFeature(feature: PlanFeature): boolean | undefined {
  const { data } = api.billing.status.useQuery(undefined, { staleTime: 60_000 });
  if (!data) return undefined;
  return planHasFeature(data.plan, feature);
}

/** Aviso amable de "no está en tu plan" con enlace a /suscripcion. */
export function PlanFeatureLocked({
  feature,
  title,
  description,
  compact = false,
}: Readonly<{
  feature: PlanFeature;
  title: string;
  description?: string;
  /** Versión en una línea, para formularios. */
  compact?: boolean;
}>) {
  const { data } = api.billing.status.useQuery(undefined, { staleTime: 60_000 });
  const upgrade = cheapestPlanWith(feature);
  const planName = data ? getPlan(data.plan).name : null;
  const isOwner = data?.isOwner ?? false;
  const fromText = upgrade ? `Disponible desde el plan ${upgrade.name}.` : "No está disponible en tu plan.";

  if (compact) {
    return (
      <p className="flex items-start gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500 dark:border-white/15 dark:text-slate-400">
        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>
          {title}: {fromText}{" "}
          {isOwner && (
            <Link href="/suscripcion" className="font-semibold text-violet-600 underline underline-offset-2 dark:text-violet-400">
              Ver planes
            </Link>
          )}
        </span>
      </p>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-6 py-10 text-center shadow-sm dark:border-white/10 dark:bg-white/5">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-50 dark:bg-violet-900/20">
        <Lock className="h-6 w-6 text-violet-600 dark:text-violet-400" aria-hidden />
      </span>
      <h2 className="mt-4 text-lg font-bold text-slate-800 dark:text-white">{title}</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-500 dark:text-slate-400">
        {description ?? (planName ? `Tu plan ${planName} no lo incluye. ${fromText}` : fromText)}
      </p>
      {isOwner ? (
        <Link
          href="/suscripcion"
          className="mt-5 inline-block rounded-xl bg-violet-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-500"
        >
          {upgrade ? `Ver el plan ${upgrade.name}` : "Ver planes"}
        </Link>
      ) : (
        <p className="mt-4 text-xs text-slate-500 dark:text-slate-500">Pídele al propietario que cambie de plan.</p>
      )}
    </div>
  );
}
