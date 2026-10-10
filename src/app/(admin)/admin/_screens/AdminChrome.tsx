"use client";

import { type ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";

import { signOutAndClear } from "~/lib/clientSignOut";

import { AdminShell } from "../_components/AdminShell";
import { leaveExpiredSession, useOverview } from "../_data/platform";

const WARN_BEFORE_MS = 10 * 60_000;
const TICK_MS = 30_000;

const TIME = new Intl.DateTimeFormat("es-CO", {
  timeZone: "America/Bogota",
  hour: "numeric",
  minute: "2-digit",
});

/**
 * Vencimiento de la sesión (24 h desde el ingreso), versión mínima para el
 * panel: avisa 10 minutos antes y, al cumplirse, cierra la sesión y lleva al
 * login con `?expired=1`. El servidor rechaza la sesión vencida de todas
 * formas (y `_data/platform` reacciona a ese UNAUTHORIZED); esto solo evita
 * que el administrador se entere a mitad de una acción.
 */
function useSessionExpiry(expiresAt: number, serverNow: number): void {
  // Desfase servidor − cliente, fijado al montar.
  const [skewMs] = useState(() => serverNow - Date.now());

  useEffect(() => {
    let warned = false;
    const tick = () => {
      const remaining = expiresAt - (Date.now() + skewMs);
      if (remaining <= 0) {
        toast.dismiss("admin-session-expiry");
        leaveExpiredSession();
        return;
      }
      if (remaining <= WARN_BEFORE_MS && !warned) {
        warned = true;
        toast.info("Tu sesión se cerrará pronto", {
          id: "admin-session-expiry",
          description: `Se cierra sola a las ${TIME.format(new Date(expiresAt))}. Termina lo que estés haciendo y vuelve a ingresar.`,
          duration: 20_000,
        });
      }
    };
    tick();
    const interval = setInterval(tick, TICK_MS);
    // Al volver a la pestaña (o desbloquear el teléfono) se revisa de inmediato.
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [expiresAt, skewMs]);
}

/** Conecta el armazón con los datos: contador de pagos por revisar, sesión y cierre de sesión. */
export function AdminChrome({
  adminName,
  sessionExpiresAt,
  serverNow,
  children,
}: Readonly<{
  adminName: string | null;
  /** Epoch ms en que vence la sesión, calculado en el servidor. */
  sessionExpiresAt: number;
  /** Date.now() del servidor al renderizar, para corregir el reloj local. */
  serverNow: number;
  children: ReactNode;
}>) {
  const overview = useOverview();
  useSessionExpiry(sessionExpiresAt, serverNow);

  return (
    <AdminShell
      adminName={adminName}
      paymentsToReview={overview.data?.paymentsToReview}
      onSignOut={() => void signOutAndClear("/auth/login")}
    >
      {children}
    </AdminShell>
  );
}
