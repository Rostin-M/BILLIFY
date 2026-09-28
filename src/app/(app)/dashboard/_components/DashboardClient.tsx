"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useState } from "react";
import { ArrowRight, Minus, ShoppingCart, TrendingDown, TrendingUp, Wallet, Package } from "lucide-react";
import { api, type RouterOutputs } from "~/trpc/react";
import { SkeletonKpiCard } from "~/app/_components/Skeletons";

type Period = "today" | "week" | "month";
type DashboardData = RouterOutputs["dashboard"]["summary"];

const PERIOD_LABELS: Record<Period, string> = {
  today: "Hoy",
  week: "Semana",
  month: "Mes",
};

const METHOD_LABELS: Record<string, string> = {
  CASH: "Efectivo",
  CARD: "Tarjeta",
  TRANSFER: "Transferencia",
  CREDIT: "Crédito",
};

const formatCOP = (v: number) =>
  v.toLocaleString("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0 });

const formatShortDate = (d: Date | string) =>
  new Date(d).toLocaleDateString("es-CO", { day: "numeric", month: "short" });

const formatBarLabel = (dateStr: string) =>
  new Date(dateStr + "T00:00:00").toLocaleDateString("es-CO", { weekday: "short", day: "numeric" });

type ChartBucket = { key: string; label: string; total: number; count: number };

/**
 * El período "mes" trae un total por día (~30 entradas) — mostrarlas todas
 * como barras se desborda o queda ilegible incluso con scroll. Se agrupan de
 * a 7 días (Semana 1, 2, 3…) para que el gráfico quede compacto y legible.
 */
function buildWeeklyBuckets(byDay: { date: string; total: number; count: number }[]): ChartBucket[] {
  const buckets: ChartBucket[] = [];
  for (let i = 0; i < byDay.length; i += 7) {
    const chunk = byDay.slice(i, i + 7);
    buckets.push({
      key: `week-${buckets.length + 1}`,
      label: `Semana ${buckets.length + 1}`,
      total: chunk.reduce((s, d) => s + d.total, 0),
      count: chunk.reduce((s, d) => s + d.count, 0),
    });
  }
  return buckets;
}

function buildChartData(data: DashboardData, period: Period): ChartBucket[] {
  if (period === "month") return buildWeeklyBuckets(data.sales.byDay);
  return data.sales.byDay.map((d) => ({ key: d.date, label: formatBarLabel(d.date), total: d.total, count: d.count }));
}

function computeTrend(current: number, prev: number): number | null {
  if (prev === 0) return null;
  return Math.round(((current - prev) / prev) * 100);
}

function pickBalanceValue(current: number | null, lastClosing: number | null): string {
  if (current !== null) return formatCOP(current);
  if (lastClosing !== null) return formatCOP(lastClosing);
  return "—";
}

function inventorySubLabel(outOfStock: number, lowStock: number): string {
  if (outOfStock > 0) return `${outOfStock} sin stock`;
  if (lowStock > 0) return `${lowStock} bajo stock`;
  return "Sin alertas";
}

function inventoryColor(outOfStock: number, lowStock: number): KpiColor {
  if (outOfStock > 0) return "red";
  if (lowStock > 0) return "amber";
  return "slate";
}

function expenseColor(manualExpense: number | null): KpiColor {
  return manualExpense !== null && manualExpense > 0 ? "red" : "slate";
}

function balanceColor(currentBalance: number | null): KpiColor {
  return currentBalance !== null && currentBalance > 0 ? "emerald" : "slate";
}

function dateRangeLabel(data: DashboardData, period: Period): string {
  if (period === "today") return formatShortDate(data.period.from);
  return `${formatShortDate(data.period.from)} – ${formatShortDate(data.period.to)}`;
}

function PeriodSelector({
  period,
  onChange,
  label,
}: Readonly<{ period: Period; onChange: (p: Period) => void; label: string | null }>) {
  return (
    <div className="space-y-1.5">
      <div className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm dark:border-white/10 dark:bg-white/5">
        {(["today", "week", "month"] as Period[]).map((p) => (
          <button
            key={p}
            onClick={() => onChange(p)}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${
              period === p
                ? "bg-violet-600 text-white shadow"
                : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </div>
      {label && (
        <p className="text-center text-xs text-slate-500 dark:text-slate-500">{label}</p>
      )}
    </div>
  );
}

function KpiCardsGrid({
  data,
  salesCountTrend,
  salesTotalTrend,
}: Readonly<{ data: DashboardData; salesCountTrend: number | null; salesTotalTrend: number | null }>) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <KpiCard
        label="Ventas"
        value={String(data.sales.count)}
        sub={`${data.sales.voided} anulada${data.sales.voided !== 1 ? "s" : ""}`}
        trend={salesCountTrend}
        color="violet"
        tooltip="Número de transacciones completadas en el período. No incluye ventas anuladas."
      />
      <KpiCard
        label="Ingresos"
        value={formatCOP(data.sales.total)}
        trend={salesTotalTrend}
        color="emerald"
        tooltip="Total cobrado en ventas completadas (efectivo, tarjeta, transferencia y crédito) en el período."
      />
      <KpiCard
        label="Gastos"
        value={data.cashRegister.manualExpense !== null ? formatCOP(data.cashRegister.manualExpense) : "—"}
        sub={data.cashRegister.isOpen ? "Salidas manuales de caja" : "Caja cerrada"}
        color={expenseColor(data.cashRegister.manualExpense)}
        tooltip="Dinero que has usado para pagar pedidos, proveedores u otros gastos. Se registra en Caja → Salida."
      />
      <KpiCard
        label="Balance"
        value={pickBalanceValue(data.cashRegister.currentBalance, data.cashRegister.lastClosingBalance)}
        sub={data.cashRegister.isOpen ? "Saldo actual en caja" : "Último cierre"}
        color={balanceColor(data.cashRegister.currentBalance)}
        tooltip="Fondo inicial + ventas en efectivo + entradas manuales − salidas manuales. Es el dinero físico disponible en caja."
      />
      <KpiCard
        label="Caja"
        value={data.cashRegister.isOpen ? "Abierta" : "Cerrada"}
        sub={
          data.cashRegister.lastClosedAt
            ? `Último cierre ${new Date(data.cashRegister.lastClosedAt).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}`
            : undefined
        }
        color={data.cashRegister.isOpen ? "emerald" : "slate"}
        tooltip="Estado de la caja registradora. Debe estar abierta para registrar ventas."
      />
      <KpiCard
        label="Inventario"
        value={String(data.inventory.totalActive)}
        sub={inventorySubLabel(data.inventory.outOfStock, data.inventory.lowStock)}
        color={inventoryColor(data.inventory.outOfStock, data.inventory.lowStock)}
        tooltip="Productos activos en catálogo. Se muestra alerta cuando alguno tiene stock bajo (≤5) o agotado."
      />
    </div>
  );
}

function QuickActionsRow({ data }: Readonly<{ data: DashboardData }>) {
  return (
    <div className="flex flex-wrap gap-2">
      <Link
        href="/ventas"
        className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-violet-500"
      >
        <ShoppingCart size={14} />
        Nueva venta
      </Link>
      {!data.cashRegister.isOpen && (
        <Link
          href="/caja"
          className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700 transition hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-900/10 dark:text-amber-300 dark:hover:bg-amber-900/20"
        >
          <Wallet size={14} />
          Abrir caja
        </Link>
      )}
      {data.inventory.outOfStock > 0 && (
        <Link
          href="/inventario"
          className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-100 dark:border-red-500/30 dark:bg-red-900/10 dark:text-red-400 dark:hover:bg-red-900/20"
        >
          <Package size={14} />
          {data.inventory.outOfStock} sin stock
        </Link>
      )}
    </div>
  );
}

function TodaySummaryCard({ data }: Readonly<{ data: DashboardData }>) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5">
      <p className="mb-1 text-sm font-medium text-slate-500 dark:text-slate-400">
        Resumen de hoy
      </p>
      {data.sales.count === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-500">Sin ventas registradas hoy</p>
      ) : (
        <div className="flex items-end gap-6">
          <div>
            <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
              {formatCOP(data.sales.total)}
            </p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {data.sales.count} venta{data.sales.count !== 1 ? "s" : ""}
              {data.sales.count > 0 && (
                <span className="ml-2 text-slate-500 dark:text-slate-500">
                  · Promedio {formatCOP(data.sales.total / data.sales.count)}
                </span>
              )}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function chartBarColorClass(hasData: boolean, isLatest: boolean): string {
  if (!hasData) return "bg-slate-100 dark:bg-white/5";
  if (isLatest) return "bg-violet-600 dark:bg-violet-500";
  return "bg-violet-400 dark:bg-violet-600";
}

function SalesBarChart({
  period,
  chartData,
  maxDayTotal,
  chartAnimated,
  totalSales,
}: Readonly<{ period: Period; chartData: ChartBucket[]; maxDayTotal: number; chartAnimated: boolean; totalSales: number }>) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold text-slate-700 dark:text-slate-200">
          {period === "month" ? "Ventas por semana" : "Ventas por día"}
        </h2>
        <span className="text-xs text-slate-500 dark:text-slate-500">
          Total: {formatCOP(totalSales)}
        </span>
      </div>

      <div className="flex gap-2">
        {/* Eje Y */}
        <div className="flex w-14 shrink-0 flex-col justify-between pb-5 text-right">
          <span className="text-[9px] text-slate-500">{formatCOP(maxDayTotal)}</span>
          <span className="text-[9px] text-slate-500">{formatCOP(maxDayTotal / 2)}</span>
          <span className="text-[9px] text-slate-500">$0</span>
        </div>

        {/* Barras */}
        <div className="relative min-w-0 flex-1">
          {/* Líneas de referencia */}
          <div className="pointer-events-none absolute inset-0 flex flex-col justify-between pb-5">
            <div className="h-px w-full border-t border-dashed border-slate-100 dark:border-white/5" />
            <div className="h-px w-full border-t border-dashed border-slate-100 dark:border-white/5" />
            <div className="h-px w-full border-t border-slate-200 dark:border-white/10" />
          </div>

          <div className="flex h-[130px] items-end gap-1">
            {chartData.map((bucket, index) => {
              const heightPct = maxDayTotal > 0 ? (bucket.total / maxDayTotal) * 100 : 0;
              const hasData = bucket.total > 0;
              const isLatest = index === chartData.length - 1;
              const minHeightPct = hasData ? 3 : 2;
              const barHeight = chartAnimated ? `${Math.max(heightPct, minHeightPct)}%` : "0%";
              return (
                <div key={bucket.key} className="group relative flex flex-1 flex-col items-center gap-1">
                  {/* Tooltip */}
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden min-w-max -translate-x-1/2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-lg group-hover:block dark:border-white/10 dark:bg-slate-800">
                    <p className="font-semibold text-slate-700 dark:text-white">{formatCOP(bucket.total)}</p>
                    <p className="text-slate-500">{bucket.count} venta{bucket.count !== 1 ? "s" : ""}</p>
                  </div>
                  {/* Barra */}
                  <div className="flex w-full flex-1 items-end">
                    <div
                      className={`w-full rounded-t-md ${chartBarColorClass(hasData, isLatest)}`}
                      style={{
                        height: barHeight,
                        transition: "height 0.55s cubic-bezier(0.4, 0, 0.2, 1)",
                        transitionDelay: `${index * 35}ms`,
                      }}
                    />
                  </div>
                  {/* Etiqueta */}
                  <span className="truncate text-[9px] text-slate-500 dark:text-slate-500">
                    {bucket.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function PaymentMethodBreakdown({ data }: Readonly<{ data: DashboardData }>) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5">
      <h2 className="mb-4 font-semibold text-slate-700 dark:text-slate-200">
        Por método de pago
      </h2>
      {data.sales.total === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-500">Sin ventas en el período</p>
      ) : (
        <div className="space-y-3">
          {Object.entries(data.sales.byMethod)
            .filter(([, v]) => v > 0)
            .sort(([, a], [, b]) => b - a)
            .map(([method, total]) => {
              const pct = data.sales.total > 0 ? Math.round((total / data.sales.total) * 100) : 0;
              return (
                <div key={method}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="text-slate-600 dark:text-slate-300">
                      {METHOD_LABELS[method] ?? method}
                    </span>
                    <span className="font-semibold text-slate-800 dark:text-white">
                      <span className="mr-1.5 text-xs font-normal text-slate-500">{pct}%</span>
                      {formatCOP(total)}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                    <div
                      className="h-full rounded-full bg-violet-500 dark:bg-violet-600 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}

function TopProductsList({ topProducts }: Readonly<{ topProducts: DashboardData["topProducts"] }>) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5">
      <h2 className="mb-4 font-semibold text-slate-700 dark:text-slate-200">
        Top 20 productos más vendidos
      </h2>
      {topProducts.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-500">Sin ventas en el período</p>
      ) : (
        <ul className="max-h-96 space-y-2 overflow-y-auto pr-1">
          {topProducts.map((p, i) => (
            <li key={p.name} className="flex items-center gap-3">
              <span className="w-5 shrink-0 text-center text-xs font-bold text-slate-500">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">
                  {p.name}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-500">
                  {p.quantitySold} unidad{p.quantitySold !== 1 ? "es" : ""}
                </p>
              </div>
              <span className="shrink-0 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                {formatCOP(p.revenue)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function InventoryAlerts({ inventory }: Readonly<{ inventory: DashboardData["inventory"] }>) {
  if (inventory.lowStock === 0 && inventory.outOfStock === 0) return null;
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-900/10">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
          Alertas de inventario
        </p>
        <Link
          href="/inventario"
          className="inline-flex items-center gap-0.5 text-xs font-medium text-amber-700 underline underline-offset-2 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-200"
        >
          Ver inventario <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      {inventory.outOfStock > 0 && (
        <div className="mb-2">
          <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
            Sin stock ({inventory.outOfStock}):
          </p>
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {inventory.outOfStockNames.map((name) => (
              <li
                key={name}
                className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700 dark:bg-red-900/30 dark:text-red-400"
              >
                {name}
              </li>
            ))}
          </ul>
        </div>
      )}
      {inventory.lowStock > 0 && (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          {inventory.lowStock} producto{inventory.lowStock !== 1 ? "s" : ""} con stock bajo (≤5)
        </p>
      )}
    </div>
  );
}

export function DashboardClient() {
  const [period, setPeriod] = useState<Period>("today");
  const [chartAnimated, setChartAnimated] = useState(false);

  const { data, isPending } = api.dashboard.summary.useQuery(
    { period },
    { refetchInterval: 60_000 },
  );

  useEffect(() => {
    if (!data) { setChartAnimated(false); return; }
    const t = setTimeout(() => setChartAnimated(true), 50);
    return () => clearTimeout(t);
  }, [data]);

  const chartData: ChartBucket[] = data ? buildChartData(data, period) : [];
  const maxDayTotal = Math.max(...chartData.map((d) => d.total), 1);
  const showBarChart = chartData.length > 1;

  const salesCountTrend = data ? computeTrend(data.sales.count, data.comparison.sales.count) : null;
  const salesTotalTrend = data ? computeTrend(data.sales.total, data.comparison.sales.total) : null;

  return (
    <div className="space-y-5">
      <PeriodSelector period={period} onChange={setPeriod} label={data ? dateRangeLabel(data, period) : null} />

      {isPending && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonKpiCard key={i} />
          ))}
        </div>
      )}

      {data && (
        <>
          <KpiCardsGrid data={data} salesCountTrend={salesCountTrend} salesTotalTrend={salesTotalTrend} />
          <QuickActionsRow data={data} />
          {period === "today" && <TodaySummaryCard data={data} />}
          {showBarChart && (
            <SalesBarChart
              period={period}
              chartData={chartData}
              maxDayTotal={maxDayTotal}
              chartAnimated={chartAnimated}
              totalSales={data.sales.total}
            />
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <PaymentMethodBreakdown data={data} />
            <TopProductsList topProducts={data.topProducts} />
          </div>

          <InventoryAlerts inventory={data.inventory} />
        </>
      )}
    </div>
  );
}

type KpiColor = "violet" | "emerald" | "slate" | "red" | "amber";

function TrendPill({ value }: Readonly<{ value: number }>) {
  const isPositive = value > 0;
  const isNeutral = value === 0;
  let icon: ReactNode;
  let colorClass: string;
  if (isNeutral) {
    icon = <Minus className="h-3 w-3" />;
    colorClass = "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-400";
  } else if (isPositive) {
    icon = <TrendingUp className="h-3 w-3" />;
    colorClass = "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400";
  } else {
    icon = <TrendingDown className="h-3 w-3" />;
    colorClass = "bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400";
  }
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${colorClass}`}
    >
      {icon} {Math.abs(value)}%
    </span>
  );
}

function KpiCard({
  label,
  value,
  sub,
  trend,
  color,
  tooltip,
}: Readonly<{
  label: string;
  value: string;
  sub?: string;
  trend?: number | null;
  color: KpiColor;
  tooltip?: string;
}>) {
  const colorMap: Record<KpiColor, string> = {
    violet: "text-violet-600 dark:text-violet-400",
    emerald: "text-emerald-600 dark:text-emerald-400",
    slate: "text-slate-700 dark:text-slate-200",
    red: "text-red-600 dark:text-red-400",
    amber: "text-amber-600 dark:text-amber-400",
  };

  return (
    <div className="group relative rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/5">
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`mt-1 truncate text-lg font-bold ${colorMap[color]}`}>{value}</p>
      {trend != null && <TrendPill value={trend} />}
      {sub && <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-500">{sub}</p>}
      {tooltip && (
        <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden w-56 max-w-[80vw] -translate-x-1/2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 shadow-lg group-hover:block dark:border-white/10 dark:bg-slate-800 dark:text-slate-300">
          {tooltip}
        </div>
      )}
    </div>
  );
}
