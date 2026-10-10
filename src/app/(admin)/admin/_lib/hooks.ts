"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

/** Devuelve `value` con retraso: evita consultar en cada tecla al buscar. */
export function useDebounced<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

/**
 * Filtros guardados en la URL (`?estado=TRIAL&q=cafe`): se pueden compartir,
 * sobreviven a recargar y el botón Atrás vuelve a la lista como estaba.
 * Se escribe con `history.replaceState`, que Next sincroniza con
 * `useSearchParams` sin volver a pedir la página al servidor.
 */
export function useUrlFilters(): {
  get: (name: string) => string | null;
  set: (changes: Record<string, string | null>) => void;
} {
  const params = useSearchParams();
  const pathname = usePathname();

  const set = useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(window.location.search);
      for (const [name, value] of Object.entries(changes)) {
        if (value === null || value === "") next.delete(name);
        else next.set(name, value);
      }
      const query = next.toString();
      window.history.replaceState(null, "", query ? `${pathname}?${query}` : pathname);
    },
    [pathname],
  );

  const get = useCallback((name: string) => params.get(name), [params]);
  return { get, set };
}
