"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { CashOpenForm } from "./CashOpenForm";
import { CashDashboard } from "./CashDashboard";
import { SkeletonCashCard } from "~/app/_components/Skeletons";

type Props = { isOwner: boolean; business: { name: string; document: string; logoUrl?: string | null } };

const formatCOP = (v: number) =>
  v.toLocaleString("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0 });

function OtherRegisters({ excludeRegisterId }: Readonly<{ excludeRegisterId?: string }>) {
  const { data: others = [] } = api.cashRegister.listActive.useQuery(undefined, {
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  });
  const utils = api.useUtils();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const closeRegister = api.cashRegister.close.useMutation({
    onSuccess: async () => {
      setConfirmingId(null);
      await utils.cashRegister.listActive.invalidate();
      await utils.cashRegister.getActive.invalidate();
    },
  });

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
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    Abierta {openedTime} · Fondo inicial {formatCOP(r.openingBalance)}
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">
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

              {isConfirming && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm dark:border-red-500/30 dark:bg-red-900/10">
                  <p className="mb-2 font-medium text-red-700 dark:text-red-300">
                    ¿Cerrar la caja de {r.user?.name ?? "este empleado"}? Se calcula un saldo final de{" "}
                    {formatCOP(balance)} y ya no podrá seguir registrando ventas en ella.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => closeRegister.mutate({ registerId: r.id })}
                      disabled={closeRegister.isPending}
                      className="flex-1 rounded-lg bg-red-600 py-1.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
                    >
                      {closeRegister.isPending ? "Cerrando..." : "Sí, cerrar caja"}
                    </button>
                    <button
                      onClick={() => setConfirmingId(null)}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-500 hover:bg-white dark:border-white/10"
                    >
                      Cancelar
                    </button>
                  </div>
                  {closeRegister.error && (
                    <p className="mt-2 text-xs text-red-600">{closeRegister.error.message}</p>
                  )}
                </div>
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
        <p className="text-sm text-slate-400 dark:text-slate-500">
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
        <CashDashboard register={activeRegister} canClose={canClose} business={business} />
      )}
      {isOwner && <OtherRegisters excludeRegisterId={activeRegister?.id} />}
    </>
  );
}
