"use client";

import { type RefObject, useEffect, useRef } from "react";

/** ¿El usuario está escribiendo en un campo? Entonces "/" es un carácter, no un atajo. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/**
 * Atajos de teclado del punto de venta (escritorio):
 *   /  o  F2        → enfocar la búsqueda
 *   Ctrl/⌘ + Enter  → confirmar la venta (también F12)
 * Enter dentro de la búsqueda lo maneja el propio campo (agrega el producto).
 * Con un modal abierto no se dispara nada.
 *
 * Además enfoca la búsqueda al entrar si hay mouse y pantalla de tablet o mayor:
 * en celular abriría el teclado sin que el usuario lo pida.
 */
export function usePosShortcuts(searchRef: RefObject<HTMLInputElement | null>, onConfirm: () => void) {
  const confirmRef = useRef(onConfirm);
  confirmRef.current = onConfirm;

  useEffect(() => {
    if (window.matchMedia("(pointer: fine) and (min-width: 768px)").matches) {
      searchRef.current?.focus({ preventScroll: true });
    }

    function onKeyDown(e: KeyboardEvent) {
      if (document.querySelector('[aria-modal="true"]')) return;
      const wantsSearch = e.key === "F2" || (e.key === "/" && !isTyping(e.target) && !e.ctrlKey && !e.metaKey);
      if (wantsSearch) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }
      if (e.key === "F12" || (e.key === "Enter" && (e.ctrlKey || e.metaKey))) {
        e.preventDefault();
        confirmRef.current();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [searchRef]);
}

/**
 * Producto que agrega Enter en la búsqueda: coincidencia exacta de código de barras
 * (lectores USB escriben el código y envían Enter) o el único resultado.
 */
export function pickOnEnter<P extends { barcode: string | null }>(query: string, results: P[], all: P[]): P | null {
  const q = query.trim();
  if (!q) return null;
  return all.find((p) => p.barcode === q) ?? (results.length === 1 ? results[0]! : null);
}

/** Filtro de la búsqueda: nombre, marca, categoría o código de barras. */
export function matchesSearch(
  p: { name: string; barcode: string | null; category: string | null; brand?: string | null },
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    p.name.toLowerCase().includes(q) ||
    (p.brand?.toLowerCase().includes(q) ?? false) ||
    (p.category?.toLowerCase().includes(q) ?? false) ||
    (p.barcode?.includes(q) ?? false)
  );
}
