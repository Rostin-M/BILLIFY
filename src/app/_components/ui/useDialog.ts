"use client";

import { useEffect, useRef } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Pila de diálogos abiertos: Escape y Tab solo los atiende el de arriba
// (p. ej. el aviso de peso abierto sobre el modal de pedido).
const stack: HTMLElement[] = [];

/**
 * Comportamiento accesible para los modales hechos a mano: cierra con Escape,
 * mueve el foco al diálogo y lo mantiene dentro (Tab / Shift+Tab), bloquea el
 * scroll del fondo y, al cerrar, devuelve el foco a lo que lo abrió.
 *
 * Uso: `const ref = useDialog(onClose)` y `<div ref={ref} role="dialog" aria-modal="true">`.
 */
export function useDialog<T extends HTMLElement = HTMLDivElement>(onClose: () => void, enabled = true) {
  const ref = useRef<T>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el) return;

    const previous = document.activeElement as HTMLElement | null;
    stack.push(el);

    // Respeta el autoFocus de un campo; si no hay, enfoca el primer control o el diálogo.
    if (!el.contains(document.activeElement)) {
      const first = el.querySelector<HTMLElement>(FOCUSABLE);
      if (first) first.focus();
      else {
        el.tabIndex = -1;
        el.focus();
      }
    }

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(e: KeyboardEvent) {
      if (stack.at(-1) !== el || !el) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null);
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items.at(-1)!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      const i = stack.lastIndexOf(el);
      if (i >= 0) stack.splice(i, 1);
      if (stack.length === 0) document.body.style.overflow = prevOverflow;
      if (previous?.isConnected) previous.focus();
    };
  }, [enabled]);

  return ref;
}
