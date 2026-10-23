import { type LucideIcon, AlertTriangle, Loader2 } from "lucide-react";
import { type ReactNode } from "react";

import { type PlatformPaymentRow, type PlatformSubscriptionSummary } from "~/lib/platform/contract";
import { getPlan, type PlanCode } from "~/lib/subscription/catalog";
import {
  PAYMENT_STATUS_CLASSES,
  PAYMENT_STATUS_LABELS,
  PHASE_CHIP_CLASSES,
  PHASE_LABELS,
} from "~/app/_components/subscription/labels";

/**
 * Piezas visuales del panel de plataforma. Misma familia que la app (radios,
 * bordes, grises) pero con azul del águila como color de acción en vez del
 * violeta de la app de negocio.
 */

export const cardClass =
  "rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.04] dark:shadow-none";

const buttonBase =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-10";

export const buttonClass = {
  primary: `${buttonBase} bg-blue-700 text-white hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-500`,
  secondary: `${buttonBase} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:bg-transparent dark:text-slate-200 dark:hover:bg-white/10`,
  danger: `${buttonBase} bg-red-600 text-white hover:bg-red-700`,
  dangerQuiet: `${buttonBase} border border-red-200 bg-white text-red-700 hover:bg-red-50 dark:border-red-500/30 dark:bg-transparent dark:text-red-300 dark:hover:bg-red-900/20`,
  /** Acción compacta dentro de una fila. */
  row: "inline-flex min-h-11 sm:min-h-9 items-center justify-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 text-sm font-semibold text-blue-800 transition hover:bg-blue-100 dark:border-blue-400/30 dark:bg-blue-500/10 dark:text-blue-200 dark:hover:bg-blue-500/20",
} as const;

export const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 placeholder:text-slate-400 disabled:bg-slate-50 disabled:text-slate-500 sm:text-sm dark:border-white/15 dark:bg-slate-950/60 dark:text-slate-100 dark:placeholder:text-slate-500";

export const linkClass =
  "font-medium text-blue-700 underline-offset-2 hover:underline dark:text-blue-300";

export const mutedText = "text-slate-600 dark:text-slate-400";

export function PageHeader({
  title,
  subtitle,
  actions,
}: Readonly<{ title: string; subtitle?: ReactNode; actions?: ReactNode }>) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{title}</h1>
        {subtitle && <p className={`mt-1 text-sm ${mutedText}`}>{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export function Card({
  title,
  description,
  aside,
  children,
  flush = false,
  headingLevel = "h2",
}: Readonly<{
  title?: string;
  description?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  /** Sin relleno en el contenido (para listas con filas a todo el ancho). */
  flush?: boolean;
  headingLevel?: "h2" | "h3";
}>) {
  const Heading = headingLevel;
  return (
    <section className={cardClass}>
      {title && (
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-slate-100 px-4 py-3.5 sm:px-5 dark:border-white/10">
          <div className="min-w-0">
            <Heading className="font-semibold text-slate-900 dark:text-white">{title}</Heading>
            {description && <p className={`mt-0.5 text-sm ${mutedText}`}>{description}</p>}
          </div>
          {aside}
        </div>
      )}
      <div className={flush ? "" : "p-4 sm:p-5"}>{children}</div>
    </section>
  );
}

export function PhaseChip({ phase }: Readonly<{ phase: PlatformSubscriptionSummary["phase"] }>) {
  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${PHASE_CHIP_CLASSES[phase]}`}
    >
      {PHASE_LABELS[phase]}
    </span>
  );
}

export function PaymentStatusChip({ status }: Readonly<{ status: PlatformPaymentRow["status"] }>) {
  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${PAYMENT_STATUS_CLASSES[status]}`}
    >
      {PAYMENT_STATUS_LABELS[status]}
    </span>
  );
}

export function PlanName({ plan }: Readonly<{ plan: PlanCode }>) {
  return <span className="font-medium text-slate-800 dark:text-slate-200">{getPlan(plan).name}</span>;
}

/** Etiqueta pequeña y neutra ("Manual", "Revocada", "Por revisar"). */
export function Tag({
  children,
  tone = "neutral",
}: Readonly<{ children: ReactNode; tone?: "neutral" | "warn" | "danger" | "info" }>) {
  const tones = {
    neutral: "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-300",
    warn: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200",
    danger: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200",
    info: "bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-200",
  } as const;
  return (
    <span className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs font-semibold ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function Spinner({ className = "" }: Readonly<{ className?: string }>) {
  return <Loader2 aria-hidden className={`h-4 w-4 animate-spin motion-reduce:animate-none ${className}`} />;
}

/** Error al cargar: dice qué pasó y deja reintentar. */
export function ErrorState({
  message,
  onRetry,
  compact = false,
}: Readonly<{ message: string; onRetry?: () => void; compact?: boolean }>) {
  return (
    <div
      role="alert"
      className={`flex flex-col items-center gap-3 text-center ${compact ? "px-4 py-6" : "px-4 py-12"}`}
    >
      <div className="rounded-2xl border border-red-200 bg-red-50 p-3 dark:border-red-500/30 dark:bg-red-900/20">
        <AlertTriangle aria-hidden className="h-6 w-6 text-red-600 dark:text-red-300" />
      </div>
      <p className="max-w-sm text-sm font-medium text-slate-800 dark:text-slate-200">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className={buttonClass.secondary}>
          Reintentar
        </button>
      )}
    </div>
  );
}

