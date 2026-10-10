import { ChevronRight, UserX } from "lucide-react";
import Link from "next/link";

import { type PlatformBusinessRow } from "~/lib/platform/contract";
import { getPlan } from "~/lib/subscription/catalog";

import { accessLine } from "../_lib/format";
import { buttonClass, mutedText, PhaseChip } from "./ui";

/**
 * Lista de negocios. Cada fila lleva al detalle y, si se pasa `onActivate`,
 * trae el botón "Activar plan" a la mano (la tarea más frecuente del panel).
 * En el celular la fila se apila; en escritorio queda en una sola línea.
 */
export function BusinessList({
  businesses,
  onActivate,
  dense = false,
}: Readonly<{
  businesses: PlatformBusinessRow[];
  onActivate?: (business: PlatformBusinessRow) => void;
  /** Filas más compactas, sin documento ni correo (colas del resumen). */
  dense?: boolean;
}>) {
  return (
    <ul className="divide-y divide-slate-100 dark:divide-white/5">
      {businesses.map((business) => {
        const sub = business.subscription;
        let lineTone = mutedText;
        if (sub.phase === "PAST_DUE") lineTone = "font-medium text-amber-800 dark:text-amber-300";
        if (sub.phase === "READ_ONLY") lineTone = "font-medium text-red-700 dark:text-red-300";
        return (
          <li
            key={business.id}
            className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:gap-4 sm:px-5"
          >
            <Link
              href={`/admin/negocios/${business.id}`}
              className="group flex min-w-0 flex-1 items-center gap-3 rounded-lg"
            >
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 font-semibold text-slate-900 group-hover:text-blue-800 dark:text-white dark:group-hover:text-blue-200">
                  {business.name}
                </p>
                {!dense && (
                  <p className={`mt-0.5 truncate text-xs ${mutedText}`}>
                    {business.document}
                    {business.owner ? (
                      <>
                        <span aria-hidden> / </span>
                        {business.owner.name ?? "Dueño sin nombre"}
                        {business.owner.email && (
                          <>
                            <span aria-hidden> / </span>
                            {business.owner.email}
                          </>
                        )}
                      </>
                    ) : (
                      <span className="ml-2 inline-flex items-center gap-1 font-medium text-amber-700 dark:text-amber-300">
                        <UserX aria-hidden className="h-3.5 w-3.5" />
                        Sin dueño activo
                      </span>
                    )}
                  </p>
                )}
                <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <PhaseChip phase={sub.phase} />
                  <span className="font-medium text-slate-800 dark:text-slate-200">{getPlan(sub.plan).name}</span>
                  <span className={lineTone}>{accessLine(sub)}</span>
                </p>
              </div>
              <ChevronRight
                aria-hidden
                className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-blue-700 motion-reduce:transition-none dark:group-hover:text-blue-300"
              />
            </Link>
            {onActivate && (
              <button
                type="button"
                onClick={() => onActivate(business)}
                className={`${buttonClass.row} sm:shrink-0`}
              >
                Activar plan
                <span className="sr-only"> a {business.name}</span>
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
