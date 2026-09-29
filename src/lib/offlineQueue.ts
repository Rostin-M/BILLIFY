const DB_NAME = "billify_offline";
const STORE_NAME = "pending_sales";
const DB_VERSION = 1;

/**
 * Las ventas pendientes de OTRO usuario (o sin dueño, de versiones anteriores) se
 * descartan pasadas 72 h. Motivo: en un equipo compartido, esas ventas guardan ids de
 * clientes, notas y rutas de comprobantes que el usuario actual no debe poder ver ni
 * reenviar; se conservan un tiempo razonable (cubre un fin de semana largo o una
 * rotación de turnos) para que su dueño vuelva a iniciar sesión y se sincronicen a su
 * nombre. Pasado ese plazo la caja en la que se hicieron ya estará cerrada y la venta
 * solo es un riesgo de privacidad. Las ventas del usuario actual nunca se descartan
 * automáticamente: él está presente y puede sincronizarlas.
 */
export const FOREIGN_SALE_TTL_MS = 72 * 60 * 60 * 1000;

export type PendingSale = {
  localId: string;
  items: { productId: string; quantity: number; weightKg?: number; customAmount?: number }[];
  paymentMethod: "CASH" | "CARD" | "CREDIT" | "TRANSFER";
  customerId?: string;
  note?: string;
  receiptPath?: string;
  /**
   * Clave de idempotencia (UUID) generada al confirmar la venta. Viaja con cada reintento de
   * sincronización para que el servidor no registre la venta dos veces si una respuesta se pierde.
   */
  idempotencyKey?: string;
  /**
   * Usuario y negocio que registraron la venta. Solo se reenvía cuando esa misma persona
   * tiene la sesión abierta: en un equipo compartido la venta del cajero A nunca se
   * registra a nombre del cajero B. Ausentes en entradas de versiones anteriores.
   */
  userId?: string;
  businessId?: string;
  createdAt: string;
};

export type QueueOwner = { userId: string; businessId: string };

/** Datos que se envían al servidor al sincronizar (sin metadatos locales). */
export type SyncInput = Omit<PendingSale, "localId" | "createdAt" | "userId" | "businessId"> & {
  /** ISO de cuando se hizo la venta; solo lo agrega la sincronización. */
  offlineCreatedAt?: string;
};
export type SyncFn = (sale: SyncInput) => Promise<void>;

export type SyncError = { time: string; message: string };

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "localId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Error al abrir base de datos local"));
  });
}

export function isOwnedBy(sale: PendingSale, owner: QueueOwner): boolean {
  return sale.userId === owner.userId && sale.businessId === owner.businessId;
}

export function isLegacy(sale: PendingSale): boolean {
  return !sale.userId || !sale.businessId;
}

export async function queueSale(sale: PendingSale): Promise<void> {
  if (!sale.userId || !sale.businessId) {
    throw new Error("La venta pendiente debe indicar usuario y negocio");
  }
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).add(sale);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error ?? new Error("Error al guardar venta en cola")); };
  });
}

/** Todas las entradas de la cola, de cualquier usuario. Usar los filtros de abajo. */
async function getAllPendingSales(): Promise<PendingSale[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => { db.close(); resolve(req.result as PendingSale[]); };
    req.onerror = () => { db.close(); reject(req.error ?? new Error("Error al leer ventas pendientes")); };
  });
}

async function removePendingSales(localIds: string[]): Promise<void> {
  if (localIds.length === 0) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    for (const id of localIds) store.delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error ?? new Error("Error al eliminar venta de cola")); };
  });
}

export async function removePendingSale(localId: string): Promise<void> {
  return removePendingSales([localId]);
}

function isExpired(sale: PendingSale, now: number): boolean {
  const created = Date.parse(sale.createdAt);
  // Fecha ilegible: se trata como vencida (no hay forma de saber de cuándo es).
  return Number.isNaN(created) || now - created > FOREIGN_SALE_TTL_MS;
}

/**
 * Lee la cola para `owner`: descarta las entradas ajenas o sin dueño con más de 72 h y
 * devuelve por separado las del usuario actual y las heredadas sin dueño. Las de otros
 * usuarios (vigentes) se conservan pero no se devuelven.
 */
export async function loadQueueFor(
  owner: QueueOwner,
): Promise<{ own: PendingSale[]; legacy: PendingSale[] }> {
  const all = await getAllPendingSales();
  const now = Date.now();
  const expired = all.filter((s) => !isOwnedBy(s, owner) && isExpired(s, now));
  await removePendingSales(expired.map((s) => s.localId));

  const expiredIds = new Set(expired.map((s) => s.localId));
  const alive = all.filter((s) => !expiredIds.has(s.localId));
  const byDate = (a: PendingSale, b: PendingSale) => a.createdAt.localeCompare(b.createdAt);
  return {
    own: alive.filter((s) => isOwnedBy(s, owner)).sort(byDate),
    legacy: alive.filter(isLegacy).sort(byDate),
  };
}

export async function countOwnPendingSales(owner: QueueOwner): Promise<number> {
  const { own } = await loadQueueFor(owner);
  return own.length;
}

/** Borra las entradas heredadas sin dueño (acción explícita del usuario). */
export async function discardLegacySales(): Promise<number> {
  const all = await getAllPendingSales();
  const legacy = all.filter(isLegacy);
  await removePendingSales(legacy.map((s) => s.localId));
  return legacy.length;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
}

// Evita dos sincronizaciones simultáneas en la misma pestaña (evento "online", montaje,
// botón manual, cierre de sesión). Entre pestañas la clave de idempotencia evita duplicados.
let replayInFlight: Promise<SyncError[]> | null = null;

/**
 * Reenvía al servidor SOLO las ventas pendientes de `owner`, en orden de creación, y
 * borra cada una al confirmarse. Devuelve los errores de las que no se pudieron enviar.
 */
export function replayPendingSales(owner: QueueOwner, syncFn: SyncFn): Promise<SyncError[]> {
  replayInFlight ??= (async () => {
    try {
      const { own } = await loadQueueFor(owner);
      const errors: SyncError[] = [];
      for (const sale of own) {
        try {
          await syncFn({
            items: sale.items,
            paymentMethod: sale.paymentMethod,
            customerId: sale.customerId,
            note: sale.note,
            // Misma clave en cada reintento: el servidor no duplica la venta.
            idempotencyKey: sale.idempotencyKey,
            receiptPath: sale.receiptPath,
            // Hora real de la venta: si el plan vence mientras está sin conexión, el
            // servidor la acepta solo si se hizo antes del bloqueo.
            offlineCreatedAt: sale.createdAt,
          });
          await removePendingSale(sale.localId);
        } catch (err) {
          errors.push({
            time: formatTime(sale.createdAt),
            message: err instanceof Error ? err.message : "Error al sincronizar",
          });
        }
      }
      return errors;
    } finally {
      replayInFlight = null;
    }
  })();
  return replayInFlight;
}
