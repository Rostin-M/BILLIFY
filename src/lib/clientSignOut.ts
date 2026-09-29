"use client";

import { signOut } from "next-auth/react";

import {
  type QueueOwner,
  type SyncFn,
  countOwnPendingSales,
  replayPendingSales,
} from "~/lib/offlineQueue";

/**
 * Borradores locales con datos del negocio (carrito, cliente, nota, medio de pago) de
 * Venta rápida y Factura. No son por usuario: se borran al cerrar sesión para que el
 * siguiente usuario del equipo no los vea.
 */
const BUSINESS_DRAFT_KEYS = [
  "billify_quick_cart",
  "billify_quick_payment",
  "billify_quick_customer",
  "billify_invoice_cart",
  "billify_invoice_customer",
  "billify_invoice_note",
  "billify_invoice_payment",
];

function clearLocalBusinessData() {
  try {
    for (const key of BUSINESS_DRAFT_KEYS) localStorage.removeItem(key);
  } catch {
    // Almacenamiento bloqueado (modo privado estricto): nada que borrar.
  }
  try {
    sessionStorage.clear();
  } catch {
    // Idem.
  }
}

async function clearCacheStorage() {
  // El service worker no guarda páginas hoy, pero si alguna vez lo hace, esas páginas
  // (HTML con datos del negocio) no deben sobrevivir al cierre de sesión.
  try {
    if (typeof caches === "undefined") return;
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  } catch {
    // Sin Cache Storage o sin permiso: ignorar.
  }
}

/**
 * Ventas sin conexión de `owner` que siguen pendientes. Si hay red y se pasa `syncFn`,
 * primero intenta enviarlas. Nunca descarta ventas: son registros de dinero.
 */
export async function pendingSalesBeforeSignOut(
  owner: QueueOwner,
  syncFn?: SyncFn,
): Promise<number> {
  try {
    if (syncFn && navigator.onLine && (await countOwnPendingSales(owner)) > 0) {
      await replayPendingSales(owner, syncFn);
    }
    return await countOwnPendingSales(owner);
  } catch {
    // IndexedDB no disponible: no hay cola que proteger.
    return 0;
  }
}

/**
 * Cierra la sesión borrando los datos locales del negocio. La cola de ventas sin
 * conexión NO se borra: cada venta está ligada a su usuario y negocio, así que solo se
 * reenviará cuando ese mismo usuario vuelva a iniciar sesión en este equipo (las de otros
 * usuarios se descartan a las 72 h, ver `offlineQueue.ts`). Quien llama decide si antes
 * avisa al usuario de sus ventas pendientes (`pendingSalesBeforeSignOut`).
 */
export async function signOutAndClear(callbackUrl: string): Promise<void> {
  clearLocalBusinessData();
  await clearCacheStorage();
  await signOut({ callbackUrl });
}
