"use client";

import { useIsMutating } from "@tanstack/react-query";

/**
 * Franja animada bajo el header mientras se guarda algo (cualquier mutación en curso).
 * Es el aviso general de "el sistema está trabajando"; el botón tocado muestra además
 * su propio indicador (aria-busy). Las consultas en segundo plano no la encienden.
 */
export function ActivityBar() {
  const saving = useIsMutating() > 0;
  return (
    <>
      {saving && <div className="activity-bar" aria-hidden="true" />}
      <output className="sr-only">
        {saving ? "Guardando…" : ""}
      </output>
    </>
  );
}
