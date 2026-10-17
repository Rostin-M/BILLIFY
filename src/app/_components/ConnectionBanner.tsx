"use client";

import { WifiOff } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { toast } from "sonner";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/**
 * Aviso de "sin conexión" en toda la app. Ventas tiene el suyo (con la cola de
 * ventas offline), así que ahí no se repite. En el servidor se asume conexión,
 * para que el HTML inicial coincida con el del cliente.
 */
export function ConnectionBanner() {
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
  const pathname = usePathname();
  const wasOffline = useRef(false);

  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
    } else if (wasOffline.current) {
      wasOffline.current = false;
      toast.success("Volvió la conexión");
    }
  }, [online]);

  if (online || pathname.startsWith("/ventas")) return null;

  return (
    <div
      role="status"
      className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-900/20 dark:text-amber-200"
    >
      <WifiOff aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="min-w-0 flex-1">
        <strong className="font-semibold">Sin conexión a internet.</strong> Lo que cambies aquí no se guardará
        hasta que vuelva la señal. Te avisamos cuando regrese.
      </p>
    </div>
  );
}
