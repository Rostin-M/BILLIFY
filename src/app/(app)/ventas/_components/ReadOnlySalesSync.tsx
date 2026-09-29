"use client";

import { useCallback } from "react";

import { useOfflineQueue } from "~/hooks/useOfflineQueue";
import { type SyncInput } from "~/lib/offlineQueue";
import { api } from "~/trpc/react";
import { OfflineBanner } from "./OfflineBanner";

/**
 * Sincronización de ventas sin conexión cuando la cuenta está en solo lectura.
 *
 * El POS (que es quien normalmente reenvía la cola) no se monta en solo lectura,
 * pero las ventas hechas sin conexión ANTES del bloqueo todavía se aceptan en el
 * servidor (ver `acceptsOfflineSale`). Este componente mantiene vivo ese reenvío
 * con el mismo hook y el mismo aviso del POS. Las que el servidor rechace se
 * quedan guardadas en el equipo y se envían cuando el negocio renueve.
 */
export function ReadOnlySalesSync({ userId, businessId }: Readonly<{ userId: string; businessId: string }>) {
  const utils = api.useUtils();
  const syncSale = api.sale.create.useMutation();

  const syncFn = useCallback(
    async (sale: SyncInput) => {
      await syncSale.mutateAsync({ ...sale, saleType: "QUICK" });
      void utils.sale.list.invalidate();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const { isOnline, pendingCount, legacySales, isSyncing, syncErrors, processQueue, discardLegacy } =
    useOfflineQueue(syncFn, { userId, businessId });

  return (
    <OfflineBanner
      isOnline={isOnline}
      pendingCount={pendingCount}
      isSyncing={isSyncing}
      syncErrors={syncErrors}
      onManualSync={processQueue}
      legacySales={legacySales}
      onDiscardLegacy={discardLegacy}
    />
  );
}
