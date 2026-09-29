import type { ReactNode } from "react";

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

export function CheckboxRow({
  checked,
  onChange,
  title,
  description,
}: Readonly<{
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: string;
  description: ReactNode;
}>) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3 dark:border-white/10">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={title}
        className="mt-0.5 h-4 w-4 shrink-0 rounded accent-violet-600"
      />
      <div>
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{title}</p>
        <p className="text-xs text-slate-500 dark:text-slate-500">{description}</p>
      </div>
    </label>
  );
}

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
  error,
  onSave,
  onDiscard,
  children,
}: Readonly<{
  title: string;
  description: string;
  dirty: boolean;
  saving: boolean;
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

      <div className={`${dividerClass} mt-5 flex flex-col-reverse gap-2 pt-4 sm:flex-row sm:justify-end`}>
        {dirty && (
          <button
            type="button"
            onClick={onDiscard}
            disabled={saving}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 disabled:opacity-50 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/10"
          >
            Descartar
          </button>
        )}
        <button
          type="submit"
          disabled={!dirty || saving}
          className="rounded-lg bg-violet-600 px-6 py-2 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Guardando..." : "Guardar cambios"}
        </button>
      </div>
    </form>
  );
}
