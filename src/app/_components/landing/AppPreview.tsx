import { Banknote, Landmark, Users, WifiOff } from "lucide-react";

/**
 * Vista de la app hecha con HTML/CSS (sin imágenes): una mesa con tres
 * comensales y la cuenta dividida en dos cobros. Es ilustrativa; para lectores
 * de pantalla se resume en el aria-label.
 */

const DINERS = [
  {
    name: "Laura",
    items: "Capuchino, pandebono ×2",
    total: "$ 9.800",
    group: 1,
  },
  { name: "Andrés", items: "Tinto, buñuelo", total: "$ 4.500", group: 1 },
  { name: "Camila", items: "Chocolate con queso", total: "$ 8.500", group: 2 },
] as const;

export function AppPreview() {
  return (
    <div
      role="img"
      aria-label="Vista de BILLIFY: la mesa 4 con tres comensales y la cuenta dividida en dos cobros, uno en efectivo y otro por transferencia. Aviso: sin conexión, las ventas se guardan y se sincronizan solas."
      className="relative mx-auto w-full max-w-[26rem] lg:mx-0 lg:ml-auto"
    >
      <div className="animate-preview-rise rounded-[1.75rem] border border-slate-300/70 bg-white p-2 shadow-2xl shadow-indigo-950/20 dark:border-white/10 dark:bg-slate-900 dark:shadow-black/50">
        <div
          aria-hidden="true"
          className="overflow-hidden rounded-[1.35rem] bg-slate-50 dark:bg-slate-950"
        >
          {/* Barra superior */}
          <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-slate-900">
            <div>
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Mesas
              </p>
              <p className="text-base font-bold text-slate-900 dark:text-white">
                Mesa 4
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-2.5 py-1 text-[11px] font-semibold text-violet-800 dark:bg-violet-500/20 dark:text-violet-200">
              <Users className="h-3 w-3" /> 3 comensales
            </span>
          </div>

          {/* Comensales */}
          <ul className="space-y-2 p-3">
            {DINERS.map((d) => (
              <li
                key={d.name}
                className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-white/10 dark:bg-white/5"
              >
                <span
                  className={`h-8 w-1 shrink-0 rounded-full ${d.group === 1 ? "bg-ala-violet" : "bg-ala-cyan"}`}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    {d.name}
                  </p>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {d.items}
                  </p>
                </div>
                <p className="text-sm font-semibold text-slate-800 tabular-nums dark:text-slate-100">
                  {d.total}
                </p>
              </li>
            ))}
          </ul>

          {/* Cobro dividido */}
          <div className="border-t border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-slate-900">
            <p className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
              Cobro dividido
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-violet-50 px-3 py-2 dark:bg-violet-500/15">
                <p className="flex items-center gap-1 text-[11px] text-violet-800 dark:text-violet-200">
                  <Banknote className="h-3 w-3" /> Efectivo
                </p>
                <p className="text-sm font-bold text-slate-900 tabular-nums dark:text-white">
                  $ 14.300
                </p>
              </div>
              <div className="rounded-xl bg-cyan-50 px-3 py-2 dark:bg-cyan-400/10">
                <p className="flex items-center gap-1 text-[11px] text-cyan-900 dark:text-cyan-200">
                  <Landmark className="h-3 w-3" /> Transferencia
                </p>
                <p className="text-sm font-bold text-slate-900 tabular-nums dark:text-white">
                  $ 8.500
                </p>
              </div>
            </div>
            <div className="bg-ala-violet mt-3 rounded-xl px-4 py-2.5 text-center text-sm font-semibold text-white">
              Cobrar $ 22.800
            </div>
          </div>
        </div>
      </div>

      {/* Aviso offline flotante */}
      <div
        aria-hidden="true"
        className="animate-chip-in absolute -bottom-12 left-2 flex max-w-[15rem] items-start gap-2 rounded-2xl border border-amber-300/70 bg-amber-50 px-3 py-2 shadow-lg shadow-amber-900/10 sm:-bottom-6 sm:-left-6 dark:border-amber-400/30 dark:bg-slate-900"
      >
        <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
        <p className="text-xs leading-snug text-amber-950 dark:text-amber-100">
          <span className="font-semibold">Sin internet.</span> 2 ventas
          guardadas; se envían solas al volver la señal.
        </p>
      </div>
    </div>
  );
}
