"use client";

import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { signOutAndClear } from "~/lib/clientSignOut";

import { hasOpenCashRegister } from "./sessionExpiryActions";

type Props = {
  /** Epoch ms en que vence la sesión (loginAt + 24 h), calculado en el servidor. */
  expiresAt: number;
  /** Date.now() del servidor al renderizar, para corregir el desfase del reloj local. */
  serverNow: number;
  /** Si el usuario tenía una caja abierta al renderizar el layout. */
  initialHasOpenRegister: boolean;
};

const MINUTE = 60_000;
const WARN_OPEN_REGISTER_MS = 60 * MINUTE;
const STICKY_OPEN_REGISTER_MS = 15 * MINUTE;
const WARN_NO_REGISTER_MS = 10 * MINUTE;
const TICK_MS = 30_000;
/** En la fase crítica se revisa la caja cada 2 min para quitar el aviso al cerrarla. */
const RECHECK_MS = 2 * MINUTE;

const timeFormatter = new Intl.DateTimeFormat("es-CO", {
  timeZone: "America/Bogota",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/**
 * Cierra la sesión al cumplirse las 24 h desde el login y, si el usuario tiene
 * la caja abierta, le recuerda cerrarla antes: aviso descartable a T-60 min y
 * banner fijo a T-15 min. Sin caja abierta solo avisa a T-10 min.
 * El servidor rechaza la sesión vencida de todas formas; esto es solo UX.
 */
export function SessionExpiryGuard({ expiresAt, serverNow, initialHasOpenRegister }: Readonly<Props>) {
  const router = useRouter();
  const [showSticky, setShowSticky] = useState(false);

  // Desfase servidor − cliente, fijado al montar.
  const [skewMs] = useState(() => serverNow - Date.now());

  const hasOpenRef = useRef(initialHasOpenRegister);
  const lastCheckRef = useRef(0);
  const checkingRef = useRef(false);
  const warned60Ref = useRef(false);
  const warned10Ref = useRef(false);
  const signedOutRef = useRef(false);

  const expiresLabel = timeFormatter.format(new Date(expiresAt));

  const refreshOpenRegister = useCallback(async (): Promise<boolean> => {
    if (checkingRef.current) return hasOpenRef.current;
    checkingRef.current = true;
    try {
      hasOpenRef.current = await hasOpenCashRegister();
      lastCheckRef.current = Date.now();
    } catch {
      // Sin red: se conserva el último valor conocido.
    } finally {
      checkingRef.current = false;
    }
    return hasOpenRef.current;
  }, []);

  const tick = useCallback(async () => {
    if (signedOutRef.current) return;
    const remaining = expiresAt - (Date.now() + skewMs);

    if (remaining <= 0) {
      signedOutRef.current = true;
      toast.dismiss();
      // Cierre automático: sin aviso. La cola sin conexión se conserva (ligada al usuario).
      void signOutAndClear("/auth/login?expired=1");
      return;
    }

    if (remaining > WARN_OPEN_REGISTER_MS) return;

    const needsCheck =
      !warned60Ref.current ||
      (remaining <= STICKY_OPEN_REGISTER_MS && Date.now() - lastCheckRef.current >= RECHECK_MS);
    const hasOpen = needsCheck ? await refreshOpenRegister() : hasOpenRef.current;

    if (!warned60Ref.current) {
      warned60Ref.current = true;
      if (hasOpen && remaining > STICKY_OPEN_REGISTER_MS) {
        toast.warning(
          `Tu sesión se cerrará a las ${expiresLabel}. Tienes la caja abierta: ciérrala antes para no dejarla abierta hasta mañana.`,
          {
            id: "session-expiry-register",
            duration: Infinity,
            closeButton: true,
            action: { label: "Ir a caja", onClick: () => router.push("/caja") },
          },
        );
      }
    }

    const sticky = hasOpen && remaining <= STICKY_OPEN_REGISTER_MS;
    setShowSticky(sticky);
    if (sticky) toast.dismiss("session-expiry-register");

    if (!hasOpen && remaining <= WARN_NO_REGISTER_MS && !warned10Ref.current) {
      warned10Ref.current = true;
      toast.info("Tu sesión se cerrará pronto", {
        id: "session-expiry-soon",
        description: `Se cerrará automáticamente a las ${expiresLabel}.`,
        duration: 15_000,
      });
    }
  }, [expiresAt, expiresLabel, refreshOpenRegister, router, skewMs]);

  useEffect(() => {
    void tick();
    const interval = window.setInterval(() => void tick(), TICK_MS);
    // Al volver a la pestaña (o despertar el equipo) se revisa de inmediato.
    const onVisible = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [tick]);

  if (!showSticky) return null;

  return (
    <div
      role="alert"
      className="sticky top-14 z-30 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/90 dark:text-amber-100"
    >
      <span className="flex items-center gap-2">
        <AlertTriangle size={16} className="shrink-0 text-amber-600 dark:text-amber-400" />
        <span>
          Tu sesión se cerrará a las <strong>{expiresLabel}</strong>. Tienes la caja abierta:
          ciérrala antes para no dejarla abierta hasta mañana.
        </span>
      </span>
      <Link
        href="/caja"
        className="rounded-lg bg-amber-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-amber-500"
      >
        Ir a caja
      </Link>
    </div>
  );
}
