"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { CashOpenForm } from "./CashOpenForm";
import { CashDashboard } from "./CashDashboard";
import { CashCloseForm } from "./CashCloseForm";
import { SkeletonCashCard } from "~/app/_components/Skeletons";
import { formatCOP } from "~/lib/format/money";

type Props = { isOwner: boolean; business: { name: string; document: string; logoUrl?: string | null } };

function OtherRegisters({ excludeRegisterId }: Readonly<{ excludeRegisterId?: string }>) {
  const { data: others = [] } = api.cashRegister.listActive.useQuery(undefined, {
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  });
  // Solo el dueño ve esta lista: el arqueo por billetes y monedas sale de su configuración.
  const { data: settings } = api.business.getSettings.useQuery(undefined, { staleTime: 60_000 });
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const filtered = others.filter((r) => r.id !== excludeRegisterId);
  if (filtered.length === 0) return null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/5">
      <h2 className="px-5 pt-5 font-semibold text-slate-700 dark:text-slate-200">
        Cajas abiertas por empleados
      </h2>
      <ul className="mt-3 divide-y divide-slate-100 dark:divide-white/5">
        {filtered.map((r) => {
          const openedTime = new Date(r.openedAt).toLocaleTimeString("es-CO", {
            timeZone: "America/Bogota",
            hour: "2-digit",
            minute: "2-digit",
          });
          const balance = r.movementsBalance;
          const isConfirming = confirmingId === r.id;
          return (
            <li key={r.id} className="flex flex-col gap-3 px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-700 dark:text-slate-200">
                    {r.user?.name ?? "Sin nombre"}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Abierta {openedTime} · Fondo inicial {formatCOP(r.openingBalance)}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Balance movimientos: {formatCOP(balance)}
                    {r.manualIncome > 0 && ` · +${formatCOP(r.manualIncome)} entradas`}
                    {r.manualExpense > 0 && ` · −${formatCOP(r.manualExpense)} salidas`}
                  </p>
                </div>
                {!isConfirming && (
                  <button
                    onClick={() => setConfirmingId(r.id)}
                    className="shrink-0 rounded-xl border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 dark:border-red-500/30 dark:bg-transparent dark:text-red-400 dark:hover:bg-red-900/20"
                  >
                    Cerrar caja
                  </button>
                )}
              </div>

              {/* El dueño cuenta el efectivo de esa caja; el esperado (con ventas) se ve tras contar. */}
              {isConfirming && (
                <CashCloseForm
                  registerId={r.id}
                  expected={null}
                  byDenomination={settings?.cashCountByDenomination ?? false}
                  ownerName={r.user?.name ?? "este empleado"}
                  onClosed={() => setConfirmingId(null)}
                  onCancel={() => setConfirmingId(null)}
                />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function CashRegisterView({ isOwner, business }: Readonly<Props>) {
  const { data: activeRegister, isPending } = api.cashRegister.getActive.useQuery(undefined, {
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  });

  if (isPending) {
    return <SkeletonCashCard />;
  }

  if (activeRegister !== null && activeRegister !== undefined && "noCashAccess" in activeRegister) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
        <p className="text-base font-medium text-slate-600 dark:text-slate-300">Sin acceso a caja</p>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          El propietario no te ha habilitado la gestión de caja. Contacta al propietario si necesitas acceso.
        </p>
      </div>
    );
  }

  // Puede cerrar si es owner o si la caja activa es la suya propia
  const canClose = isOwner || (activeRegister?.isOwnRegister ?? false);

  return (
    <>
      {!activeRegister ? <CashOpenForm /> : (
        <>
          {/* El cajero que está viendo la caja de otro puede abrir la suya para operar */}
          {!canClose && <CashOpenForm />}
          <CashDashboard register={activeRegister} canClose={canClose} business={business} />
        </>
      )}
      {isOwner && <OtherRegisters excludeRegisterId={activeRegister?.id} />}
    </>
  );
}
