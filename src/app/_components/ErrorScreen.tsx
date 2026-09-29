"use client";

import { AlertTriangle, Home, type LucideIcon, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";

import { Logo } from "./Logo";

type Variant = "fullscreen" | "inline";

type ErrorScreenProps = Readonly<{
  /** fullscreen: fuera de la app (sin menú). inline: dentro del layout de la app. */
  variant: Variant;
  title: string;
  description: string;
  icon?: LucideIcon;
  /** Error capturado por el boundary; su mensaje solo se muestra en desarrollo. */
  error?: Error & { digest?: string };
  /** `reset` del boundary. Si falta, no se muestra el botón de reintentar. */
  reset?: () => void;
  homeHref?: string;
  homeLabel?: string;
}>;

const isDev = process.env.NODE_ENV === "development";

// fullscreen siempre es oscuro (como login y la pantalla de carga); inline sigue el tema.
const STYLES: Record<Variant, Record<"main" | "iconBox" | "title" | "description" | "homeLink" | "digest", string>> = {
  fullscreen: {
    main: "relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-slate-950 px-4 py-10",
    iconBox: "mb-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-3",
    title: "text-xl font-semibold text-white",
    description: "mt-2 text-sm text-slate-400",
    homeLink: "border-white/15 text-slate-200 hover:bg-white/5",
    digest: "mt-6 text-xs text-slate-500",
  },
  inline: {
    main: "flex min-h-[60vh] flex-col items-center justify-center px-4 py-12",
    iconBox: "mb-4 rounded-2xl border border-red-200 bg-red-50 p-3 dark:border-red-500/30 dark:bg-red-500/10",
    title: "text-xl font-semibold text-slate-800 dark:text-slate-100",
    description: "mt-2 text-sm text-slate-500 dark:text-slate-400",
    homeLink:
      "border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/5",
    digest: "mt-6 text-xs text-slate-400 dark:text-slate-500",
  },
};

function RetryButton({ reset }: Readonly<{ reset: () => void }>) {
  const router = useRouter();
  const [isRetrying, startRetry] = useTransition();

  // Los errores de Server Components necesitan volver a pedir los datos al servidor.
  const retry = () =>
    startRetry(() => {
      router.refresh();
      reset();
    });

  return (
    <button
      type="button"
      onClick={retry}
      disabled={isRetrying}
      className="inline-flex items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <RotateCcw size={16} aria-hidden="true" className={isRetrying ? "animate-spin" : undefined} />
      {isRetrying ? "Reintentando..." : "Reintentar"}
    </button>
  );
}

function FullscreenBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
      style={{
        background: "radial-gradient(ellipse 60% 50% at 50% 30%, rgba(239,68,68,0.08) 0%, transparent 70%)",
      }}
    />
  );
}

/**
 * Pantalla de error de BILLIFY. En producción nunca muestra el mensaje técnico
 * (puede contener datos internos): solo el código de referencia (`digest`) con el
 * que se encuentra el error en los logs del servidor.
 */
export function ErrorScreen({
  variant,
  title,
  description,
  icon: Icon = AlertTriangle,
  error,
  reset,
  homeHref = "/",
  homeLabel = "Ir al inicio",
}: ErrorScreenProps) {
  useEffect(() => {
    if (error) console.error("[BILLIFY] error de interfaz:", error);
  }, [error]);

  const styles = STYLES[variant];
  const fullscreen = variant === "fullscreen";
  const devMessage = isDev ? error?.message : undefined;

  return (
    <main role="alert" className={styles.main}>
      {fullscreen && <FullscreenBackdrop />}

      <div className="animate-form-in relative flex w-full max-w-md flex-col items-center text-center">
        {fullscreen && (
          <div className="mb-6 flex flex-col items-center">
            <Logo size="md" className="logo-glow" />
            <p className="mt-2 text-sm font-bold tracking-[0.25em] text-white">BILLIFY</p>
          </div>
        )}

        <div className={styles.iconBox}>
          <Icon size={28} className="text-red-500 dark:text-red-400" aria-hidden="true" />
        </div>

        <h1 className={styles.title}>{title}</h1>
        <p className={styles.description}>{description}</p>

        {devMessage && (
          <pre className="mt-4 max-h-40 w-full overflow-auto rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-left text-xs whitespace-pre-wrap text-amber-700 dark:text-amber-300">
            {devMessage}
          </pre>
        )}

        <div className="mt-6 flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          {reset && <RetryButton reset={reset} />}
          <Link
            href={homeHref}
            className={`inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold transition ${styles.homeLink}`}
          >
            <Home size={16} aria-hidden="true" />
            {homeLabel}
          </Link>
        </div>

        {error?.digest && (
          <p className={styles.digest}>
            Código de referencia: <span className="font-mono select-all">{error.digest}</span>
          </p>
        )}
      </div>
    </main>
  );
}
