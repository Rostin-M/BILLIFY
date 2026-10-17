"use client";

import { useLinkStatus } from "next/link";

/**
 * Va dentro de un <Link>: mientras la página destino carga, el contenido (el ícono)
 * late, para que se note que el toque llegó aunque la página tarde en abrir.
 */
export function LinkPending({ children }: Readonly<{ children: React.ReactNode }>) {
  const { pending } = useLinkStatus();
  return (
    <span aria-hidden className={`inline-flex shrink-0 ${pending ? "animate-pulse opacity-60" : ""}`}>
      {children}
    </span>
  );
}
