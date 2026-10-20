import { CircleCheck } from "lucide-react";

/** Cinta decorativa con ventas de ejemplo de una mañana normal en la cafetería. */
const SALES = [
  ["Mesa 2", "3 tintos, 2 almojábanas", "$ 11.000"],
  ["Mostrador", "Capuchino para llevar", "$ 4.500"],
  ["Mesa 5", "Desayuno completo ×2", "$ 32.000"],
  ["Domicilio", "Empanadas ×6, jugo de mora", "$ 21.500"],
  ["Mesa 1", "Chocolate con queso", "$ 8.500"],
  ["Mostrador", "Pandebono ×4", "$ 10.600"],
  ["Fiado", "Don Jairo abonó", "$ 20.000"],
  ["Mesa 3", "Avena, buñuelo", "$ 6.800"],
] as const;

function Row() {
  return (
    <ul className="flex shrink-0 gap-3 pr-3">
      {SALES.map(([where, what, total]) => (
        <li
          key={where + what}
          className="flex shrink-0 items-center gap-2.5 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm shadow-sm dark:border-white/10 dark:bg-white/[0.04]"
        >
          <CircleCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          <span className="font-semibold text-slate-900 dark:text-white">
            {where}
          </span>
          <span className="text-slate-500 dark:text-slate-400">{what}</span>
          <span className="font-display font-bold text-slate-900 tabular-nums dark:text-white">
            {total}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function SalesTicker() {
  return (
    <div
      aria-hidden="true"
      className="ticker relative overflow-hidden border-y border-slate-200/80 bg-white/50 py-4 dark:border-white/10 dark:bg-white/[0.02]"
    >
      <div className="ticker-track flex w-max">
        <Row />
        <Row />
      </div>
    </div>
  );
}
