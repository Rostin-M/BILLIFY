"use client";

import type { RouterOutputs } from "~/trpc/react";

const REASON_LABELS: Record<string, string> = {
  MANUAL_ADJUSTMENT: "Ajuste manual",
  SALE: "Venta",
  RETURN: "Devolución",
  CORRECTION: "Corrección",
  IMPORT: "Importación",
  PURCHASE: "Compra a proveedor",
  TABLE_ORDER: "Pedido en mesa",
  TABLE_ORDER_CANCEL: "Pedido de mesa cancelado",
};

type MovementsQuery = { isLoading: boolean; isError: boolean; data: RouterOutputs["product"]["listMovements"] | undefined };
type SalesQuery = { isLoading: boolean; isError: boolean; data: RouterOutputs["product"]["listProductSales"] | undefined };

function MovementsHistory({ movementsQuery }: Readonly<{ movementsQuery: MovementsQuery }>) {
  if (!movementsQuery.data || movementsQuery.data.length === 0) {
    return <p className="text-xs text-slate-500 dark:text-slate-400">Sin movimientos registrados todavía.</p>;
  }
  return (
    <ul className="space-y-0.5">
      {movementsQuery.data.slice(0, 10).map((m, i) => (
        <li
          key={m.id}
          className={`flex items-start justify-between gap-4 rounded px-2 py-1.5 text-xs ${
            i % 2 === 0 ? "bg-slate-50 dark:bg-white/5" : "bg-white dark:bg-transparent"
          }`}
        >
          <div className="min-w-0">
            <span
              className={`font-medium tabular-nums ${
                m.quantity > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
              }`}
            >
              {m.quantity > 0 ? "+" : ""}
              {m.quantity}
            </span>
            <span className="ml-2 text-slate-500 dark:text-slate-400">
              {REASON_LABELS[m.reason] ?? m.reason}
            </span>
            {m.note && (
              <span className="ml-1 text-slate-500 dark:text-slate-400">
                — {m.note}
              </span>
            )}
            <span className="ml-2 text-slate-500 dark:text-slate-400">
              por {m.user.name ?? "sistema"}
            </span>
          </div>
          <div className="shrink-0 text-right text-slate-500 dark:text-slate-400">
            <p>Stock: {m.stockAfter}</p>
            <p>{new Date(m.createdAt).toLocaleDateString("es-CO", { timeZone: "America/Bogota" })}</p>
            <p>
              {new Date(m.createdAt).toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function SalesHistoryList({ salesQuery }: Readonly<{ salesQuery: SalesQuery }>) {
  if (!salesQuery.data || salesQuery.data.length === 0) {
    return <p className="text-xs text-slate-500 dark:text-slate-400">Sin ventas registradas todavía.</p>;
  }
  return (
    <ul className="space-y-0.5">
      {salesQuery.data.slice(0, 10).map((item, i) => (
        <li
          key={item.id}
          className={`flex items-start justify-between gap-4 rounded px-2 py-1.5 text-xs ${
            i % 2 === 0 ? "bg-slate-50 dark:bg-white/5" : "bg-white dark:bg-transparent"
          }`}
        >
          <div className="min-w-0">
            <span className="font-medium tabular-nums text-red-600 dark:text-red-400">
              -{item.quantity}
            </span>
            <span className="ml-2 text-slate-500 dark:text-slate-400">
              Venta
            </span>
            {item.sale.invoiceNumber && (
              <span className="ml-1 text-slate-500 dark:text-slate-400">
                — {item.sale.invoiceNumber}
              </span>
            )}
            <span className="ml-2 text-slate-500 dark:text-slate-400">
              por {item.sale.user.name ?? "sistema"}
            </span>
          </div>
          <div className="shrink-0 text-right text-slate-500 dark:text-slate-400">
            <p>${item.price.toLocaleString("es-CO")}</p>
            <p>{new Date(item.sale.createdAt).toLocaleDateString("es-CO", { timeZone: "America/Bogota" })}</p>
            <p>
              {new Date(item.sale.createdAt).toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ProductHistoryPanel({
  trackStock,
  movementsQuery,
  salesQuery,
}: Readonly<{ trackStock: boolean; movementsQuery: MovementsQuery; salesQuery: SalesQuery }>) {
  const query = trackStock ? movementsQuery : salesQuery;

  if (query.isLoading) {
    return <p className="text-xs text-slate-500 dark:text-slate-400">Cargando historial...</p>;
  }
  if (query.isError) {
    return <p className="text-xs text-red-500 dark:text-red-400">No se pudo cargar el historial. Intenta de nuevo.</p>;
  }
  if (trackStock) {
    return <MovementsHistory movementsQuery={movementsQuery} />;
  }
  return <SalesHistoryList salesQuery={salesQuery} />;
}
