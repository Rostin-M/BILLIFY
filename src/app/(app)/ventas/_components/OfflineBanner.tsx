"use client";

import { AlertTriangle, Clock, Loader2, WifiOff } from "lucide-react";
import { useState } from "react";

import type { LegacySaleSummary, SyncError } from "~/hooks/useOfflineQueue";

const PAYMENT_LABEL: Record<LegacySaleSummary["paymentMethod"], string> = {
  CASH: "Efectivo",
  CARD: "Tarjeta",
  CREDIT: "Fiado",
  TRANSFER: "Transferencia",
};

type Props = {
  isOnline: boolean;
  pendingCount: number;
  isSyncing: boolean;
  syncErrors: SyncError[];
  onManualSync: () => void;
  /** Ventas guardadas por una versión anterior, sin usuario ni negocio asociado. */
  legacySales: LegacySaleSummary[];
  onDiscardLegacy: () => Promise<void>;
};

export function OfflineBanner({
  isOnline,
  pendingCount,
  isSyncing,
  syncErrors,
  onManualSync,
  legacySales,
  onDiscardLegacy,
}: Readonly<Props>) {
  if (isOnline && pendingCount === 0 && syncErrors.length === 0 && legacySales.length === 0) {
    return null;
  }

  const pendingWord = pendingCount === 1 ? "venta pendiente" : "ventas pendientes";
  const pendingLabel = isSyncing
    ? "Sincronizando ventas..."
    : `${pendingCount} ${pendingWord} de sincronización`;

  return (
    <div className="mb-4 space-y-2">
      {/* Sin conexión */}
      {!isOnline && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-500/30 dark:bg-amber-900/20">
          <WifiOff className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              Sin conexión a internet
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Las ventas se guardan localmente y se sincronizan al recuperar la señal.
            </p>
          </div>
        </div>
      )}

      {/* Ventas pendientes */}
      {pendingCount > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-500/30 dark:bg-blue-900/20">
          {isSyncing ? (
            <Loader2 className="h-5 w-5 shrink-0 animate-spin text-blue-600 dark:text-blue-400" />
          ) : (
            <Clock className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
          )}
          <div className="flex-1">
            <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">
              {pendingLabel}
            </p>
            {!isSyncing && isOnline && (
              <p className="text-xs text-blue-600 dark:text-blue-400">
                Conexión recuperada · sincronizando automáticamente...
              </p>
            )}
          </div>
          {!isSyncing && isOnline && (
            <button
              onClick={onManualSync}
              className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700"
            >
              Sincronizar
            </button>
          )}
        </div>
      )}

      {legacySales.length > 0 && (
        <LegacySalesNotice sales={legacySales} onDiscard={onDiscardLegacy} />
      )}

      {/* Errores de sincronización */}
      {syncErrors.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-500/30 dark:bg-red-900/20">
          <p className="mb-1 text-sm font-semibold text-red-700 dark:text-red-300">
            {syncErrors.length === 1
              ? "1 venta no pudo sincronizarse"
              : `${syncErrors.length} ventas no pudieron sincronizarse`}
          </p>
          <ul className="space-y-0.5">
            {syncErrors.map((e) => (
              <li key={`${e.time}|${e.message}`} className="text-xs text-red-600 dark:text-red-400">
                {e.time}: {e.message}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-red-500 dark:text-red-400">
            Revisa el inventario y vuelve a intentarlo manualmente.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Ventas sin conexión de una versión anterior de BILLIFY: no guardan quién las registró,
 * así que no se reenvían automáticamente (podrían quedar a nombre de otro cajero u otro
 * negocio). Se muestran para registrarlas a mano si hace falta y descartarlas.
 */
function LegacySalesNotice({
  sales,
  onDiscard,
}: Readonly<{ sales: LegacySaleSummary[]; onDiscard: () => Promise<void> }>) {
  const [confirming, setConfirming] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const count = sales.length;
  const title =
    count === 1
      ? "Hay 1 venta sin conexión de una versión anterior"
      : `Hay ${count} ventas sin conexión de una versión anterior`;

  async function handleDiscard() {
    setDiscarding(true);
    setError(null);
    try {
      await onDiscard();
      setConfirming(false);
    } catch {
      setError("No se pudieron descartar. Intenta de nuevo.");
    } finally {
      setDiscarding(false);
    }
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-500/30 dark:bg-amber-900/20">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="flex-1 space-y-1">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">{title}</p>
          <p className="text-xs text-amber-700 dark:text-amber-400">
            No se sabe qué usuario las registró, por eso no se sincronizan automáticamente.
            Si alguna no quedó registrada, ingrésala de nuevo y luego descártalas de este equipo.
          </p>
          <ul className="space-y-0.5 pt-1">
            {sales.map((s) => (
              <li key={s.localId} className="text-xs text-amber-700 dark:text-amber-400">
                {s.time} · {s.itemCount} {s.itemCount === 1 ? "producto" : "productos"} ·{" "}
                {PAYMENT_LABEL[s.paymentMethod] ?? s.paymentMethod}
              </li>
            ))}
          </ul>
          {error && <p className="text-xs font-medium text-red-600 dark:text-red-400">{error}</p>}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap justify-end gap-2">
        {confirming ? (
          <>
            <span className="self-center text-xs font-medium text-amber-800 dark:text-amber-300">
              ¿Descartar {count === 1 ? "esta venta" : `estas ${count} ventas`}? No se puede deshacer.
            </span>
            <button
              type="button"
              onClick={() => void handleDiscard()}
              disabled={discarding}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
            >
              {discarding ? "Descartando..." : "Sí, descartar"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={discarding}
              className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-100 disabled:opacity-60 dark:border-amber-500/40 dark:text-amber-300 dark:hover:bg-amber-900/40"
            >
              Cancelar
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-100 dark:border-amber-500/40 dark:text-amber-300 dark:hover:bg-amber-900/40"
          >
            Descartar
          </button>
        )}
      </div>
    </div>
  );
}
