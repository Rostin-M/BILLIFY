"use client";

import { useState } from "react";
import { PointOfSale } from "./POS";
import { InvoicedSaleForm } from "./InvoicedSaleForm";
import { ReadOnlySalesSync } from "./ReadOnlySalesSync";
import { SalesHistory } from "./SalesHistory";
import type { BusinessInfoForPdf } from "~/lib/pdf/FacturaPDF";
import { type PlanCode } from "~/lib/subscription/catalog";
import { PlanExpiredScreen } from "~/app/_components/subscription/PlanExpiredScreen";

export type TaxConfig = { name: string; rate: number; enabled: boolean };

export type VentasTab = "quick" | "invoiced" | "history";
type Tab = VentasTab;

type Props = {
  taxes: TaxConfig[];
  autoTax: boolean;
  isOwner: boolean;
  userName: string | null;
  /** Para ligar las ventas sin conexión al usuario y negocio de la sesión. */
  userId: string;
  businessId: string;
  business: BusinessInfoForPdf;
  initialTab?: Tab;
  /**
   * Cuenta en solo lectura: en lugar de armar ventas se muestra "Tu plan venció".
   * El historial sigue disponible y la cola sin conexión se sigue sincronizando.
   */
  readOnly?: { plan: PlanCode } | null;
};

export function VentasClient({
  taxes,
  autoTax,
  isOwner,
  userName,
  userId,
  businessId,
  business,
  initialTab = "quick",
  readOnly = null,
}: Readonly<Props>) {
  const [tab, setTab] = useState<Tab>(initialTab);

  // La línea pequeña explica la diferencia sin tener que probar cada pestaña.
  const tabs: { id: Tab; label: string; hint: string }[] = [
    { id: "quick", label: "Venta rápida", hint: "Sin datos del cliente" },
    { id: "invoiced", label: "Factura", hint: "Con cliente, PDF y correo" },
    { id: "history", label: "Historial", hint: "Ventas de hoy" },
  ];

  return (
    <div>
      <div className="mb-6 flex gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm dark:border-white/10 dark:bg-white/5">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            aria-pressed={tab === t.id}
            className={`flex min-h-11 flex-1 flex-col items-center justify-center rounded-lg px-2 py-1.5 text-sm font-medium leading-tight transition sm:px-4 ${
              tab === t.id
                ? "bg-violet-600 text-white shadow"
                : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            {t.label}
            <span className={`mt-0.5 hidden text-[11px] font-normal min-[400px]:block ${tab === t.id ? "text-violet-100" : "text-slate-500 dark:text-slate-400"}`}>
              {t.hint}
            </span>
          </button>
        ))}
      </div>

      {/* Solo lectura: se mantiene montado el reenvío de ventas sin conexión en todas las pestañas. */}
      {readOnly && <ReadOnlySalesSync userId={userId} businessId={businessId} />}

      {readOnly && tab !== "history" && (
        <PlanExpiredScreen isOwner={isOwner} plan={readOnly.plan} onShowHistory={() => setTab("history")} />
      )}

      {!readOnly && tab === "quick" && (
        <PointOfSale taxes={taxes} autoTax={autoTax} userId={userId} businessId={businessId} />
      )}
      {!readOnly && tab === "invoiced" && (
        <InvoicedSaleForm
          taxes={taxes}
          autoTax={autoTax}
          business={business}
          userName={userName}
        />
      )}
      {tab === "history" && <SalesHistory isOwner={isOwner} business={business} />}
    </div>
  );
}
