import { BadgeCheck } from "lucide-react";

import { cardClass } from "./ui";

// Solo lectura: el plan no se cambia desde esta pantalla
export function PlanSection({
  plan,
  maxCashRegisters,
}: Readonly<{ plan: string; maxCashRegisters: number }>) {
  return (
    <section className={cardClass}>
      <h2 className="font-semibold">Plan</h2>
      <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Tu plan actual de BILLIFY.</p>

      <div className="mt-5 flex items-center gap-3 rounded-xl border border-violet-200 bg-violet-50 p-4 dark:border-violet-500/30 dark:bg-violet-900/20">
        <BadgeCheck className="h-6 w-6 shrink-0 text-violet-600 dark:text-violet-400" aria-hidden />
        <div>
          <p className="text-sm font-semibold text-violet-700 dark:text-violet-300">Plan {plan}</p>
          <p className="text-xs text-violet-700/80 dark:text-violet-300/80">
            Cajas simultáneas configuradas: {maxCashRegisters}
          </p>
        </div>
      </div>
    </section>
  );
}
