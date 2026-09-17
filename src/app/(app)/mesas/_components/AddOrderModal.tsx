"use client";

import { X } from "lucide-react";
import { useState } from "react";
import { api } from "~/trpc/react";

type Product = { id: string; name: string; price: number; stock: number; trackStock: boolean; category: string | null };
type CartItem = { productId: string; name: string; price: number; quantity: number };

const fmt = (v: number) => v.toLocaleString("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0 });

type Props = { guestId: string; guestName: string; onClose: () => void; onSuccess: () => void };

export function AddOrderModal({ guestId, guestName, onClose, onSuccess }: Readonly<Props>) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: products = [], isLoading } = api.product.search.useQuery();
  const utils = api.useUtils();

  const addOrder = api.tableSession.addOrder.useMutation({
    onSuccess: async () => {
      await utils.tableSession.listActive.invalidate();
      await utils.product.search.invalidate();
      await utils.product.list.invalidate();
      onSuccess();
    },
    onError: (e) => setError(e.message),
  });

  const filtered = (products as Product[]).filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()),
  );

  function addToCart(p: Product) {
    setCart((prev) => {
      const ex = prev.find((i) => i.productId === p.id);
      if (ex) {
        if (p.trackStock && ex.quantity >= p.stock) return prev;
        return prev.map((i) => i.productId === p.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      if (p.trackStock && p.stock === 0) return prev;
      return [...prev, { productId: p.id, name: p.name, price: p.price, quantity: 1 }];
    });
  }

  function updateQty(productId: string, delta: number) {
    setCart((prev) =>
      prev.map((i) => {
        if (i.productId !== productId) return i;
        const newQty = i.quantity + delta;
        if (delta > 0) {
          const p = (products as Product[]).find((p) => p.id === productId);
          if (p?.trackStock && newQty > p.stock) return i;
        }
        return { ...i, quantity: newQty };
      }).filter((i) => i.quantity > 0),
    );
  }

  function confirm() {
    if (cart.length === 0) return;
    setError(null);
    addOrder.mutate({
      guestId,
      items: cart.map((i) => ({ productId: i.productId, quantity: i.quantity })),
      note: note.trim() || undefined,
    });
  }

  const subtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-10">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-white/10">
          <h2 className="font-semibold text-slate-800 dark:text-white">
            Agregar pedido — <span className="text-violet-600 dark:text-violet-400">{guestName}</span>
          </h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col gap-4 p-5 lg:flex-row">
          {/* Catálogo */}
          <div className="flex flex-col gap-3 lg:w-3/5">
            <input
              type="search"
              placeholder="Buscar producto..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-200 dark:border-white/10 dark:bg-white/5 dark:text-white"
            />
            {isLoading ? (
              <p className="text-center text-sm text-slate-400">Cargando...</p>
            ) : (
              <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto">
                {filtered.map((p: Product) => {
                  const inCart = cart.find((i) => i.productId === p.id);
                  const outOfStock = p.trackStock && p.stock === 0;

                  let tileClass: string;
                  if (outOfStock) {
                    tileClass = "cursor-not-allowed border-slate-100 bg-slate-50 opacity-50 dark:border-white/5 dark:bg-white/5";
                  } else if (inCart) {
                    tileClass = "border-violet-300 bg-violet-50 dark:border-violet-500/50 dark:bg-violet-900/20";
                  } else {
                    tileClass = "border-slate-200 bg-white hover:border-violet-200 dark:border-white/10 dark:bg-white/5";
                  }

                  let stockLabel: string;
                  if (outOfStock) {
                    stockLabel = "Sin stock";
                  } else if (p.trackStock) {
                    stockLabel = `${p.stock} disp.`;
                  } else {
                    stockLabel = "∞";
                  }

                  return (
                    <button
                      key={p.id}
                      onClick={() => addToCart(p)}
                      disabled={outOfStock}
                      className={`flex flex-col rounded-xl border p-2.5 text-left text-sm transition active:scale-95 ${tileClass}`}
                    >
                      <span className="font-medium text-slate-800 dark:text-slate-100 line-clamp-2">{p.name}</span>
                      <span className="mt-0.5 font-bold text-violet-600 dark:text-violet-400">{fmt(p.price)}</span>
                      <span className={`text-xs mt-0.5 ${outOfStock ? "text-red-500" : "text-slate-400"}`}>
                        {stockLabel}
                      </span>
                      {inCart && <span className="text-xs font-semibold text-violet-600 dark:text-violet-400">× {inCart.quantity}</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Resumen */}
          <div className="flex flex-col gap-3 lg:w-2/5">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5 min-h-[120px]">
              {cart.length === 0 ? (
                <p className="text-center text-sm text-slate-400 py-4">Toca un producto para agregar</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {cart.map((item) => (
                    <li key={item.productId} className="flex items-center justify-between gap-1">
                      <span className="truncate text-sm text-slate-700 dark:text-slate-200 flex-1">{item.name}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => updateQty(item.productId, -1)} className="flex h-8 w-8 items-center justify-center rounded bg-slate-200 text-sm transition active:scale-95 dark:bg-white/10">−</button>
                        <span className="w-4 text-center text-sm font-semibold">{item.quantity}</span>
                        <button onClick={() => updateQty(item.productId, 1)} className="flex h-8 w-8 items-center justify-center rounded bg-slate-200 text-sm transition active:scale-95 dark:bg-white/10">+</button>
                      </div>
                      <span className="text-xs text-slate-500 w-16 text-right">{fmt(item.price * item.quantity)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {cart.length > 0 && (
                <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-sm font-semibold dark:border-white/10">
                  <span>Total</span>
                  <span>{fmt(subtotal)}</span>
                </div>
              )}
            </div>

            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Nota (opcional)"
              className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-400 dark:border-white/10 dark:bg-white/5 dark:text-white"
            />

            {error && <p className="text-xs text-red-500">{error}</p>}

            <button
              onClick={confirm}
              disabled={cart.length === 0 || addOrder.isPending}
              className="w-full rounded-xl bg-violet-600 py-2.5 text-sm font-bold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {addOrder.isPending ? "Registrando..." : `Confirmar pedido${cart.length > 0 ? ` · ${fmt(subtotal)}` : ""}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
