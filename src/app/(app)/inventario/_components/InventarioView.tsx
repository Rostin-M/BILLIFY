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

  const filtered = (products ?? []).filter((p) => {
    const matchesQuery = p.name
      .toLowerCase()
      .includes(query.toLowerCase().trim());
    const matchesCategory =
      !categoryFilter || p.category === categoryFilter;
    const matchesOutOfStock =
      !showOnlyOutOfStock || (p.trackStock && p.stock === 0);
    return matchesQuery && matchesCategory && matchesOutOfStock;
  });

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
        <div className="grid grid-cols-3 gap-3">
          {(["disponible", "bajo", "agotado"] as StockStatus[]).map((status) => (
            <button
              key={status}
              onClick={() =>
                setCategoryFilter((prev) => {
                  // no filtra por status en esta versión — solo es informativo
                  return prev;
                })
              }
              className={`rounded-xl border p-3 text-left ${
                status === "disponible"
                  ? "border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10"
                  : status === "bajo"
                    ? "border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10"
                    : "border-red-200 bg-red-50 dark:border-red-500/30 dark:bg-red-500/10"
              }`}
            >
              <p
                className={`text-2xl font-bold tabular-nums ${
                  status === "disponible"
                    ? "text-emerald-700 dark:text-emerald-300"
                    : status === "bajo"
                      ? "text-amber-700 dark:text-amber-300"
                      : "text-red-700 dark:text-red-300"
                }`}
              >
                {counts[status]}
              </p>
              <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                {STATUS_LABEL[status]}
              </p>
            </button>
          ))}
        </div>
      )}

      {/* Tabla de productos */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-white/5">
        {isPending ? (
          <p className="p-5 text-sm text-slate-500 dark:text-slate-400">
            Cargando inventario...
          </p>
        ) : filtered.length === 0 ? (
          <p className="p-5 text-sm text-slate-500 dark:text-slate-400">
            {query || categoryFilter
              ? "No hay productos que coincidan con la búsqueda."
              : "No hay productos activos registrados."}
          </p>
        ) : (
          <div className="overflow-x-auto">
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
                      <td className="px-4 py-3">
                        <p className="font-medium">{product.name}</p>
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
        )}
      </section>

      {filtered.length > 0 && (
        <p className="text-right text-xs text-slate-400 dark:text-slate-500">
          {filtered.length} producto{filtered.length !== 1 ? "s" : ""} mostrado
          {filtered.length !== 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}
