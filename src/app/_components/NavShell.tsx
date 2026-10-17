"use client";

import { useEffect, useState } from "react";
import { Sidebar, type SidebarMode } from "./Sidebar";
import type { UserRole } from "./nav-config";

type Props = {
  role: UserRole;
  children: React.ReactNode;
};

const SIDEBAR_KEY = "billify_sidebar";

export function NavShell({ role, children }: Readonly<Props>) {
  // "auto" en el primer render (igual en servidor y cliente); luego se aplica la
  // preferencia guardada. En auto, tablet ve el menú colapsado y escritorio expandido.
  const [mode, setMode] = useState<SidebarMode>("auto");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SIDEBAR_KEY);
      if (saved === "collapsed" || saved === "expanded") setMode(saved);
    } catch {
      // Sin acceso a localStorage (modo privado): se queda en auto.
    }
  }, []);

  function toggle() {
    // En auto, lo que se ve depende del ancho: se invierte lo que el usuario está viendo.
    const looksExpanded = mode === "expanded" || (mode === "auto" && window.matchMedia("(min-width: 1024px)").matches);
    const next: SidebarMode = looksExpanded ? "collapsed" : "expanded";
    setMode(next);
    try {
      localStorage.setItem(SIDEBAR_KEY, next);
    } catch {
      // Preferencia solo para esta sesión.
    }
  }

  return (
    <div className="flex">
      <Sidebar role={role} mode={mode} onToggle={toggle} />
      <div
        id="contenido"
        tabIndex={-1}
        className="min-w-0 flex-1 pb-[calc(4rem+env(safe-area-inset-bottom))] outline-none md:pb-0"
      >
        {children}
      </div>
    </div>
  );
}
