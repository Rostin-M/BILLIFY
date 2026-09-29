import {
  ClipboardList,
  HandCoins,
  Package,
  ShoppingCart,
  UserCog,
  UtensilsCrossed,
  Wallet,
  type LucideIcon,
} from "lucide-react";

type FeatureGroup = {
  name: string;
  summary: string;
  icon: LucideIcon;
  items: string[];
  /** Ocupa dos columnas en PC (grupos con más funciones). */
  wide?: boolean;
};

const GROUPS: FeatureGroup[] = [
  {
    name: "Venta",
    summary: "Cobra rápido en la caja, con o sin factura.",
    icon: ShoppingCart,
    wide: true,
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
    wide: true,
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
    items: [
      "Roles de propietario y cajero",
      "Permisos para manejar caja o cambiar precios",
      "Activa o desactiva accesos al instante",
    ],
  },
];

export function Features() {
  return (
    <section
      id="funciones"
      aria-labelledby="funciones-title"
      className="py-20 lg:py-28"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <h2
          id="funciones-title"
          className="max-w-2xl text-3xl leading-tight font-extrabold tracking-[-0.025em] text-slate-950 sm:text-[2.5rem] dark:text-white"
        >
          Todo lo del mostrador, en una sola app.
        </h2>
        <p className="mt-4 max-w-xl text-lg leading-relaxed text-slate-600 dark:text-slate-300">
          Desde el primer tinto de la mañana hasta el cierre de caja.
        </p>

        <div className="mt-14 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {GROUPS.map(({ name, summary, icon: Icon, items, wide }) => (
            <article
              key={name}
              className={`border-t-2 border-slate-200 pt-6 dark:border-white/10 ${wide ? "lg:col-span-2" : ""}`}
            >
              <div className="flex items-center gap-3">
                <span className="from-ala-violet via-ala-blue to-ala-cyan inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white">
                  <Icon aria-hidden="true" className="h-5 w-5" />
                </span>
                <h3 className="text-xl font-bold tracking-tight text-slate-950 dark:text-white">
                  {name}
                </h3>
              </div>
              <p className="mt-3 text-[15px] font-medium text-slate-700 dark:text-slate-200">
                {summary}
              </p>
              <ul
                className={`mt-4 grid gap-x-8 gap-y-2 text-[15px] text-slate-600 dark:text-slate-400 ${wide ? "lg:grid-cols-2" : ""}`}
              >
                {items.map((item) => (
                  <li key={item} className="flex gap-2.5">
                    <span
                      aria-hidden="true"
                      className="bg-ala-blue/60 mt-[0.6rem] h-1 w-2.5 shrink-0 rounded-full dark:bg-cyan-300/60"
                    />
                    {item}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        <p className="bg-ala-mist mt-16 max-w-3xl rounded-2xl px-6 py-5 text-[15px] leading-relaxed text-slate-700 dark:bg-white/5 dark:text-slate-300">
          <span className="font-semibold text-slate-950 dark:text-white">
            Y además:
          </span>{" "}
          se instala en el celular como una app (sin pasar por la tienda), tiene
          modo claro y oscuro, y los datos de cada negocio están separados de
          los demás.
        </p>
      </div>
    </section>
  );
}
