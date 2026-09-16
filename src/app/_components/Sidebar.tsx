"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  type UserRole,
  type NavItem,
  ITEM_ACTIVE_CLASSES,
  ITEM_ICON_CLASSES,
  getNavItemsForRole,
} from "./nav-config";

const COMMON_HREFS = new Set(["/ventas", "/mesas", "/caja", "/inventario"]);

type Props = {
  role: UserRole;
  collapsed: boolean;
  onToggle: () => void;
};

export function Sidebar({ role, collapsed, onToggle }: Readonly<Props>) {
  const pathname = usePathname();
  const allItems = getNavItemsForRole(role);
  const commonItems = allItems.filter((i) => COMMON_HREFS.has(i.href));
  const adminItems = allItems.filter((i) => !COMMON_HREFS.has(i.href));

  function isActive(href: string) {
    return pathname === href;
  }

  function renderItem(item: NavItem) {
    const active = isActive(item.href);
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        title={collapsed ? item.label : undefined}
        className={`flex items-center rounded-lg transition-colors ${
          collapsed ? "justify-center py-2.5" : "gap-3 px-3 py-2"
        } ${
          active
            ? ITEM_ACTIVE_CLASSES[item.color]
            : "text-slate-600 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-200"
        }`}
      >
        <Icon
          size={18}
          className={`shrink-0 ${active ? "" : ITEM_ICON_CLASSES[item.color]}`}
        />
        {!collapsed && (
          <span className="truncate text-sm font-medium">{item.label}</span>
        )}
      </Link>
    );
  }

  return (
    <aside
      className={`sticky top-14 hidden h-[calc(100vh-3.5rem)] shrink-0 flex-col border-r border-slate-200 bg-white transition-all duration-200 dark:border-white/10 dark:bg-slate-950 md:flex ${
        collapsed ? "w-14" : "w-56"
      }`}
    >
      <nav
        aria-label="Navegación principal"
        className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2"
      >
        {!collapsed && (
          <p className="mb-1 px-2 pt-1 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Operaciones
          </p>
        )}
        {commonItems.map(renderItem)}

        {adminItems.length > 0 && (
          <>
            <div className="my-2 border-t border-slate-100 dark:border-white/10" />
            {!collapsed && (
              <p className="mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {role === "OWNER" ? "Administración" : "Más"}
              </p>
            )}
            {adminItems.map(renderItem)}
          </>
        )}
      </nav>

      <div className="border-t border-slate-100 p-2 dark:border-white/10">
        <button
          onClick={onToggle}
          title={collapsed ? "Expandir menú" : "Colapsar menú"}
          className={`flex w-full items-center rounded-lg px-2 py-2 text-xs text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-white/5 dark:hover:text-slate-300 ${
            collapsed ? "justify-center" : "gap-2"
          }`}
        >
          {collapsed ? <ChevronRight size={15} /> : (
            <>
              <ChevronLeft size={15} />
              <span>Colapsar</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