/** Lista vacía: icono, qué significa y, si aplica, cómo salir. */
export function EmptyBlock({
  icon: Icon,
  title,
  description,
  action,
  compact = false,
}: Readonly<{ icon: LucideIcon; title: string; description?: string; action?: ReactNode; compact?: boolean }>) {
  return (
    <div className={`flex flex-col items-center gap-3 px-4 text-center ${compact ? "py-7" : "py-12"}`}>
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
        <Icon aria-hidden className="h-6 w-6 text-slate-500 dark:text-slate-400" />
      </div>
      <div>
        <p className="font-medium text-slate-800 dark:text-slate-200">{title}</p>
        {description && <p className={`mx-auto mt-1 max-w-sm text-sm ${mutedText}`}>{description}</p>}
      </div>
      {action}
    </div>
  );
}

/** Filas fantasma mientras carga una lista. */
export function ListSkeleton({ rows = 4 }: Readonly<{ rows?: number }>) {
  return (
    <output
      aria-label="Cargando"
      className="block animate-pulse divide-y divide-slate-100 motion-reduce:animate-none dark:divide-white/5"
    >
      {Array.from({ length: rows }, (_, i) => `sk-${i}`).map((key) => (
        <div key={key} className="flex items-center gap-4 px-4 py-4 sm:px-5">
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-2/5 rounded-md bg-slate-200 dark:bg-white/10" />
            <div className="h-3 w-3/5 rounded-md bg-slate-200 dark:bg-white/10" />
          </div>
          <div className="h-6 w-20 rounded-full bg-slate-200 dark:bg-white/10" />
        </div>
      ))}
    </output>
  );
}

/** Pie de lista: "Cargar más", error al traer la siguiente página o fin de la lista. */
export function LoadMore({
  hasMore,
  isLoadingMore,
  error,
  onLoadMore,
  shown,
  noun,
}: Readonly<{
  hasMore: boolean;
  isLoadingMore: boolean;
  error: string | null;
  onLoadMore: () => void;
  shown: number;
  /** Plural de lo listado: "negocios", "pagos". */
  noun: string;
}>) {
  return (
    <div className="flex flex-col items-center gap-2 border-t border-slate-100 px-4 py-4 dark:border-white/10">
      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
      {hasMore ? (
        <button type="button" onClick={onLoadMore} disabled={isLoadingMore} aria-busy={isLoadingMore} className={buttonClass.secondary}>
          {isLoadingMore && <Spinner />}
          {isLoadingMore ? "Cargando..." : "Cargar más"}
        </button>
      ) : (
        <p className={`text-xs ${mutedText}`}>
          {shown === 1 ? `Es el único de la lista.` : `Estos son todos: ${shown} ${noun}.`}
        </p>
      )}
    </div>
  );
}

export type FilterOption<T extends string> = { value: T; label: string; count?: number };

/** Filtro de una sola opción, como fila de botones que se puede deslizar en el celular. */
export function FilterChips<T extends string>({
  label,
  options,
  value,
  onChange,
}: Readonly<{ label: string; options: FilterOption<T>[]; value: T; onChange: (value: T) => void }>) {
  return (
    <fieldset aria-label={label} className="-mx-4 flex min-w-0 gap-2 overflow-x-auto px-4 py-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={`inline-flex min-h-11 sm:min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-sm font-medium transition ${
              selected
                ? "border-blue-700 bg-blue-700 text-white dark:border-blue-500 dark:bg-blue-600"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:bg-transparent dark:text-slate-300 dark:hover:bg-white/10"
            }`}
          >
            {option.label}
            {option.count !== undefined && (
              <span className={`tabular-nums ${selected ? "text-blue-100" : "text-slate-500 dark:text-slate-400"}`}>
                {option.count}
              </span>
            )}
          </button>
        );
      })}
    </fieldset>
  );
}

/** Aviso dentro de un formulario o tarjeta. */
export function Callout({
  tone,
  icon: Icon,
  children,
}: Readonly<{ tone: "info" | "warn" | "danger"; icon: LucideIcon; children: ReactNode }>) {
  const tones = {
    info: "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-400/30 dark:bg-blue-500/10 dark:text-blue-100",
    warn: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-900/20 dark:text-amber-100",
    danger: "border-red-200 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-900/20 dark:text-red-100",
  } as const;
  return (
    <div className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-sm ${tones[tone]}`}>
      <Icon aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Par "etiqueta: valor" para las fichas de datos. */
export function Fact({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <div className="min-w-0">
      <dt className={`text-xs ${mutedText}`}>{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-medium text-slate-900 dark:text-slate-100">{children}</dd>
    </div>
  );
}
