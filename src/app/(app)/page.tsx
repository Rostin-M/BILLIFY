import Link from "next/link";
import {
  ShoppingCart,
  UtensilsCrossed,
  Wallet,
  Package,
  LayoutDashboard,
  Tag,
  Users,
  ClipboardList,
  UserCog,
  Settings,
  type LucideIcon,
} from "lucide-react";

import { db } from "~/server/db";
import { auth } from "~/server/auth";

type NavItem = {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  color: "violet" | "slate" | "emerald" | "amber" | "sky" | "rose";
};

const COLOR_MAP: Record<NavItem["color"], string> = {
  violet: "border-violet-200 bg-violet-50 hover:bg-violet-100 dark:border-violet-500/30 dark:bg-violet-900/20 dark:hover:bg-violet-900/30",
  emerald: "border-emerald-200 bg-emerald-50 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-900/20 dark:hover:bg-emerald-900/30",
  slate: "border-slate-200 bg-slate-50 hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10",
  amber: "border-amber-200 bg-amber-50 hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-900/20 dark:hover:bg-amber-900/30",
  sky: "border-sky-200 bg-sky-50 hover:bg-sky-100 dark:border-sky-500/30 dark:bg-sky-900/20 dark:hover:bg-sky-900/30",
  rose: "border-rose-200 bg-rose-50 hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-900/20 dark:hover:bg-rose-900/30",
};

const ICON_COLOR_MAP: Record<NavItem["color"], string> = {
  violet: "text-violet-600 dark:text-violet-400",
  emerald: "text-emerald-600 dark:text-emerald-400",
  slate: "text-slate-600 dark:text-slate-300",
  amber: "text-amber-600 dark:text-amber-400",
  sky: "text-sky-600 dark:text-sky-400",
  rose: "text-rose-600 dark:text-rose-400",
};

const COMMON_ITEMS: NavItem[] = [
  {
    href: "/ventas",
    label: "Punto de venta",
    description: "Registrar ventas rápidas y facturas",
    icon: ShoppingCart,
    color: "violet",
  },
  {
    href: "/mesas",
    label: "Mesas",
    description: "Consumo en sitio por mesa y cliente",
    icon: UtensilsCrossed,
    color: "amber",
  },
  {
    href: "/caja",
    label: "Caja",
    description: "Apertura, cierre y movimientos de caja",
    icon: Wallet,
    color: "emerald",
  },
  {
    href: "/inventario",
    label: "Inventario",
    description: "Ver existencias y estado del stock",
    icon: Package,
    color: "sky",
  },
];

const CASHIER_ITEMS: NavItem[] = [
  {
    href: "/productos",
    label: "Catálogo",
    description: "Consultar productos, actualizar precios y stock",
    icon: Tag,
    color: "slate",
  },
];

const OWNER_ITEMS: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    description: "Resumen de ventas e indicadores",
    icon: LayoutDashboard,
    color: "amber",
  },
  {
    href: "/productos",
    label: "Catálogo",
    description: "Gestionar productos y precios",
    icon: Tag,
    color: "slate",
  },
  {
    href: "/clientes",
    label: "Clientes",
    description: "Registros e historial de clientes",
    icon: Users,
    color: "sky",
  },
  {
    href: "/trazabilidad",
    label: "Trazabilidad",
    description: "Exportar datos y auditoría",
    icon: ClipboardList,
    color: "slate",
  },
  {
    href: "/empleados",
    label: "Empleados",
    description: "Gestionar cuentas del equipo",
    icon: UserCog,
    color: "slate",
  },
  {
    href: "/configuracion",
    label: "Configuración",
    description: "Datos del negocio, impuestos y más",
    icon: Settings,
    color: "rose",
  },
];

export default async function Home() {
  const session = await auth();

  const business = session?.user?.businessId
    ? await db.business.findUnique({
        where: { id: session.user.businessId },
        select: { name: true },
      })
    : null;

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-100 to-white px-4 py-8 text-slate-900 dark:from-slate-950 dark:to-slate-900 dark:text-white">
      <div className="mx-auto max-w-2xl space-y-6">
        {session?.user ? (
          <>
            {/* Info de sesión */}
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-white/10 dark:bg-white/5">
              {business?.name && (
                <p className="mb-0.5 text-xs font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400">
                  {business.name}
                </p>
              )}
              <p className="text-sm font-semibold text-slate-800 dark:text-white">
                {session.user.name ?? session.user.email}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {session.user.role === "OWNER" ? "Propietario" : "Cajero"}
              </p>
            </div>

            {/* Operaciones comunes */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Operaciones
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {COMMON_ITEMS.map(({ href, label, description, icon: Icon, color }) => (
                  <Link
                    key={href}
                    href={href}
                    className={`flex items-start gap-3 rounded-xl border p-4 transition ${COLOR_MAP[color]}`}
                  >
                    <Icon size={22} className={`mt-0.5 shrink-0 ${ICON_COLOR_MAP[color]}`} />
                    <div>
                      <p className="font-semibold text-slate-800 dark:text-white">{label}</p>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {description}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            {/* Gestión — solo CASHIER */}
            {session.user.role === "CASHIER" && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Gestión
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {CASHIER_ITEMS.map(({ href, label, description, icon: Icon, color }) => (
                    <Link
                      key={href}
                      href={href}
                      className={`flex items-start gap-3 rounded-xl border p-4 transition ${COLOR_MAP[color]}`}
                    >
                      <Icon size={20} className={`mt-0.5 shrink-0 ${ICON_COLOR_MAP[color]}`} />
                      <div>
                        <p className="font-semibold text-slate-800 dark:text-white">{label}</p>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                          {description}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Administración — solo OWNER */}
            {session.user.role === "OWNER" && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Administración
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {OWNER_ITEMS.map(({ href, label, description, icon: Icon, color }) => (
                    <Link
                      key={href}
                      href={href}
                      className={`flex items-start gap-3 rounded-xl border p-4 transition ${COLOR_MAP[color]}`}
                    >
                      <Icon size={20} className={`mt-0.5 shrink-0 ${ICON_COLOR_MAP[color]}`} />
                      <div>
                        <p className="font-semibold text-slate-800 dark:text-white">{label}</p>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                          {description}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center gap-6 pt-16 text-center">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-slate-800 dark:text-white">
                Bienvenido a BILLIFY
              </h1>
              <p className="mt-2 text-slate-500 dark:text-slate-400">
                Punto de venta y facturación para tu negocio
              </p>
            </div>
            <div className="flex w-full max-w-xs flex-col gap-3">
              <Link
                href="/auth/login"
                className="rounded-lg bg-violet-600 px-4 py-3 text-center font-semibold text-white transition hover:bg-violet-500"
              >
                Iniciar sesión
              </Link>
              <Link
                href="/auth/register"
                className="rounded-lg border border-slate-300 px-4 py-3 text-center font-medium text-slate-600 transition hover:bg-slate-100 dark:border-white/20 dark:text-slate-300 dark:hover:bg-white/10"
              >
                Registrar negocio
              </Link>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
