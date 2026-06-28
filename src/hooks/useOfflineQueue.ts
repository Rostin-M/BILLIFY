"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type PendingSale,
  countPendingSales,
  getPendingSales,
  queueSale,
  removePendingSale,
} from "~/lib/offlineQueue";

type SyncInput = Omit<PendingSale, "localId" | "createdAt">;
type SyncFn = (sale: SyncInput) => Promise<void>;

export type SyncError = { time: string; message: string };

export function useOfflineQueue(syncFn: SyncFn) {
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncErrors, setSyncErrors] = useState<SyncError[]>([]);

  // Siempre usar la versión más reciente del syncFn sin recrear callbacks
  const syncFnRef = useRef(syncFn);
  syncFnRef.current = syncFn;

  const refreshCount = useCallback(async () => {
    try {
      const count = await countPendingSales();
      setPendingCount(count);
    } catch {
      // IndexedDB puede no estar disponible en SSR
    }
  }, []);

  const processQueue = useCallback(async () => {
    let pending: PendingSale[];
    try {
      pending = await getPendingSales();
    } catch {
      return;
    }

    if (pending.length === 0) return;

    setIsSyncing(true);
    setSyncErrors([]);
    const errors: SyncError[] = [];

    for (const sale of pending) {
      try {
        await syncFnRef.current({
          items: sale.items,
          paymentMethod: sale.paymentMethod,
          note: sale.note,
        });
        await removePendingSale(sale.localId);
      } catch (err) {
        errors.push({
          time: new Date(sale.createdAt).toLocaleTimeString("es-CO", {
            hour: "2-digit",
            minute: "2-digit",
          }),
          message: err instanceof Error ? err.message : "Error al sincronizar",
        });
      }
    }

    setSyncErrors(errors);
    setIsSyncing(false);
    await refreshCount();
  }, [refreshCount]);

  const addToQueue = useCallback(
    async (sale: SyncInput) => {
      const pending: PendingSale = {
        ...sale,
        localId: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      };
      await queueSale(pending);
      await refreshCount();
    },
    [refreshCount],
  );

  // Cargar conteo inicial
  useEffect(() => {
    void refreshCount();
  }, [refreshCount]);

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

  return { isOnline, pendingCount, isSyncing, syncErrors, addToQueue, processQueue };
}
