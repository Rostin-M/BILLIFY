"use client";

import { LayoutDashboard, LogOut, type LucideIcon, Moon, Receipt, ScrollText, Store, Sun } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { type ReactNode, useEffect, useState } from "react";

import { Logo } from "~/app/_components/Logo";

import { initials } from "../_lib/format";

type NavItem = { href: string; label: string; icon: LucideIcon; exact?: boolean };

const NAV: NavItem[] = [
  { href: "/admin", label: "Resumen", icon: LayoutDashboard, exact: true },
  { href: "/admin/negocios", label: "Negocios", icon: Store },
  { href: "/admin/pagos", label: "Pagos", icon: Receipt },
  { href: "/admin/bitacora", label: "Bitácora", icon: ScrollText },
];

function isActive(pathname: string, item: NavItem): boolean {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** Marca del panel: el águila + "Plataforma" siempre a la vista, para no confundirlo con la app de un negocio. */
function Brand() {
  return (
    <Link href="/admin" className="flex items-center gap-2.5 rounded-lg">
      <Logo size="sm" />
      <span className="flex flex-col leading-none">
        <span className="text-sm font-bold tracking-[0.2em] text-white">BILLIFY</span>
        <span className="mt-1 text-xs font-semibold text-ala-cyan">Plataforma</span>
      </span>
    </Link>
  );
}

function ThemeButton({ withLabel }: Readonly<{ withLabel: boolean }>) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <span className="inline-block h-10 w-10" aria-hidden />;

  const isDark = theme === "dark";
  const Icon = isDark ? Sun : Moon;
  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      className={`inline-flex h-10 items-center gap-2 rounded-lg text-sm font-medium text-slate-300 transition hover:bg-white/10 hover:text-white ${
        withLabel ? "w-full px-3" : "w-10 justify-center"
      }`}
    >
      <Icon aria-hidden className="h-[18px] w-[18px] shrink-0" />
      {withLabel && (isDark ? "Modo claro" : "Modo oscuro")}
    </button>
  );
}

/**
 * Armazón del panel: barra lateral azul noche en escritorio; en el celular,
 * barra superior y pestañas inferiores (al alcance del pulgar). La barra es
 * oscura en claro y en oscuro: es la seña de que esto es la plataforma.
 */
export function AdminShell({
  adminName,
  paymentsToReview,
  onSignOut,
  children,
}: Readonly<{
  adminName: string | null;
  /** Para el contador junto a "Pagos". */
  paymentsToReview?: number;
  onSignOut: () => void;
  children: ReactNode;
}>) {
  const pathname = usePathname();
  const review = paymentsToReview ?? 0;

  const badge = (item: NavItem) =>
    item.href === "/admin/pagos" && review > 0 ? (
      <span className="rounded-full bg-amber-400 px-1.5 py-0.5 text-[11px] font-bold leading-none text-amber-950">
        {review}
        <span className="sr-only"> por revisar</span>
      </span>
    ) : null;

  return (
    <div className="platform-admin min-h-dvh bg-ala-mist text-slate-900 dark:bg-ala-night dark:text-slate-100">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-blue-800"
      >
        Saltar al contenido
      </a>

      <aside className="admin-chrome fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-ala-night lg:flex dark:border-r dark:border-white/10 dark:bg-[#040818]">
        <div className="px-4 pb-4 pt-5">
          <Brand />
        </div>
        <nav aria-label="Secciones del panel" className="flex flex-1 flex-col gap-1 px-3">
          {NAV.map((item) => {
            const active = isActive(pathname, item);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition ${
                  active ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5 hover:text-white"
                }`}
              >
                {active && <span aria-hidden className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-ala-cyan" />}
                <Icon aria-hidden className={`h-[18px] w-[18px] shrink-0 ${active ? "text-ala-cyan" : ""}`} />
                <span className="flex-1">{item.label}</span>
                {badge(item)}
              </Link>
            );
          })}
        </nav>
        <div className="space-y-1 border-t border-white/10 p-3">
          <div className="flex items-center gap-2.5 px-3 py-2">
            <span
              aria-hidden
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white"
            >
              {initials(adminName)}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-white">{adminName ?? "Administrador"}</span>
              <span className="block text-xs text-slate-400">Dueño de la plataforma</span>
            </span>
          </div>
          <ThemeButton withLabel />
          <button
            type="button"
            onClick={onSignOut}
            className="inline-flex h-10 w-full items-center gap-2 rounded-lg px-3 text-sm font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
          >
            <LogOut aria-hidden className="h-[18px] w-[18px] shrink-0" />
            Cerrar sesión
          </button>
        </div>
      </aside>

      <header className="admin-chrome sticky top-0 z-30 flex h-14 items-center justify-between bg-ala-night px-4 lg:hidden dark:border-b dark:border-white/10 dark:bg-[#040818]">
        <Brand />
        <div className="flex items-center gap-1">
          <ThemeButton withLabel={false} />
          <button
            type="button"
            onClick={onSignOut}
            aria-label="Cerrar sesión"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-300 transition hover:bg-white/10 hover:text-white"
          >
            <LogOut aria-hidden className="h-[18px] w-[18px]" />
          </button>
        </div>
      </header>

      <div className="lg:pl-60">
        <main
          id="contenido"
          className="mx-auto w-full max-w-6xl px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-12 lg:pt-8"
        >
          {children}
        </main>
      </div>

      <nav
        aria-label="Secciones del panel"
        className="admin-chrome fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-white/10 bg-ala-night pb-[env(safe-area-inset-bottom)] lg:hidden dark:bg-[#040818]"
      >
        {NAV.map((item) => {
          const active = isActive(pathname, item);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`relative flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium transition ${
                active ? "text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              {active && <span aria-hidden className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-ala-cyan" />}
              <span className="relative">
                <Icon aria-hidden className={`h-5 w-5 ${active ? "text-ala-cyan" : ""}`} />
                <span className="absolute -right-3.5 -top-1.5">{badge(item)}</span>
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
