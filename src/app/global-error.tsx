"use client";

import "~/styles/globals.css";

import { ErrorScreen } from "./_components/ErrorScreen";

/**
 * Último recurso: errores en el layout raíz. Reemplaza todo el documento, por eso
 * define su propio <html> y <body> (sin providers ni tema).
 */
export default function GlobalError({
  error,
  reset,
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  return (
    <html lang="es">
      <body>
        <ErrorScreen
          variant="fullscreen"
          title="BILLIFY no pudo iniciar"
          description="Ocurrió un error grave al cargar la aplicación. Inténtalo de nuevo en unos segundos."
          error={error}
          reset={reset}
        />
      </body>
    </html>
  );
}
