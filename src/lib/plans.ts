export type BusinessPlan = "MVP";

export const PLAN_LABELS: Record<BusinessPlan, string> = {
  MVP: "Plan MVP",
};

// Punto de extensión: agregar features por plan a medida que evolucione la plataforma
export const PLAN_FEATURES: Record<BusinessPlan, string[]> = {
  MVP: [
    "ventas",
    "inventario",
    "caja",
    "clientes",
    "dashboard",
    "exportacion",
    "trazabilidad",
  ],
};

export function isPlanFeatureEnabled(
  plan: string,
  feature: string,
): boolean {
  const features = PLAN_FEATURES[plan as BusinessPlan];
  return features?.includes(feature) ?? false;
}
