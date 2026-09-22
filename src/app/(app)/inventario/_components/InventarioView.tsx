"use client";

import { useState } from "react";

import { api } from "~/trpc/react";

const LOW_STOCK_THRESHOLD = 5;

type StockStatus = "disponible" | "bajo" | "agotado";

function getStockStatus(stock: number, trackStock: boolean): StockStatus {
  if (!trackStock) return "disponible";
  if (stock === 0) return "agotado";
  if (stock <= LOW_STOCK_THRESHOLD) return "bajo";
  return "disponible";
}

const STATUS_STYLE: Record<StockStatus, string> = {
  disponible:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  bajo: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  agotado: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300",
};

const STATUS_LABEL: Record<StockStatus, string> = {
  disponible: "Disponible",
  bajo: "Bajo stock",
  agotado: "Sin stock",
};

const SUMMARY_CARD_STYLE: Record<StockStatus, string> = {
  disponible: "border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10",
  bajo: "border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10",
  agotado: "border-red-200 bg-red-50 dark:border-red-500/30 dark:bg-red-500/10",
};

const SUMMARY_COUNT_STYLE: Record<StockStatus, string> = {
  disponible: "text-emerald-700 dark:text-emerald-300",
  bajo: "text-amber-700 dark:text-amber-300",
  agotado: "text-red-700 dark:text-red-300",
};

function formatCOP(value: number): string {
  return value.toLocaleString("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

export function InventarioView() {
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [showOnlyOutOfStock, setShowOnlyOutOfStock] = useState(false);

  const { data: products, isPending } = api.product.search.useQuery(undefined, {
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  });

  const categories = [
    ...new Set((products ?? []).map((p) => p.category).filter(Boolean)),
  ] as string[];

  const filtered = (products ?? [])
    .filter((p) => {
      const matchesQuery = p.name
        .toLowerCase()
        .includes(query.toLowerCase().trim());
      const matchesCategory =
        !categoryFilter || p.category === categoryFilter;
      const matchesOutOfStock =
        !showOnlyOutOfStock || (p.trackStock && p.stock === 0);
      return matchesQuery && matchesCategory && matchesOutOfStock;
    })
    // El endpoint ordena por más vendidos (útil para las grillas de venta);
    // aquí para gestión de stock es más útil el orden alfabético por categoría.
    .sort((a, b) => (a.category ?? "").localeCompare(b.category ?? "") || a.name.localeCompare(b.name));

  const counts = {
    disponible: filtered.filter((p) => getStockStatus(p.stock, p.trackStock) === "disponible").length,
    bajo: filtered.filter((p) => getStockStatus(p.stock, p.trackStock) === "bajo").length,
    agotado: filtered.filter((p) => getStockStatus(p.stock, p.trackStock) === "agotado").length,
  };

  return (
    <div className="space-y-4">
      {/* Barra de búsqueda y filtros */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nombre..."
          className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-violet-400 transition focus:ring-2 dark:border-white/15 dark:bg-slate-900"
        />
        {categories.length > 0 && (
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-violet-400 transition focus:ring-2 dark:border-white/15 dark:bg-slate-900"
          >
            <option value="">Todas las categorías</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        )}
        <button
          onClick={() => setShowOnlyOutOfStock((v) => !v)}
          className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
            showOnlyOutOfStock
              ? "border-red-300 bg-red-50 text-red-700 dark:border-red-500/40 dark:bg-red-900/20 dark:text-red-300"
              : "border-slate-300 bg-white text-slate-600 hover:border-slate-400 dark:border-white/15 dark:bg-slate-900 dark:text-slate-300"
          }`}
        >
          {showOnlyOutOfStock ? "Mostrando sin stock" : "Ver solo sin stock"}
        </button>
      </div>

      {/* Resumen de estado */}
      {!isPending && products && products.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {(["disponible", "bajo", "agotado"] as StockStatus[]).map((status) => (
            <div
              key={status}
              className={`rounded-xl border p-2.5 sm:p-3 ${SUMMARY_CARD_STYLE[status]}`}
            >
              <p
                className={`text-xl font-bold tabular-nums sm:text-2xl ${SUMMARY_COUNT_STYLE[status]}`}
              >
                {counts[status]}
              </p>
              <p className="mt-0.5 truncate text-xs text-slate-600 dark:text-slate-400">
                {STATUS_LABEL[status]}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Tabla de productos */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-white/5">
        {isPending && (
          <p className="p-5 text-sm text-slate-500 dark:text-slate-400">
            Cargando inventario...
          </p>
        )}
        {!isPending && filtered.length === 0 && (
          <p className="p-5 text-sm text-slate-500 dark:text-slate-400">
            {query || categoryFilter
              ? "No hay productos que coincidan con la búsqueda."
              : "No hay productos activos registrados."}
          </p>
        )}
        {!isPending && filtered.length > 0 && (
          <>
            {/* Tarjetas apiladas en móvil */}
            <ul className="divide-y divide-slate-100 dark:divide-white/5 md:hidden">
              {filtered.map((product) => {
                const status = getStockStatus(product.stock, product.trackStock);
                return (
                  <li key={product.id} className="flex items-center gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{product.name}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        {product.category && (
                          <span className="inline-block rounded-full bg-violet-100 px-1.5 py-0.5 text-xs text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">
                            {product.category}
                          </span>
                        )}
                        {!product.trackStock && (
                          <span className="inline-block rounded-full bg-sky-100 px-1.5 py-0.5 text-xs text-sky-700 dark:bg-sky-500/20 dark:text-sky-300">
                            Sin control
                          </span>
                        )}
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}
                        >
                          {product.trackStock ? STATUS_LABEL[status] : "Disponible"}
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="tabular-nums font-medium">{formatCOP(product.price)}</p>
                      <p className="mt-0.5 text-xs tabular-nums text-slate-500 dark:text-slate-400">
                        Stock: {product.trackStock ? product.stock : "∞"}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>

            {/* Tabla en tablet/escritorio */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-white/5">
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400">
                      Producto
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400">
                      Precio
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400">
                      Stock
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400">
                      Estado
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {filtered.map((product) => {
                    const status = getStockStatus(product.stock, product.trackStock);
                    return (
                      <tr key={product.id}>
                        <td className="max-w-0 px-4 py-3">
                          <p className="truncate font-medium">{product.name}</p>
                          <div className="mt-0.5 flex flex-wrap gap-1">
                            {product.category && (
                              <span className="inline-block rounded-full bg-violet-100 px-1.5 py-0.5 text-xs text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">
                                {product.category}
                              </span>
                            )}
                            {!product.trackStock && (
                              <span className="inline-block rounded-full bg-sky-100 px-1.5 py-0.5 text-xs text-sky-700 dark:bg-sky-500/20 dark:text-sky-300">
                                Sin control
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {formatCOP(product.price)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium">
                          {product.trackStock ? product.stock : "∞"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}
                          >
                            {product.trackStock ? STATUS_LABEL[status] : "Disponible"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {filtered.length > 0 && (
        <p className="text-right text-xs text-slate-500 dark:text-slate-500">
          {filtered.length} producto{filtered.length !== 1 ? "s" : ""} mostrado
          {filtered.length !== 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}
