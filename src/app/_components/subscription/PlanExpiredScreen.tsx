import Link from "next/link";
import { ClipboardList, Download, History, LockKeyhole, type LucideIcon } from "lucide-react";
import { type ReactNode } from "react";

import { planHasFeature, type PlanCode } from "~/lib/subscription/catalog";

/**
 * Se muestra en lugar del POS y de las mesas cuando la cuenta está en solo
 * lectura. No depende de tRPC: la página decide cuándo montarla.
 */
export function PlanExpiredScreen({
  isOwner,
  plan,
  /** Enlace alternativo al historial (en /ventas es una pestaña, no una ruta). */
  onShowHistory,
  children,
}: Readonly<{
  isOwner: boolean;
  /** Plan actual: la trazabilidad y la exportación dependen de él. */
  plan: PlanCode;
  onShowHistory?: () => void;
  /** Contenido extra bajo la explicación (p. ej. mesas que quedaron abiertas). */
  children?: ReactNode;
}>) {
  return (
    <section
      aria-labelledby="plan-vencido-title"
      className="overflow-hidden rounded-2xl border border-red-200 bg-white shadow-sm dark:border-red-500/30 dark:bg-white/5"
    >
      <div className="border-b border-red-100 bg-red-50 px-6 py-8 text-center dark:border-red-500/20 dark:bg-red-900/15 sm:px-10">
        <LockKeyhole className="mx-auto h-11 w-11 text-red-500 dark:text-red-400" aria-hidden />
        <h2 id="plan-vencido-title" className="mt-4 text-2xl font-bold text-red-800 dark:text-red-200">
          Tu plan venció
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-red-700 dark:text-red-300">
          La cuenta está en solo lectura: no puedes registrar ventas ni cambios. Tus datos siguen aquí, no se borra nada.
        </p>
        {isOwner ? (
          <>
            <Link
              href="/suscripcion"
              className="mt-6 inline-block w-full rounded-xl bg-violet-600 px-8 py-3.5 text-base font-bold text-white shadow-sm transition hover:bg-violet-500 sm:w-auto"
            >
              Pagar y reactivar
            </Link>
            <p className="mt-2 text-xs text-red-700/80 dark:text-red-300/80">
              Al pagar, el acceso vuelve de inmediato.
            </p>
          </>
        ) : (
          <p className="mx-auto mt-5 max-w-sm rounded-xl border border-red-200 bg-white px-4 py-3 text-sm font-medium text-red-800 dark:border-red-500/30 dark:bg-transparent dark:text-red-200">
            Pídele al propietario que renueve el plan para seguir vendiendo.
          </p>
        )}
      </div>

      <div className="px-6 py-5 sm:px-10">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Mientras tanto puedes</p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {onShowHistory ? (
            <ActionItem icon={History} label="Ver el historial de ventas" onClick={onShowHistory} />
          ) : (
            <ActionItem icon={History} label="Ver el historial de ventas" href="/ventas?tab=history" />
          )}
          {isOwner && planHasFeature(plan, "audit") && <ActionItem icon={ClipboardList} label="Consultar la trazabilidad" href="/trazabilidad" />}
          {isOwner && planHasFeature(plan, "exports") && <ActionItem icon={Download} label="Exportar tus datos" href="/trazabilidad?tab=exportar" />}
        </ul>
        {children}
      </div>
    </section>
  );
}

function ActionItem({
  icon: Icon,
  label,
  href,
  onClick,
}: Readonly<{ icon: LucideIcon; label: string; href?: string; onClick?: () => void }>) {
  const className =
    "flex w-full items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5";
  const content = (
    <>
      <Icon className="h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400" aria-hidden />
      {label}
    </>
  );
  return (
    <li>
      {href ? (
        <Link href={href} className={className}>
          {content}
        </Link>
      ) : (
        <button type="button" onClick={onClick} className={className}>
          {content}
        </button>
      )}
    </li>
  );
}
