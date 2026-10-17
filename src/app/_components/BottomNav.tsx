"use client";

import Link from "next/link";
import { Home } from "lucide-react";
import { usePathname } from "next/navigation";
import { LinkPending } from "./LinkPending";
import {
  type UserRole,
  ITEM_ICON_CLASSES,
  getBottomNavItems,
} from "./nav-config";

const SHORT_LABELS: Record<string, string> = {
  "/ventas": "Ventas",
  "/mesas": "Mesas",
  "/caja": "Caja",
  "/inventario": "Inventario",
  "/dashboard": "Dashboard",
};

type Props = { role: UserRole };

export function BottomNav({ role }: Readonly<Props>) {
  const pathname = usePathname();
  const items = getBottomNavItems(role);

  // Activo también en subrutas (/suscripcion/resultado…). Las secciones que no están en la
  // barra se alcanzan desde Inicio, así que Inicio queda marcado en ellas.
  function isActive(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }
  const homeActive = pathname === "/" || !items.some((i) => isActive(i.href));

  return (
    <nav
      aria-label="Navegación móvil"
      className="fixed bottom-0 left-0 right-0 z-30 flex h-[calc(4rem+env(safe-area-inset-bottom))] items-stretch border-t pb-[env(safe-area-inset-bottom)] border-slate-200 bg-white/95 backdrop-blur-sm dark:border-white/10 dark:bg-slate-950/95 md:hidden"
    >
      {items.map((item) => {
        const active = isActive(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`relative flex flex-1 flex-col items-center justify-center gap-1 transition-colors ${
              active
                ? `${ITEM_ICON_CLASSES[item.color]} font-semibold before:absolute before:inset-x-5 before:top-0 before:h-0.5 before:rounded-full before:bg-current`
                : "text-slate-500 dark:text-slate-400"
            }`}
          >
            <LinkPending>
              <Icon size={22} />
            </LinkPending>
            <span className="text-[11px] leading-none">
              {SHORT_LABELS[item.href] ?? item.label}
            </span>
          </Link>
        );
      })}

      <Link
        href="/"
        aria-current={pathname === "/" ? "page" : undefined}
        className={`relative flex flex-1 flex-col items-center justify-center gap-1 transition-colors ${
          homeActive
            ? "font-semibold text-violet-600 before:absolute before:inset-x-5 before:top-0 before:h-0.5 before:rounded-full before:bg-current dark:text-violet-400"
            : "text-slate-500 dark:text-slate-400"
        }`}
      >
        <LinkPending>
          <Home size={22} />
        </LinkPending>
        <span className="text-[11px] leading-none">Inicio</span>
      </Link>
    </nav>
  );
}
