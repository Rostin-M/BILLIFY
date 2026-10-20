import {
  ClipboardList,
  HandCoins,
  MonitorSmartphone,
  Moon,
  Package,
  ShieldCheck,
  ShoppingCart,
  UserCog,
  UtensilsCrossed,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { Facets } from "./Facets";
import { cssVars } from "./style";

/**
 * Funciones en cuadrícula "bento": cada grupo trae una mini pantalla de la app
 * (decorativa, aria-hidden) y su lista real de funciones.
 */

type FeatureGroup = {
  name: string;
  summary: string;
  icon: LucideIcon;
  items: string[];
  /** Columnas que ocupa en PC (de 6). */
  span: string;
  visual: ReactNode;
};

/* ── Mini pantallas ─────────────────────────────────────────────────────── */

const PRODUCTS = [
  ["Tinto", "2.000"],
  ["Capuchino", "4.500"],
  ["Pandebono", "2.650"],
  ["Empanada", "3.000"],
  ["Jugo de mora", "5.500"],
  ["Buñuelo", "2.500"],
] as const;

function SaleVisual() {
  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
      <ul className="grid grid-cols-3 gap-2">
        {PRODUCTS.map(([name, price], i) => (
          <li
            key={name}
            className={`rounded-xl border px-2.5 py-2 ${i === 1 ? "tap-pulse border-ala-cyan/60 bg-ala-cyan/10" : "border-white/10 bg-white/[0.04]"}`}
          >
            <p className="truncate text-xs font-semibold text-white">{name}</p>
            <p className="text-[11px] text-slate-400 tabular-nums">$ {price}</p>
          </li>
        ))}
      </ul>
      <div className="relative hidden overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] p-3 sm:block">
        <div className="flex h-full items-end justify-center gap-[3px] pb-1">
          {[3, 1, 2, 1, 3, 2, 1, 1, 3, 1, 2, 3, 1, 2, 1, 3].map((w, i) => (
            <span key={i} className="h-16 bg-white/80" style={{ width: w }} />
          ))}
        </div>
        <span className="scan-line bg-ala-pen absolute inset-x-2 h-0.5 shadow-[0_0_12px_2px] shadow-rose-500/70" />
      </div>
    </div>
  );
}

function TablesVisual() {
  const tables = [
    [1, "free"],
    [2, "busy"],
    [3, "busy"],
    [4, "paying"],
    [5, "free"],
    [6, "busy"],
  ] as const;
  const style = {
    free: "border-white/15 text-slate-400",
    busy: "border-ala-violet bg-ala-violet/25 text-white",
    paying: "border-ala-cyan bg-ala-cyan/20 text-white",
  };
  return (
    <ul className="grid grid-cols-3 gap-2">
      {tables.map(([n, state]) => (
        <li
          key={n}
          className={`relative flex aspect-square items-center justify-center rounded-2xl border text-sm font-bold ${style[state]}`}
        >
          {n}
          {state === "paying" && (
            <span className="blink-dot bg-ala-cyan absolute top-2 right-2 h-1.5 w-1.5 rounded-full" />
          )}
        </li>
      ))}
    </ul>
  );
}

function CashVisual() {
  return (
    <dl className="space-y-1.5 rounded-xl border border-white/10 bg-white/[0.04] p-3 text-sm">
      <div className="flex justify-between text-slate-400">
        <dt>Esperado</dt>
        <dd className="tabular-nums">$ 1.284.500</dd>
      </div>
      <div className="flex justify-between text-slate-300">
        <dt>Contado</dt>
        <dd className="tabular-nums" data-count="1284500" data-prefix="$ ">
          $ 1.284.500
        </dd>
      </div>
      <div className="flex justify-between border-t border-white/10 pt-1.5 font-semibold text-emerald-400">
        <dt>Diferencia</dt>
        <dd className="tabular-nums">$ 0</dd>
      </div>
    </dl>
  );
}

function CreditVisual() {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold text-white">Don Jairo</span>
        <span className="text-slate-400 tabular-nums">debe $ 25.000</span>
      </div>
      <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-white/10">
        <div className="grow-x from-ala-violet to-ala-cyan h-full w-[44%] rounded-full bg-gradient-to-r" />
      </div>
      <p className="mt-2 text-xs text-emerald-400">Abonó $ 20.000 hoy</p>
    </div>
  );
}

