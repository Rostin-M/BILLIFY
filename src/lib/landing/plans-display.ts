/**
 * Planes que se MUESTRAN en la landing pública. Se derivan del catálogo
 * (`src/lib/subscription/catalog.ts`), que es la única fuente de verdad de
 * precios, límites y funciones: cambiar un precio allá lo cambia aquí.
 */

import {
  FEATURE_LABELS,
  formatBytes,
  formatCop,
  GRACE_DAYS,
  PLAN_CODES,
  PLANS,
  type PlanCode,
  TRIAL_DAYS,
  TRIAL_PLAN,
} from "~/lib/subscription/catalog";

export type PlanLimits = {
  /** Cajas abiertas al mismo tiempo. */
  cajas: number;
  /** Usuarios activos (propietario + cajeros). */
  usuarios: number;
  /** Productos activos. `null` = ilimitados. */
  productos: number | null;
};

export type DisplayPlan = {
  id: PlanCode;
  nombre: string;
  /** Precio mensual en COP. */
  precioMensual: number;
  /** Precio total anual en COP (paga 10 meses, recibe 12). */
  precioAnual: number;
  destacado: boolean;
  descripcion: string;
  /** Lo que incluye, en el orden en que se lee al comparar. */
  features: string[];
  limites: PlanLimits;
  /** Texto del botón. Todos llevan a /auth/register (empiezan con la prueba). */
  cta: string;
};

/** Funciones que todos los planes tienen (no dependen del catálogo). */
const BASE_FEATURES = [
  "Punto de venta y facturas en PDF",
  "Mesas, caja, fiados e inventario",
  "Funciona sin internet",
];

const num = (n: number) => new Intl.NumberFormat("es-CO").format(n);

function featuresOf(code: PlanCode): string[] {
  const plan = PLANS[code];
  const rankBelow = PLAN_CODES.map((c) => PLANS[c]).find((p) => p.rank === plan.rank - 1);
  const extras = plan.features
    .filter((f) => !rankBelow?.features.includes(f))
    .map((f) => FEATURE_LABELS[f]);
  const head = rankBelow ? [`Todo lo del plan ${rankBelow.name}`] : BASE_FEATURES;
  const limits = [
    plan.limits.products === null ? "Productos ilimitados" : `Hasta ${num(plan.limits.products)} productos`,
    `${num(plan.limits.invoiceEmailsPerMonth)} facturas por correo al mes`,
    `${formatBytes(plan.limits.storageBytes)} para fotos de comprobantes`,
  ];
  return [...head, ...extras, ...limits];
}

export const DISPLAY_PLANS: DisplayPlan[] = PLAN_CODES.map((code) => {
  const plan = PLANS[code];
  return {
    id: code,
    nombre: plan.name,
    precioMensual: plan.prices.MONTHLY,
    precioAnual: plan.prices.ANNUAL,
    destacado: plan.highlighted,
    descripcion: plan.tagline,
    features: featuresOf(code),
    limites: {
      cajas: plan.limits.cashRegisters,
      usuarios: plan.limits.users,
      productos: plan.limits.products,
    },
    cta: "Probar 7 días gratis",
  };
});

/** Datos de la prueba gratis para el texto que acompaña las tarjetas. */
export const TRIAL_DISPLAY = {
  dias: TRIAL_DAYS,
  plan: PLANS[TRIAL_PLAN].name,
  diasDeGracia: GRACE_DAYS,
} as const;

/** Formatea un precio en COP para la landing. */
export function formatPlanPrice(value: number): string {
  return formatCop(value);
}

/** Cuánto sale al mes pagando el año. */
export function monthlyEquivalent(annual: number): number {
  return Math.round(annual / 12);
}
