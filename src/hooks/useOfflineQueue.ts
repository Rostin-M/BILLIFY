"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type PendingSale,
  type QueueOwner,
  type SyncError,
  type SyncFn,
  type SyncInput,
  discardLegacySales,
  loadQueueFor,
  queueSale,
  replayPendingSales,
} from "~/lib/offlineQueue";

export type { SyncError } from "~/lib/offlineQueue";

/** Resumen de una venta heredada sin dueño, para que el usuario decida descartarla. */
export type LegacySaleSummary = {
  localId: string;
  time: string;
  itemCount: number;
  paymentMethod: PendingSale["paymentMethod"];
};

/**
 * Cola de ventas sin conexión ligada al usuario y negocio actuales: solo cuenta,
 * muestra y reenvía las ventas que registró esta misma persona en este negocio.
 * Las de otros usuarios del equipo se conservan (hasta 72 h) sin tocarlas.
 */
export function useOfflineQueue(syncFn: SyncFn, owner: QueueOwner) {
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [pendingCount, setPendingCount] = useState(0);
  const [legacySales, setLegacySales] = useState<LegacySaleSummary[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncErrors, setSyncErrors] = useState<SyncError[]>([]);

  // Siempre usar la versión más reciente del syncFn sin recrear callbacks
  const syncFnRef = useRef(syncFn);
  syncFnRef.current = syncFn;

  const { userId, businessId } = owner;

  const refreshCount = useCallback(async (): Promise<number> => {
    try {
      const { own, legacy } = await loadQueueFor({ userId, businessId });
      setPendingCount(own.length);
      setLegacySales(
        legacy.map((s) => ({
          localId: s.localId,
          time: new Date(s.createdAt).toLocaleString("es-CO", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          }),
          itemCount: s.items.length,
          paymentMethod: s.paymentMethod,
        })),
      );
      return own.length;
    } catch {
      // IndexedDB puede no estar disponible en SSR
      return 0;
    }
  }, [userId, businessId]);

  const processQueue = useCallback(async () => {
    const count = await refreshCount();
    if (count === 0) return;

    setIsSyncing(true);
    setSyncErrors([]);
    try {
      const errors = await replayPendingSales({ userId, businessId }, (sale) =>
        syncFnRef.current(sale),
      );
      setSyncErrors(errors);
    } catch {
      // Sin IndexedDB: nada que sincronizar.
    } finally {
      setIsSyncing(false);
      await refreshCount();
    }
  }, [refreshCount, userId, businessId]);

  const addToQueue = useCallback(
    async (sale: SyncInput) => {
      const pending: PendingSale = {
        ...sale,
        userId,
        businessId,
        localId: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      };
      await queueSale(pending);
      await refreshCount();
    },
    [refreshCount, userId, businessId],
  );

  const discardLegacy = useCallback(async () => {
    await discardLegacySales();
    await refreshCount();
  }, [refreshCount]);

  // Al montar (p. ej. el dueño vuelve a iniciar sesión en este equipo): contar y,
  // si hay conexión, reenviar sus ventas pendientes.
  useEffect(() => {
    if (navigator.onLine) void processQueue();
    else void refreshCount();
  }, [processQueue, refreshCount]);

  // Escuchar eventos de red
  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
      void processQueue();
    }
    function handleOffline() {
      setIsOnline(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [processQueue]);

  return {
    isOnline,
    pendingCount,
    legacySales,
    isSyncing,
    syncErrors,
    addToQueue,
    processQueue,
    discardLegacy,
  };
}
