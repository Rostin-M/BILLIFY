"use client";

import Link from "next/link";
import { Home } from "lucide-react";
import { usePathname } from "next/navigation";
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

  function isActive(href: string) {
    return pathname === href;
  }

  return (
    <nav
      aria-label="Navegación móvil"
      className="fixed bottom-0 left-0 right-0 z-30 flex h-16 items-center border-t border-slate-200 bg-white/95 backdrop-blur-sm dark:border-white/10 dark:bg-slate-950/95 md:hidden"
    >
      {items.map((item) => {
        const active = isActive(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-1 flex-col items-center gap-1 py-2 transition-colors ${
              active
                ? `${ITEM_ICON_CLASSES[item.color]} font-semibold`
                : "text-slate-500 dark:text-slate-500"
            }`}
          >
            <Icon size={22} />
            <span className="text-[10px] leading-none">
              {SHORT_LABELS[item.href] ?? item.label}
            </span>
          </Link>
        );
      })}

      <Link
        href="/"
        className={`flex flex-1 flex-col items-center gap-1 py-2 transition-colors ${
          pathname === "/"
            ? "font-semibold text-violet-600 dark:text-violet-400"
            : "text-slate-500 dark:text-slate-500"
        }`}
      >
        <Home size={22} />
        <span className="text-[10px] leading-none">Inicio</span>
      </Link>
    </nav>
  );
}
