"use client";

import { ErrorScreen } from "./_components/ErrorScreen";

/** Errores fuera de la app autenticada (login, registro, páginas legales). */
export default function RootError({
  error,
  reset,
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  return (
    <ErrorScreen
      variant="fullscreen"
      title="Algo salió mal"
      description="Tuvimos un problema al cargar esta página. Inténtalo de nuevo; si el problema continúa, avísanos con el código de referencia."
      error={error}
      reset={reset}
    />
  );
}
