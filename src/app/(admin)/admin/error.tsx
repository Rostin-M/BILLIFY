"use client";

import { cardClass, ErrorState } from "./_components/ui";

/**
 * Error inesperado en una pantalla del panel: se muestra dentro del armazón,
 * así el menú sigue disponible para ir a otra sección.
 */
export default function AdminError({
  reset,
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  return (
    <div className={cardClass}>
      <ErrorState
        message="Esta pantalla falló al mostrarse. No se cambió nada en ningún negocio. Inténtalo de nuevo o ve a otra sección desde el menú."
        onRetry={reset}
      />
    </div>
  );
}
