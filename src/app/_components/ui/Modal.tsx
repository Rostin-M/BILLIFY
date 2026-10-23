"use client";

import type { ReactNode } from "react";
import { useDialog } from "./useDialog";

type Props = Readonly<{
  onClose: () => void;
  /** Fondo oscuro que envuelve al diálogo; sin él, el diálogo mismo cubre la pantalla. */
  overlayClassName?: string;
  className?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  children: ReactNode;
}>;

/**
 * Modal hecho a mano sobre `<dialog open>`: se monta solo mientras está abierto
 * (`{open && <Modal …/>}`) y useDialog pone Escape, foco atrapado y bloqueo del scroll.
 * No usa showModal() para que convivan los modales anidados y los portales con su z-index.
 */
export function Modal({ onClose, overlayClassName, className, children, ...aria }: Props) {
  const ref = useDialog<HTMLDialogElement>(onClose);
  const dialog = (
    <dialog open ref={ref} aria-modal="true" className={className} {...aria}>
      {children}
    </dialog>
  );
  return overlayClassName ? <div className={overlayClassName}>{dialog}</div> : dialog;
}
