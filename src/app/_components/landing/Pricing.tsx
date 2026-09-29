import { Gift } from "lucide-react";

import { DISPLAY_PLANS, TRIAL_DISPLAY } from "~/lib/landing/plans-display";
import { PlanCards } from "./PlanCards";

export function Pricing() {
  return (
    <section id="planes" aria-labelledby="planes-title" className="py-20 lg:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <h2
          id="planes-title"
          className="max-w-2xl text-3xl leading-tight font-extrabold tracking-[-0.025em] text-slate-950 sm:text-[2.5rem] dark:text-white"
        >
          Pruébalo {TRIAL_DISPLAY.dias} días gratis. Después, eliges tu plan.
        </h2>
        <p className="mt-4 max-w-xl text-lg leading-relaxed text-slate-600 dark:text-slate-300">
          Sin permanencia. Te avisamos por correo antes de cada vencimiento.
        </p>

        <div className="mt-8 mb-10 flex max-w-3xl gap-3 rounded-2xl border border-slate-200 bg-white/70 p-4 sm:p-5 dark:border-white/10 dark:bg-white/[0.03]">
          <Gift aria-hidden="true" className="text-ala-blue mt-0.5 h-5 w-5 shrink-0 dark:text-cyan-300" />
          <p className="text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">
            <strong className="font-semibold text-slate-950 dark:text-white">
              La prueba es el plan {TRIAL_DISPLAY.plan} completo durante {TRIAL_DISPLAY.dias} días, sin tarjeta.
            </strong>{" "}
            Al terminar, eliges un plan y pagas desde la app. Si no pagas, la cuenta queda en solo lectura: ves tu
            historial, pero no registras ventas.
          </p>
        </div>

        <PlanCards plans={DISPLAY_PLANS} />

        <p className="mt-10 max-w-2xl text-sm leading-relaxed text-slate-500 dark:text-slate-400">
          Muy pronto podrás pagar desde la app con Nequi, PSE, tarjeta o Bancolombia. Los pagos no son factura electrónica.
        </p>
      </div>
    </section>
  );
}
