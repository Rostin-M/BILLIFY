import { formatCompactDate } from "../_lib/format";

/**
 * Línea de tiempo del acceso de un negocio: lo que ya tenía vigente (gris) y
 * lo que se le suma (azul), de hoy a la nueva fecha de fin. Es un apoyo visual:
 * el mismo dato va siempre escrito al lado, así que se oculta a los lectores
 * de pantalla.
 */
export function PeriodTrack({
  keptDays,
  keptLabel,
  addedDays,
  addedLabel,
  startLabel = "Hoy",
  end,
}: Readonly<{
  /** Días vigentes que se conservan antes de lo nuevo (0 = lo nuevo empieza hoy). */
  keptDays: number;
  /** Texto bajo el tramo vigente: "Ya tiene 3 días". */
  keptLabel: string;
  addedDays: number;
  /** Texto bajo el tramo nuevo: "30 días desde el 12 oct 2026". */
  addedLabel: string;
  /** Extremo izquierdo de la línea: "Hoy", o la fecha si los días cuentan desde antes. */
  startLabel?: string;
  end: Date;
}>) {
  return (
    <div aria-hidden className="select-none">
      <div className="flex gap-1">
        {keptDays > 0 && (
          <div className="min-w-[5.5rem]" style={{ flexGrow: keptDays, flexBasis: 0 }}>
            <div className="h-2.5 rounded-full bg-slate-300 dark:bg-white/25" />
            <p className="mt-1.5 truncate text-xs text-slate-600 dark:text-slate-400">{keptLabel}</p>
          </div>
        )}
        <div className="min-w-[9rem]" style={{ flexGrow: Math.max(addedDays, 1), flexBasis: 0 }}>
          <div className="h-2.5 rounded-full bg-blue-600 dark:bg-blue-500" />
          <p className="mt-1.5 truncate text-xs font-semibold text-blue-800 dark:text-blue-200">{addedLabel}</p>
        </div>
      </div>
      <div className="mt-1.5 flex items-baseline justify-between gap-3 text-xs tabular-nums text-slate-600 dark:text-slate-400">
        <span>{startLabel}</span>
        <span className="font-semibold text-slate-900 dark:text-white">{formatCompactDate(end)}</span>
      </div>
    </div>
  );
}
