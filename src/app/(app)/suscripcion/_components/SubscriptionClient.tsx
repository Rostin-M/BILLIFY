"use client";

import { FlaskConical } from "lucide-react";

import { api } from "~/trpc/react";
import { PaymentHistory } from "./PaymentHistory";
import { PlanPicker } from "./PlanPicker";
import { StatusCard } from "./StatusCard";
import { UsagePanel } from "./UsagePanel";

export function SubscriptionClient() {
  const { data: status, isPending, error } = api.billing.status.useQuery();

  if (isPending) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">Cargando tu plan...</p>;
  }
  if (!status) {
    return (
      <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-900/20 dark:text-red-300">
        No pudimos cargar tu plan{error ? `: ${error.message}` : "."} Recarga la página para intentar de nuevo.
      </p>
    );
  }

  // Cajero: solo el estado y a quién pedirle la renovación.
  if (!status.isOwner) return <StatusCard status={status} />;

  return (
    <div className="space-y-6">
      {status.provider === "mock" && (
        <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-900/20 dark:text-amber-300">
          <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          Modo de pruebas: los pagos son simulados y no se cobra dinero real.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <StatusCard status={status} />
        <UsagePanel usage={status.usage} />
      </div>

      <PlanPicker status={status} />

      <PaymentHistory mockPayments={status.mockPayments} />

      <div className="space-y-1 text-xs text-slate-500 dark:text-slate-500">
        <p>Los pagos no son factura electrónica.</p>
        <p>Si es tu primer pago, puedes pedir el reembolso dentro de los 5 días hábiles siguientes.</p>
        {status.provider === "wompi" && (
          <p>Pagas con Nequi, PSE, tarjeta o Bancolombia en la página segura de Wompi.</p>
        )}
      </div>
    </div>
  );
}
