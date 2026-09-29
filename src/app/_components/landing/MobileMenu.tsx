"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useEffect, useId, useState } from "react";

import { LANDING_LINKS, LOGIN_HREF, REGISTER_HREF } from "./nav-links";

export function MobileMenu() {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? "Cerrar menú" : "Abrir menú"}
        className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-200/70 dark:text-slate-200 dark:hover:bg-white/10"
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      <div
        id={panelId}
        hidden={!open}
        className="bg-ala-mist dark:bg-ala-night absolute inset-x-0 top-full border-b border-slate-200 px-4 pt-2 pb-5 shadow-lg dark:border-white/10"
      >
        <nav aria-label="Secciones">
          <ul className="flex flex-col">
            {LANDING_LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  onClick={close}
                  className="block rounded-lg px-2 py-3 text-base font-medium text-slate-800 hover:bg-slate-200/70 dark:text-slate-100 dark:hover:bg-white/10"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="mt-3 grid gap-2 border-t border-slate-200 pt-4 dark:border-white/10">
          <Link
            href={LOGIN_HREF}
            className="rounded-xl border border-slate-300 px-4 py-3 text-center font-semibold text-slate-800 dark:border-white/20 dark:text-white"
          >
            Iniciar sesión
          </Link>
          <Link
            href={REGISTER_HREF}
            className="bg-ala-violet rounded-xl px-4 py-3 text-center font-semibold text-white hover:bg-violet-600"
          >
            Prueba gratis 7 días
          </Link>
        </div>
      </div>
    </div>
  );
}
