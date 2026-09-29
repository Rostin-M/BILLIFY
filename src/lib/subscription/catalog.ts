/**
 * Catálogo de planes de BILLIFY: única fuente de verdad de precios, límites y
 * funciones. Lo usan el backend (cobros, cuotas, guard), la pantalla de
 * suscripción y la landing pública. Cambiar un precio = editar este archivo.
 *
 * Los pagos guardan una copia del plan, ciclo y monto cobrado, así que cambiar
 * un precio aquí no altera el historial.
 *
 * Precios en pesos colombianos (COP), sin decimales. Si aplican IVA o no lo
 * decide la configuración de facturación (ver `SUBSCRIPTION_VAT_RATE`).
 */

export const PLAN_CODES = ["BASIC", "BUSINESS", "PRO"] as const;
export type PlanCode = (typeof PLAN_CODES)[number];

export const BILLING_CYCLES = ["MONTHLY", "ANNUAL"] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];

/** Funciones que dependen del plan. Consultar historiales nunca depende del plan. */
export type PlanFeature =
  /** Exportar ventas y movimientos de caja a CSV. */
  | "exports"
  /** Consultar la bitácora de auditoría (trazabilidad). */
  | "audit"
  /** Lote y fecha de vencimiento en los productos. */
  | "lots"
  /** Dashboard del mes (el de día y semana está en todos los planes). */
  | "dashboardMonth"
  /** Soporte prioritario por WhatsApp. */
  | "prioritySupport";

export type PlanLimits = {
  /** Cajas abiertas al mismo tiempo. */
  cashRegisters: number;
  /** Usuarios activos, incluido el propietario. */
  users: number;
  /** Productos activos. `null` = ilimitados. */
  products: number | null;
  /** Facturas enviadas por correo por mes calendario (hora Bogotá). */
  invoiceEmailsPerMonth: number;
  /** Almacenamiento de fotos de comprobantes, en bytes. */
  storageBytes: number;
};

export type PlanDefinition = {
  code: PlanCode;
  name: string;
  tagline: string;
  /** Orden para comparar planes: mayor = más completo. */
  rank: number;
  /** Precio en COP por ciclo. ANNUAL es el total del año. */
  prices: Record<BillingCycle, number>;
  limits: PlanLimits;
  features: readonly PlanFeature[];
  highlighted: boolean;
};

const MB = 1024 * 1024;
const GB = 1024 * MB;

export const PLANS: Record<PlanCode, PlanDefinition> = {
  BASIC: {
    code: "BASIC",
    name: "Básico",
    tagline: "Para la cafetería con una caja: el dueño y un cajero.",
    rank: 1,
    prices: { MONTHLY: 29_900, ANNUAL: 299_000 },
    limits: {
      cashRegisters: 1,
      users: 2,
      products: 500,
      invoiceEmailsPerMonth: 100,
      storageBytes: 300 * MB,
    },
    features: [],
    highlighted: false,
  },
  BUSINESS: {
    code: "BUSINESS",
    name: "Negocio",
    tagline: "Para el negocio de 2 a 5 empleados.",
    rank: 2,
    prices: { MONTHLY: 49_900, ANNUAL: 499_000 },
    limits: {
      cashRegisters: 2,
      users: 6,
      products: 3_000,
      invoiceEmailsPerMonth: 500,
      storageBytes: 1 * GB,
    },
    features: ["exports", "audit", "lots", "dashboardMonth"],
    highlighted: true,
  },
  PRO: {
    code: "PRO",
    name: "Pro",
    tagline: "Para 5 o más empleados y varias cajas a la vez.",
    rank: 3,
    prices: { MONTHLY: 79_900, ANNUAL: 799_000 },
    limits: {
      cashRegisters: 4,
      users: 15,
      products: null,
      invoiceEmailsPerMonth: 2_000,
      storageBytes: 3 * GB,
    },
    features: ["exports", "audit", "lots", "dashboardMonth", "prioritySupport"],
    highlighted: false,
  },
};

/** Plan con el que arranca la prueba gratis. */
export const TRIAL_PLAN: PlanCode = "BUSINESS";
export const TRIAL_DAYS = 7;
/** Días de acceso completo después del vencimiento de un período pagado (no aplica a la prueba). */
export const GRACE_DAYS = 3;
/**
 * Ventas hechas sin conexión ANTES del bloqueo se aceptan al sincronizar hasta
 * este tiempo después del bloqueo. Pasado el plazo se rechazan (quedan en el
 * dispositivo y se sincronizan cuando el negocio renueve).
 */
export const OFFLINE_SYNC_TOLERANCE_MS = 24 * 60 * 60 * 1000;
/** Avisos por correo antes del vencimiento de un período pagado. */
export const RENEWAL_REMINDER_DAYS = [7, 3, 1] as const;
/** Avisos de la prueba: días antes de terminar (2 = día 5 de 7; 0 = el último día). */
export const TRIAL_REMINDER_DAYS = [2, 0] as const;

export const CYCLE_LABELS: Record<BillingCycle, string> = {
  MONTHLY: "Mensual",
  ANNUAL: "Anual",
};

export const FEATURE_LABELS: Record<PlanFeature, string> = {
  exports: "Exportar a Excel (CSV)",
  audit: "Trazabilidad y auditoría",
  lots: "Lotes y fechas de vencimiento",
  dashboardMonth: "Dashboard mensual con gráficas",
  prioritySupport: "Soporte prioritario por WhatsApp",
};

export function isPlanCode(value: unknown): value is PlanCode {
  return typeof value === "string" && (PLAN_CODES as readonly string[]).includes(value);
}

export function getPlan(code: PlanCode): PlanDefinition {
  return PLANS[code];
}

export function planHasFeature(code: PlanCode, feature: PlanFeature): boolean {
  return PLANS[code].features.includes(feature);
}

export function planPrice(code: PlanCode, cycle: BillingCycle): number {
  return PLANS[code].prices[cycle];
}

/** Plan más barato que incluye la función (para el mensaje "disponible desde…"). */
export function cheapestPlanWith(feature: PlanFeature): PlanDefinition | null {
  return (
    PLAN_CODES.map((c) => PLANS[c])
      .sort((a, b) => a.rank - b.rank)
      .find((p) => p.features.includes(feature)) ?? null
  );
}

const COP = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

export function formatCop(value: number): string {
  return COP.format(value);
}

export function formatBytes(bytes: number): string {
  if (bytes >= GB) return `${Number((bytes / GB).toFixed(1))} GB`;
  return `${Math.round(bytes / MB)} MB`;
}
