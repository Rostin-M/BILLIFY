"use client";

import { ErrorScreen } from "~/app/_components/ErrorScreen";

/**
 * Errores dentro de la app: se muestran en el área de contenido y el menú sigue
 * disponible, así el usuario puede ir a otra sección sin perder la sesión.
 */
export default function AppError({
  error,
  reset,
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  return (
    <ErrorScreen
      variant="inline"
      title="No pudimos cargar esta sección"
      description="Ocurrió un problema inesperado. Tus ventas y datos guardados no se perdieron. Inténtalo de nuevo o ve a otra sección desde el menú."
      error={error}
      reset={reset}
    />
  );
}
