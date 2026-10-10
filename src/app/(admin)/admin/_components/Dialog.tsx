"use client";

import { X } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef } from "react";

/**
 * Diálogo modal sobre el <dialog> nativo: el navegador se encarga de atrapar el
 * foco, de Escape, de dejar inerte el fondo y de devolver el foco al cerrar.
 *
 *  - variant "sheet": panel lateral derecho en escritorio, pantalla completa en
 *    el celular. Para formularios largos (activar plan).
 *  - variant "modal": tarjeta centrada. Para confirmaciones cortas.
 *
 * Se monta solo mientras está abierto: `{open && <Dialog ... />}`.
 */
export function Dialog({
  variant,
  title,
  subtitle,
  onClose,
  busy = false,
  footer,
  onSubmit,
  children,
}: Readonly<{
  variant: "sheet" | "modal";
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  /** Mientras se guarda no se puede cerrar (ni con Escape ni tocando fuera). */
  busy?: boolean;
  /** Zona fija inferior: resumen y botones. */
  footer: ReactNode;
  onSubmit: () => void;
  children: ReactNode;
}>) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!el.open) el.showModal();
    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = previousOverflow;
      if (el.open) el.close();
    };
  }, []);

  const shape =
    variant === "sheet"
      ? "admin-sheet m-0 ml-auto h-dvh max-h-none w-full max-w-none sm:max-w-[31rem] sm:border-l"
      : "admin-modal m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md rounded-2xl border";

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        // Escape: se cierra por estado de React, no por el navegador.
        e.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(e) => {
        // Clic en el fondo oscuro (el propio <dialog>, fuera del contenido).
        if (e.target === e.currentTarget && !busy) onClose();
      }}
      className={`${shape} overflow-hidden border-slate-200 bg-white p-0 text-slate-900 shadow-2xl dark:border-white/10 dark:bg-[#0b1230] dark:text-slate-100`}
    >
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className={`flex flex-col ${variant === "sheet" ? "h-full" : "max-h-[calc(100dvh-2rem)]"}`}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-4 py-3.5 sm:px-5 dark:border-white/10">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
              {title}
            </h2>
            {subtitle && <div className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">{subtitle}</div>}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Cerrar"
            className="-mr-1.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:opacity-40 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
          >
            <X aria-hidden className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">{children}</div>

        <footer className="shrink-0 border-t border-slate-200 bg-slate-50 px-4 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] sm:px-5 dark:border-white/10 dark:bg-white/[0.03]">
          {footer}
        </footer>
      </form>
    </dialog>
  );
}
