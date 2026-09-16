"use client";

import type { SyncError } from "~/hooks/useOfflineQueue";

type Props = {
  isOnline: boolean;
  pendingCount: number;
  isSyncing: boolean;
  syncErrors: SyncError[];
  onManualSync: () => void;
};

export function OfflineBanner({ isOnline, pendingCount, isSyncing, syncErrors, onManualSync }: Readonly<Props>) {
  if (isOnline && pendingCount === 0 && syncErrors.length === 0) return null;

  return (
    <div className="mb-4 space-y-2">
      {/* Sin conexión */}
      {!isOnline && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-500/30 dark:bg-amber-900/20">
          <span className="text-lg">📶</span>
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
          <span className="text-lg">{isSyncing ? "⏳" : "🕐"}</span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">
              {isSyncing
                ? "Sincronizando ventas..."
                : `${pendingCount} ${pendingCount === 1 ? "venta pendiente" : "ventas pendientes"} de sincronización`}
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

      {/* Errores de sincronización */}
      {syncErrors.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-500/30 dark:bg-red-900/20">
          <p className="mb-1 text-sm font-semibold text-red-700 dark:text-red-300">
            {syncErrors.length === 1
              ? "1 venta no pudo sincronizarse"
              : `${syncErrors.length} ventas no pudieron sincronizarse`}
          </p>
          <ul className="space-y-0.5">
            {syncErrors.map((e, i) => (
              <li key={i} className="text-xs text-red-600 dark:text-red-400">
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
