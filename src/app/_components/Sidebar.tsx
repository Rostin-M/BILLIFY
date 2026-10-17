"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { LinkPending } from "./LinkPending";
import {
  type UserRole,
  type NavItem,
  ITEM_ACTIVE_CLASSES,
  ITEM_ICON_CLASSES,
  getNavItemsForRole,
} from "./nav-config";

const COMMON_HREFS = new Set(["/ventas", "/mesas", "/caja", "/inventario"]);

/** "auto": colapsado en tablet (md) y expandido desde lg. Los otros dos los elige el usuario. */
export type SidebarMode = "auto" | "collapsed" | "expanded";

type Props = {
  role: UserRole;
  mode: SidebarMode;
  onToggle: () => void;
};

/** Clases según el modo: en "auto" el cambio lo hace el CSS en el breakpoint lg. */
function byMode(mode: SidebarMode, collapsed: string, expanded: string, auto: string) {
  if (mode === "collapsed") return collapsed;
  if (mode === "expanded") return expanded;
  return auto;
}

export function Sidebar({ role, mode, onToggle }: Readonly<Props>) {
  const pathname = usePathname();
  const allItems = getNavItemsForRole(role);
  const commonItems = allItems.filter((i) => COMMON_HREFS.has(i.href));
  const adminItems = allItems.filter((i) => !COMMON_HREFS.has(i.href));
  const labelClass = byMode(mode, "hidden", "", "hidden lg:inline");
  const headingClass = byMode(mode, "hidden", "", "hidden lg:block");

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  function renderItem(item: NavItem) {
    const active = isActive(item.href);
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        title={mode === "expanded" ? undefined : item.label}
        className={`flex items-center rounded-lg transition-colors ${byMode(
          mode,
          "justify-center py-2.5",
          "gap-3 px-3 py-2.5 lg:py-2",
          "justify-center py-2.5 lg:justify-start lg:gap-3 lg:px-3 lg:py-2",
        )} ${
          active
            ? ITEM_ACTIVE_CLASSES[item.color]
            : "text-slate-600 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-200"
        }`}
      >
        <LinkPending>
          <Icon
            size={18}
            aria-hidden
            className={`shrink-0 ${active ? "" : ITEM_ICON_CLASSES[item.color]}`}
          />
        </LinkPending>
        <span className={`truncate text-sm font-medium ${labelClass}`}>{item.label}</span>
      </Link>
    );
  }

  return (
    <aside
      className={`sticky top-14 hidden h-[calc(100dvh-3.5rem)] shrink-0 flex-col border-r border-slate-200 bg-white transition-all duration-200 dark:border-white/10 dark:bg-slate-950 md:flex ${byMode(
        mode,
        "w-14",
        "w-56",
        "w-14 lg:w-56",
      )}`}
    >
      <nav
        aria-label="Navegación principal"
        className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2"
      >
        <p className={`mb-1 px-2 pt-1 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 ${headingClass}`}>
          Operaciones
        </p>
        {commonItems.map(renderItem)}

        {adminItems.length > 0 && (
          <>
            <div className="my-2 border-t border-slate-100 dark:border-white/10" />
            <p className={`mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 ${headingClass}`}>
              {role === "OWNER" ? "Administración" : "Más"}
            </p>
            {adminItems.map(renderItem)}
          </>
        )}
      </nav>

      <div className="border-t border-slate-100 p-2 dark:border-white/10">
        <button
          onClick={onToggle}
          aria-label="Expandir o colapsar el menú"
          className={`flex min-h-10 w-full items-center rounded-lg px-2 text-xs text-slate-500 transition hover:bg-slate-100 hover:text-slate-600 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-300 ${byMode(
            mode,
            "justify-center",
            "gap-2",
            "justify-center lg:justify-start lg:gap-2",
          )}`}
        >
          <ChevronRight size={15} aria-hidden className={byMode(mode, "", "hidden", "lg:hidden")} />
          <ChevronLeft size={15} aria-hidden className={byMode(mode, "hidden", "", "hidden lg:inline")} />
          <span className={labelClass}>Colapsar</span>
        </button>
      </div>
    </aside>
  );
}
