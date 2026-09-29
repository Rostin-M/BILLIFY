"use client";

import { UtensilsCrossed } from "lucide-react";
import { useState } from "react";

import { type PlanCode } from "~/lib/subscription/catalog";
import { PlanExpiredScreen } from "~/app/_components/subscription/PlanExpiredScreen";
import { api } from "~/trpc/react";
import { MesasClient } from "./MesasClient";

type Business = { name: string; document: string; logoUrl?: string | null };

/**
 * Mesas en solo lectura: no se abren mesas nuevas, pero las que quedaron abiertas
 * se pueden cobrar o cancelar (el servidor lo permite para no dejar cuentas a medias).
 */
export function MesasReadOnly({
  business,
  isOwner,
  plan,
}: Readonly<{ business: Business; isOwner: boolean; plan: PlanCode }>) {
  const [showOpen, setShowOpen] = useState(false);
  const { data: sessions = [] } = api.tableSession.listActive.useQuery();
  const openCount = sessions.length;

  if (showOpen && openCount > 0) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-900/20 dark:text-red-200">
          <span>Solo puedes cobrar o cancelar las mesas abiertas. No se pueden agregar pedidos.</span>
          <button
            type="button"
            onClick={() => setShowOpen(false)}
            className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold transition hover:bg-red-100 dark:border-red-500/40 dark:hover:bg-red-900/40"
          >
            Volver
          </button>
        </div>
        <MesasClient business={business} />
      </div>
    );
  }

  return (
    <PlanExpiredScreen isOwner={isOwner} plan={plan}>
      {openCount > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-500/30 dark:bg-amber-900/20">
          <UtensilsCrossed className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
          <p className="flex-1 text-sm text-amber-800 dark:text-amber-300">
            {openCount === 1 ? "Quedó 1 mesa abierta." : `Quedaron ${openCount} mesas abiertas.`} Puedes cobrarlas o
            cancelarlas para cerrar el turno.
          </p>
          <button
            type="button"
            onClick={() => setShowOpen(true)}
            className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-500"
          >
            Ver mesas abiertas
          </button>
        </div>
      )}
    </PlanExpiredScreen>
  );
}
