import {
  LayoutDashboard,
  ShoppingCart,
  UtensilsCrossed,
  Wallet,
  Package,
  Tag,
  Users,
  ClipboardList,
  UserCog,
  Settings,
  HandCoins,
  CreditCard,
  type LucideIcon,
} from "lucide-react";

export type UserRole = "OWNER" | "CASHIER";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  color: "violet" | "emerald" | "amber" | "sky" | "rose" | "slate";
  roles: UserRole[] | "all";
};

export const ITEM_ACTIVE_CLASSES: Record<NavItem["color"], string> = {
  violet: "bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  emerald: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  amber: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  sky: "bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
  rose: "bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
  slate: "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200",
};

export const ITEM_ICON_CLASSES: Record<NavItem["color"], string> = {
  violet: "text-violet-600 dark:text-violet-400",
  emerald: "text-emerald-600 dark:text-emerald-400",
  amber: "text-amber-600 dark:text-amber-400",
  sky: "text-sky-600 dark:text-sky-400",
  rose: "text-rose-600 dark:text-rose-400",
  slate: "text-slate-500 dark:text-slate-400",
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/ventas", label: "Punto de venta", icon: ShoppingCart, color: "violet", roles: "all" },
  { href: "/mesas", label: "Mesas", icon: UtensilsCrossed, color: "amber", roles: "all" },
  { href: "/caja", label: "Caja", icon: Wallet, color: "emerald", roles: "all" },
  { href: "/inventario", label: "Inventario", icon: Package, color: "sky", roles: "all" },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, color: "amber", roles: ["OWNER"] },
  { href: "/productos", label: "Catálogo", icon: Tag, color: "slate", roles: "all" },
  { href: "/clientes", label: "Clientes", icon: Users, color: "sky", roles: ["OWNER"] },
  { href: "/fiados", label: "Fiados", icon: HandCoins, color: "amber", roles: "all" },
  { href: "/trazabilidad", label: "Trazabilidad", icon: ClipboardList, color: "slate", roles: ["OWNER"] },
  { href: "/empleados", label: "Empleados", icon: UserCog, color: "slate", roles: ["OWNER"] },
  { href: "/configuracion", label: "Configuración", icon: Settings, color: "rose", roles: ["OWNER"] },
  { href: "/suscripcion", label: "Suscripción", icon: CreditCard, color: "violet", roles: ["OWNER"] },
];

export function getNavItemsForRole(role: UserRole): NavItem[] {
  return NAV_ITEMS.filter(
    (item) => item.roles === "all" || item.roles.includes(role),
  );
}

// Bottom nav: 4 items prioritized per role + Inicio fijo
export function getBottomNavItems(role: UserRole): NavItem[] {
  const hrefs =
    role === "OWNER"
      ? ["/dashboard", "/ventas", "/mesas", "/caja"]
      : ["/ventas", "/mesas", "/caja", "/inventario"];
  return NAV_ITEMS.filter((i) => hrefs.includes(i.href));
}
