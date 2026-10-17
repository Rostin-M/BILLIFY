"use client";

import type { RouterOutputs } from "~/trpc/react";

export type RowMode = "view" | "edit" | "price" | "adjust" | "history";

export type ProductListItem = NonNullable<RouterOutputs["product"]["list"]>[number];

export function ProductBadges({ product }: Readonly<{ product: ProductListItem }>) {
  return (
    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
      <span
        className={`inline-block rounded-full px-1.5 py-0.5 text-xs font-medium ${
          product.isActive
            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
            : "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400"
        }`}
      >
        {product.isActive ? "Activo" : "Inactivo"}
      </span>
      {!product.trackStock && (
        <span className="rounded-full bg-sky-100 px-1.5 py-0.5 text-xs text-sky-700 dark:bg-sky-500/20 dark:text-sky-300">
          Sin control stock
        </span>
      )}
      {product.openPrice && (
        <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
          Monto libre
        </span>
      )}
      {product.soldByWeight && (
        <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
          Por peso
        </span>
      )}
      {product.category && (
        <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-xs text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">
          {product.category}
        </span>
      )}
      <span className="text-xs text-slate-500 dark:text-slate-400">
        {product.unit}
      </span>
    </div>
  );
}

export function ProductRowActions({
  product,
  userRole,
  canEditPrices,
  activeRow,
  openRow,
  setActive,
}: Readonly<{
  product: ProductListItem;
  userRole: "OWNER" | "CASHIER";
  canEditPrices: boolean;
  activeRow: { id: string; mode: RowMode } | null;
  openRow: (id: string, mode: RowMode, product?: ProductListItem) => void;
  setActive: {
    mutate: (input: { productId: string; isActive: boolean }) => void;
    isPending: boolean;
    variables?: { productId: string };
  };
}>) {
  const isRowMode = (mode: RowMode) => activeRow?.id === product.id && activeRow.mode === mode;
  return (
    <div className="col-span-12 flex flex-wrap gap-2 pt-1 sm:col-span-5 sm:justify-end sm:gap-1.5 sm:pt-0.5">
      {/* OWNER: edición completa */}
      {userRole === "OWNER" && (
        <button
          type="button"
          onClick={() => openRow(product.id, "edit", product)}
          className={`min-h-10 rounded-lg border px-3 text-sm font-medium transition sm:min-h-8 sm:text-xs ${
            isRowMode("edit")
              ? "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-500/40 dark:bg-violet-500/10 dark:text-violet-300"
              : "border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/10"
          }`}
        >
          Editar
        </button>
      )}

      {/* CASHIER: solo actualizar precio, si el propietario lo habilitó */}
      {userRole === "CASHIER" && canEditPrices && (
        <button
          type="button"
          onClick={() => openRow(product.id, "price", product)}
          className={`min-h-10 rounded-lg border px-3 text-sm font-medium transition sm:min-h-8 sm:text-xs ${
            isRowMode("price")
              ? "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-500/40 dark:bg-violet-500/10 dark:text-violet-300"
              : "border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/10"
          }`}
        >
          Precio
        </button>
      )}

      {/* Ajustar stock — ambos roles */}
      {product.trackStock && (
        <button
          type="button"
          onClick={() => openRow(product.id, "adjust")}
          className={`min-h-10 rounded-lg border px-3 text-sm font-medium transition sm:min-h-8 sm:text-xs ${
            isRowMode("adjust")
              ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300"
              : "border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/10"
          }`}
        >
          Ajustar
        </button>
      )}

      {/* Historial — ambos roles */}
      <button
        type="button"
        onClick={() => openRow(product.id, "history")}
        className={`min-h-10 rounded-lg border px-3 text-sm font-medium transition sm:min-h-8 sm:text-xs ${
          isRowMode("history")
            ? "border-slate-400 bg-slate-100 text-slate-700 dark:border-white/30 dark:bg-white/15 dark:text-slate-200"
            : "border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/10"
        }`}
      >
        Historial
      </button>

      {/* Activar/Desactivar — solo OWNER */}
      {userRole === "OWNER" && (
        <button
          type="button"
          onClick={() => setActive.mutate({ productId: product.id, isActive: !product.isActive })}
          disabled={setActive.isPending}
          aria-busy={setActive.isPending && setActive.variables?.productId === product.id}
          className={`min-h-10 rounded-lg px-3 text-sm font-medium transition disabled:cursor-not-allowed sm:min-h-8 sm:text-xs disabled:opacity-50 ${
            product.isActive
              ? "bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20"
              : "bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:hover:bg-emerald-500/20"
          }`}
        >
          {product.isActive ? "Desactivar" : "Activar"}
        </button>
      )}
    </div>
  );
}
