import Link from "next/link";
import { redirect } from "next/navigation";
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
  HandCoins,
  CreditCard,
  CheckCircle2,
  Circle,
  type LucideIcon,
} from "lucide-react";

import { db } from "~/server/db";
import { auth } from "~/server/auth";
import { loadActiveUser } from "~/server/auth/currentUser";
import { Landing } from "~/app/_components/landing/Landing";
import { LinkPending } from "~/app/_components/LinkPending";

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
  {
    href: "/fiados",
    label: "Fiados",
    description: "Clientes con deudas pendientes",
    icon: HandCoins,
    color: "amber",
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
  {
    href: "/suscripcion",
    label: "Suscripción",
    description: "Tu plan, pagos y consumo",
    icon: CreditCard,
    color: "violet",
  },
];

function NavSection({
  title,
  items,
  gridClass,
  iconSize = 20,
}: Readonly<{
  title: string;
  items: NavItem[];
  gridClass: string;
  iconSize?: number;
}>) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {title}
      </p>
      <div className={`grid gap-3 ${gridClass}`}>
        {items.map(({ href, label, description, icon: Icon, color }) => (
          <Link
            key={href}
            href={href}
            className={`flex items-start gap-3 rounded-xl border p-4 transition ${COLOR_MAP[color]}`}
          >
            <LinkPending>
              <Icon size={iconSize} className={`mt-0.5 shrink-0 ${ICON_COLOR_MAP[color]}`} />
            </LinkPending>
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
  );
}

type Step = { done: boolean; title: string; detail: string; href: string; cta: string; optional?: boolean };

/**
 * Guía del propietario nuevo: los pasos se marcan solos con los datos reales y la
 * tarjeta desaparece cuando ya hay productos y una primera venta.
 */
function FirstSteps({ steps }: Readonly<{ steps: Step[] }>) {
  const required = steps.filter((s) => !s.optional);
  const doneCount = required.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done);
  return (
    <section
      aria-labelledby="first-steps-title"
      className="rounded-2xl border border-violet-200 bg-white p-5 shadow-sm dark:border-violet-500/30 dark:bg-white/5"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="first-steps-title" className="font-semibold text-slate-800 dark:text-white">
          Primeros pasos
        </h2>
        <span className="text-sm tabular-nums text-slate-500 dark:text-slate-400">
          {doneCount} de {required.length}
        </span>
      </div>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10"
        role="progressbar"
        aria-label="Avance de los primeros pasos"
        aria-valuemin={0}
        aria-valuemax={required.length}
        aria-valuenow={doneCount}
      >
        <div className="h-full rounded-full bg-violet-600" style={{ width: `${(doneCount / required.length) * 100}%` }} />
      </div>
      <ol className="mt-4 space-y-2">
        {steps.map((s) => (
          <li key={s.href} className="flex items-start gap-3">
            {s.done ? (
              <CheckCircle2 aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <Circle aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-slate-300 dark:text-slate-600" />
            )}
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-medium ${s.done ? "text-slate-500 line-through dark:text-slate-400" : "text-slate-800 dark:text-slate-100"}`}>
                {s.title}
                {s.optional && <span className="ml-1 font-normal text-slate-500 dark:text-slate-400">(opcional)</span>}
                <span className="sr-only">{s.done ? " — hecho" : " — pendiente"}</span>
              </p>
              {!s.done && <p className="text-xs text-slate-500 dark:text-slate-400">{s.detail}</p>}
            </div>
            {!s.done && s === next && (
              <Link
                href={s.href}
                className="inline-flex min-h-10 shrink-0 items-center rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-700"
              >
                {s.cta}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Para todos: si la caja está abierta o cerrada, y el acceso directo a lo que sigue. */
function CashStatus({ open }: Readonly<{ open: boolean }>) {
  return (
    <div
      className={`flex flex-col gap-3 rounded-2xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
        open
          ? "border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-900/10"
          : "border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-900/10"
      }`}
    >
      <p className={`text-sm font-medium ${open ? "text-emerald-800 dark:text-emerald-200" : "text-amber-800 dark:text-amber-200"}`}>
        {open ? "La caja está abierta." : "La caja está cerrada: ábrela para empezar a vender."}
      </p>
      <Link
        href={open ? "/ventas" : "/caja"}
        className={`inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl px-5 text-sm font-semibold text-white ${
          open ? "bg-violet-600 hover:bg-violet-700" : "bg-amber-600 hover:bg-amber-700"
        }`}
      >
        {open ? "Vender" : "Abrir caja"}
      </Link>
    </div>
  );
}

export default async function Home() {
  // Página pública: sin sesión válida se muestra la landing de marca.
  const user = await loadActiveUser(await auth());
  if (!user) return <Landing />;
  if (user.mustChangePassword) redirect("/auth/cambiar-contrasena");
  // El administrador de la plataforma tiene su propio panel (el login envía a "/").
  if (user.role === "SUPERADMIN") redirect("/admin");

  const businessId = user.businessId;
  const isOwner = user.role === "OWNER";
  // Solo lecturas: alimentan la guía de primeros pasos y el estado de la caja.
  const [business, openRegister, productCount, firstSale, cashierCount] = businessId
    ? await Promise.all([
        db.business.findUnique({ where: { id: businessId }, select: { name: true } }),
        db.cashRegister.findFirst({ where: { businessId, status: "OPEN" }, select: { id: true } }),
        isOwner ? db.product.count({ where: { businessId, isActive: true } }) : Promise.resolve(1),
        isOwner ? db.sale.findFirst({ where: { businessId }, select: { id: true } }) : Promise.resolve({ id: "" }),
        isOwner ? db.user.count({ where: { businessId, role: "CASHIER" } }) : Promise.resolve(1),
      ])
    : [null, null, 0, null, 0];

  const showFirstSteps = isOwner && (productCount === 0 || !firstSale);
  const steps: Step[] = [
    { done: productCount > 0, title: "Agrega tus productos", detail: "Con nombre y precio basta para empezar.", href: "/productos", cta: "Agregar" },
    { done: !!openRegister || !!firstSale, title: "Abre la caja", detail: "Indica con cuánto efectivo empiezas el día.", href: "/caja", cta: "Abrir caja" },
    { done: !!firstSale, title: "Haz tu primera venta", detail: "Toca los productos y confirma la venta.", href: "/ventas", cta: "Vender" },
    { done: cashierCount > 0, title: "Invita a un cajero", detail: "Dale su propio acceso para vender.", href: "/empleados", cta: "Invitar", optional: true },
  ];

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-100 to-white px-4 py-8 text-slate-900 dark:from-slate-950 dark:to-slate-900 dark:text-white">
      <div className="mx-auto max-w-2xl space-y-6">
        <>
          {/* Info de sesión */}
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-white/10 dark:bg-white/5">
            {business?.name && (
              <p className="mb-0.5 text-xs font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400">
                {business.name}
              </p>
            )}
            <h1 className="text-sm font-semibold text-slate-800 dark:text-white">
              {user.name ?? user.email}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {user.role === "OWNER" ? "Propietario" : "Cajero"}
            </p>
          </div>

          {showFirstSteps ? <FirstSteps steps={steps} /> : businessId && <CashStatus open={!!openRegister} />}

          {/* Operaciones comunes */}
          <NavSection title="Operaciones" items={COMMON_ITEMS} gridClass="grid-cols-1 sm:grid-cols-3" iconSize={22} />

          {/* Gestión — solo CASHIER */}
          {user.role === "CASHIER" && (
            <NavSection title="Gestión" items={CASHIER_ITEMS} gridClass="grid-cols-1 sm:grid-cols-2" />
          )}

          {/* Administración — solo OWNER */}
          {user.role === "OWNER" && (
            <NavSection
              title="Administración"
              items={OWNER_ITEMS}
              gridClass="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
            />
          )}
        </>
      </div>
    </main>
  );
}
