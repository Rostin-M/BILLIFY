import { Check } from "lucide-react";
import { type ReactNode, useId } from "react";

// Clases compartidas (mismo lenguaje visual que el resto de pantallas)
export const cardClass =
  "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5";

export const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-violet-400 transition focus:ring-2 disabled:bg-slate-50 disabled:text-slate-500 dark:border-white/15 dark:bg-slate-900 dark:disabled:bg-slate-900/50";

export const readOnlyInputClass =
  "w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-500 dark:border-white/10 dark:bg-slate-800 dark:text-slate-400";

export const labelTextClass = "text-slate-700 dark:text-slate-300";

export const dividerClass = "border-t border-slate-100 dark:border-white/10";

export function Optional() {
  return <span className="text-slate-500">(opcional)</span>;
}

export function SubHeading({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <h3 className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-200">
      {children}
    </h3>
  );
}

/** Marca de "cambiado pero sin guardar" junto a una opción o campo. */
export function Unsaved({ show }: Readonly<{ show: boolean }>) {
  if (!show) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />
      <span>Sin guardar</span>
    </span>
  );
}

/** Etiqueta de un campo de texto con su marca de "Sin guardar". */
export function FieldLabel({ changed, children }: Readonly<{ changed: boolean; children: ReactNode }>) {
  return (
    <span className={`flex flex-wrap items-center gap-x-2 gap-y-1 ${labelTextClass}`}>
      <span>{children}</span>
      <Unsaved show={changed} />
    </span>
  );
}

/** Borde del campo que cambió y falta guardar. */
export function changedInput(changed: boolean) {
  return changed ? "!border-amber-400 dark:!border-amber-500/60" : "";
}

// Opción de sí/no: interruptor grande y la tarjeta se ilumina al activarla, para que
// el toque se note aunque el cambio solo se aplique al guardar.
export function ToggleRow({
  checked,
  onChange,
  title,
  description,
  changed = false,
}: Readonly<{
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: string;
  description: ReactNode;
  /** Distinto de lo guardado. */
  changed?: boolean;
}>) {
  const id = useId();
  return (
    <div
      className={`flex items-start gap-3 rounded-xl border p-3 transition-colors ${
        checked
          ? "border-violet-300 bg-violet-50/70 dark:border-violet-500/40 dark:bg-violet-900/15"
          : "border-slate-200 dark:border-white/10"
      }`}
    >
      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{title}</span>
          <Unsaved show={changed} />
        </span>
        <span id={`${id}-desc`} className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
          {description}
        </span>
      </label>
      <div className="flex shrink-0 flex-col items-center gap-1">
        <button
          id={id}
          type="button"
          role="switch"
          aria-checked={checked}
          aria-describedby={`${id}-desc`}
          onClick={() => onChange(!checked)}
          className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
            checked ? "bg-violet-600" : "bg-slate-300 dark:bg-slate-600"
          }`}
        >
          <span
            aria-hidden
            className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-[translate] duration-200 ${
              checked ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
        <span
          aria-hidden
          className={`text-[11px] font-semibold ${checked ? "text-violet-700 dark:text-violet-300" : "text-slate-500 dark:text-slate-400"}`}
        >
          {checked ? "Activado" : "Apagado"}
        </span>
      </div>
    </div>
  );
}

/** Tarjeta de radio/checkbox que se ilumina cuando está marcada. */
export const choiceCardClass =
  "flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition-colors border-slate-200 dark:border-white/10 has-checked:border-violet-300 has-checked:bg-violet-50/70 dark:has-checked:border-violet-500/40 dark:has-checked:bg-violet-900/15";

export function Notice({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-900/20 dark:text-amber-300">
      {children}
    </p>
  );
}

// Tarjeta de sección editable: título, descripción, contenido y barra de guardado propia
export function SectionCard({
  title,
  description,
  dirty,
  saving,
  justSaved,
  error,
  onSave,
  onDiscard,
  children,
}: Readonly<{
  title: string;
  description: string;
  dirty: boolean;
  saving: boolean;
  /** Recién guardado: confirma con "Cambios guardados" unos segundos. */
  justSaved: boolean;
  error: string | null;
  onSave: () => void;
  onDiscard: () => void;
  children: ReactNode;
}>) {
  return (
    <form
      onSubmit={(e: React.SubmitEvent<HTMLFormElement>) => {
        e.preventDefault();
        onSave();
      }}
      className={cardClass}
    >
      <div className="mb-5 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{description}</p>
        </div>
        {dirty && (
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:border-amber-500/30 dark:bg-amber-900/20 dark:text-amber-300">
            Cambios sin guardar
          </span>
        )}
      </div>

      <div className="space-y-5">{children}</div>

      {error && (
        <p className="mt-5 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
          {error}
        </p>
      )}

      {/* Con cambios pendientes la barra queda fija abajo (sobre la navegación móvil) hasta guardar o descartar. */}
      <div
        className={`mt-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3 ${
          dirty
            ? "sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 -mx-2 rounded-xl border border-amber-200 bg-white/95 px-3 py-2.5 shadow-lg backdrop-blur-sm dark:border-amber-500/30 dark:bg-slate-900/95 md:bottom-4"
            : `${dividerClass} pt-4`
        }`}
      >
        <output aria-live="polite" className="flex min-h-5 items-center gap-2 text-sm">
          {dirty && (
            <>
              <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-hidden />
              <span className="font-medium text-amber-800 dark:text-amber-300">Tienes cambios sin guardar</span>
            </>
          )}
          {!dirty && justSaved && (
            <span className="flex items-center gap-1.5 font-medium text-emerald-700 dark:text-emerald-400">
              <Check className="h-4 w-4" aria-hidden /> Cambios guardados
            </span>
          )}
        </output>
        <div className="flex gap-2 sm:shrink-0">
          {dirty && (
            <button
              type="button"
              onClick={onDiscard}
              disabled={saving}
              className="flex-1 whitespace-nowrap rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 disabled:opacity-50 sm:flex-none dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/10"
            >
              Descartar
            </button>
          )}
          <button
            type="submit"
            disabled={!dirty || saving}
            aria-busy={saving}
            className="flex-[2] whitespace-nowrap rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold sm:px-6 text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
          >
            {saving ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>
      </div>
    </form>
  );
}