function StockVisual() {
  const stock = [
    ["Pandebono", 82, "bg-emerald-400"],
    ["Leche", 46, "bg-amber-400"],
    ["Almojábana", 9, "bg-rose-400"],
  ] as const;
  return (
    <ul className="space-y-2.5">
      {stock.map(([name, pct, color], i) => (
        <li key={name} className="text-xs">
          <div className="flex justify-between text-slate-300">
            <span>{name}</span>
            {pct < 15 && (
              <span className="font-semibold text-rose-400">Quedan 4</span>
            )}
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className={`grow-x h-full rounded-full ${color}`}
              style={{ width: `${pct}%`, ...cssVars({ "--i": i }) }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function ReportsVisual() {
  const week = [42, 58, 51, 66, 74, 95, 88];
  return (
    <div className="flex items-end gap-4">
      <div className="shrink-0">
        <p className="text-xs text-slate-400">Ventas de la semana</p>
        <p
          className="font-display text-2xl font-extrabold text-white tabular-nums"
          data-count="4870200"
          data-prefix="$ "
        >
          $ 4.870.200
        </p>
        <p className="text-xs text-emerald-400">Ticket promedio $ 13.400</p>
      </div>
      <div className="flex h-20 flex-1 items-end gap-1.5">
        {week.map((h, i) => (
          <span
            key={i}
            className={`grow-y flex-1 rounded-t-md ${i === 5 ? "from-ala-blue to-ala-cyan bg-gradient-to-t" : "bg-white/15"}`}
            style={{ height: `${h}%`, ...cssVars({ "--i": i }) }}
          />
        ))}
      </div>
    </div>
  );
}

function TeamVisual() {
  const people = [
    ["MR", "Marcela", "Propietaria", "from-ala-violet to-ala-blue"],
    ["JP", "Juan Pablo", "Cajero", "from-ala-blue to-ala-cyan"],
  ] as const;
  return (
    <ul className="space-y-2">
      {people.map(([initials, name, role, gradient]) => (
        <li
          key={name}
          className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2"
        >
          <span
            className={`inline-flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br text-xs font-bold text-white ${gradient}`}
          >
            {initials}
          </span>
          <span className="flex-1 text-sm font-semibold text-white">
            {name}
          </span>
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-slate-300">
            {role}
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ── Datos ──────────────────────────────────────────────────────────────── */

const GROUPS: FeatureGroup[] = [
  {
    name: "Venta",
    summary: "Cobra rápido en la caja, con o sin factura.",
    icon: ShoppingCart,
    span: "lg:col-span-4",
    visual: <SaleVisual />,
    items: [
      "Lo más vendido aparece primero",
      "Lector de código de barras con la cámara del celular",
      "Efectivo, tarjeta, transferencia o fiado",
      "Venta por peso y productos de precio abierto",
      "Factura en PDF y envío por correo al cliente",
      "Funciona sin internet y sincroniza sin duplicar",
    ],
  },
  {
    name: "Mesas",
    summary: "Cada comensal con su pedido.",
    icon: UtensilsCrossed,
    span: "lg:col-span-2",
    visual: <TablesVisual />,
    items: [
      "Pedidos por rondas y por persona",
      "Mueve pedidos entre comensales",
      "Cobro dividido, cada grupo con su forma de pago",
      "Cuenta de la mesa en PDF",
    ],
  },
  {
    name: "Caja",
    summary: "Turnos claros, cierres sin sorpresas.",
    icon: Wallet,
    span: "lg:col-span-2",
    visual: <CashVisual />,
    items: [
      "Apertura con saldo inicial",
      "Entradas y salidas de efectivo",
      "Cierre con diferencia y reporte en PDF",
    ],
  },
  {
    name: "Fiados",
    summary: "Quién te debe y cuánto, sin la libreta.",
    icon: HandCoins,
    span: "lg:col-span-2",
    visual: <CreditVisual />,
    items: [
      "Clientes con saldo pendiente",
      "Abonos protegidos contra duplicados",
      "Historial de compras y pagos",
    ],
  },
  {
    name: "Inventario",
    summary: "El stock se mueve con cada venta.",
    icon: Package,
    span: "lg:col-span-2",
    visual: <StockVisual />,
    items: [
      "Alerta de productos con poco stock",
      "Movimientos con motivo y nota",
      "Lotes y fechas de vencimiento",
    ],
  },
  {
    name: "Reportes y trazabilidad",
    summary: "Sabes cómo va el negocio y quién hizo qué.",
    icon: ClipboardList,
    span: "lg:col-span-4",
    visual: <ReportsVisual />,
    items: [
      "Ventas del día, la semana y el mes",
      "Ticket promedio y número de ventas",
      "Registro de ventas, anulaciones y movimientos de caja",
      "Exporta ventas y caja a Excel (CSV)",
    ],
  },
  {
    name: "Equipo",
    summary: "Tu gente entra con su propio usuario.",
    icon: UserCog,
    span: "sm:col-span-2 lg:col-span-2",
    visual: <TeamVisual />,
    items: [
      "Roles de propietario y cajero",
      "Permisos para manejar caja o cambiar precios",
      "Activa o desactiva accesos al instante",
    ],
  },
];

const EXTRAS = [
  {
    icon: MonitorSmartphone,
    text: "Se instala en el celular como una app, sin pasar por la tienda",
  },
  { icon: Moon, text: "Modo claro y oscuro" },
  {
    icon: ShieldCheck,
    text: "Los datos de cada negocio están separados de los demás",
  },
] as const;

export function Features() {
  return (
    <section
      id="funciones"
      aria-labelledby="funciones-title"
      className="bg-ala-night relative overflow-hidden py-20 text-white lg:py-28"
    >
      <div aria-hidden="true" className="aurora aurora-night">
        <span />
        <span />
        <span />
      </div>
      <div
        aria-hidden="true"
        className="dot-grid dot-grid-night pointer-events-none absolute inset-0"
      />
      <Facets className="pointer-events-none absolute -bottom-24 -left-32 h-[24rem] w-[40rem] rotate-180 [mask-image:linear-gradient(to_top_right,black_20%,transparent_70%)] opacity-20" />

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <h2
          id="funciones-title"
          className="font-display max-w-3xl text-4xl leading-[1.02] font-extrabold tracking-[-0.035em] sm:text-6xl"
        >
          Todo lo del mostrador,{" "}
          <span className="ala-gradient-text-night">en una sola app.</span>
        </h2>
        <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-300">
          Desde el primer tinto de la mañana hasta el cierre de caja.
        </p>

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
          {GROUPS.map(
            ({ name, summary, icon: Icon, items, span, visual }, i) => (
              <article
                key={name}
                data-reveal
                style={cssVars({ "--delay": `${(i % 3) * 90}ms` })}
                className={`spotlight flex flex-col rounded-3xl border border-white/10 bg-white/[0.035] p-6 backdrop-blur-sm ${span} ${span === "lg:col-span-4" ? "sm:col-span-2" : ""}`}
              >
                <div className="flex items-center gap-3">
                  <span className="from-ala-violet via-ala-blue to-ala-cyan shadow-ala-blue/30 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-lg">
                    <Icon aria-hidden="true" className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="font-display text-xl font-bold tracking-tight">
                      {name}
                    </h3>
                    <p className="text-sm text-slate-300">{summary}</p>
                  </div>
                </div>

                <div aria-hidden="true" className="mt-5">
                  {visual}
                </div>

                <ul
                  className={`mt-5 grid gap-x-6 gap-y-1.5 border-t border-white/10 pt-4 text-[14px] text-slate-300 ${span === "lg:col-span-4" ? "sm:grid-cols-2" : ""}`}
                >
                  {items.map((item) => (
                    <li key={item} className="flex gap-2.5">
                      <span
                        aria-hidden="true"
                        className="bg-ala-cyan/70 mt-[0.55rem] h-1 w-2.5 shrink-0 rounded-full"
                      />
                      {item}
                    </li>
                  ))}
                </ul>
              </article>
            ),
          )}
        </div>

        <ul className="mt-6 grid gap-3 md:grid-cols-3">
          {EXTRAS.map(({ icon: Icon, text }) => (
            <li
              key={text}
              className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-300"
            >
              <Icon
                aria-hidden="true"
                className="text-ala-cyan h-5 w-5 shrink-0"
              />
              {text}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
