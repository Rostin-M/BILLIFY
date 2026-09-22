"use client";

import { X } from "lucide-react";
import { useState } from "react";
import { api } from "~/trpc/react";
import { SpecialItemPrompt } from "~/app/_components/SpecialItemPrompt";

type Product = {
  id: string; name: string; price: number; stock: number; trackStock: boolean; category: string | null;
  brand: string | null; presentation: string | null; openPrice: boolean; soldByWeight: boolean;
};
type CartItem = {
  cartItemId: string; productId: string; name: string; price: number; quantity: number;
  weightKg?: number; customAmount?: number;
};

const fmt = (v: number) => v.toLocaleString("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0 });

type Props = { guestId: string; guestName: string; onClose: () => void; onSuccess: () => void };

export function AddOrderModal({ guestId, guestName, onClose, onSuccess }: Readonly<Props>) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [specialPrompt, setSpecialPrompt] = useState<{ product: Product; mode: "weight" | "amount" } | null>(null);

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
      const ex = prev.find((i) => i.cartItemId === p.id);
      if (ex) {
        if (p.trackStock && ex.quantity >= p.stock) return prev;
        return prev.map((i) => i.cartItemId === p.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      if (p.trackStock && p.stock === 0) return prev;
      return [...prev, { cartItemId: p.id, productId: p.id, name: p.name, price: p.price, quantity: 1 }];
    });
    if (search) setSearch("");
  }

  function addSpecialToCart(p: Product, value: number) {
    const cartItemId = `${p.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    if (p.soldByWeight) {
      const lineTotal = Math.ceil((p.price * value) / 100) * 100;
      setCart((prev) => [...prev, { cartItemId, productId: p.id, name: `${p.name} (${value} kg)`, price: lineTotal, quantity: 1, weightKg: value }]);
    } else {
      setCart((prev) => [...prev, { cartItemId, productId: p.id, name: p.name, price: value, quantity: 1, customAmount: value }]);
    }
    setSpecialPrompt(null);
    if (search) setSearch("");
  }

  function handleProductTap(p: Product) {
    if (p.openPrice) { setSpecialPrompt({ product: p, mode: "amount" }); return; }
    if (p.soldByWeight) { setSpecialPrompt({ product: p, mode: "weight" }); return; }
    addToCart(p);
  }

  function updateQty(cartItemId: string, delta: number) {
    setCart((prev) =>
      prev.map((i) => {
        if (i.cartItemId !== cartItemId) return i;
        const newQty = i.quantity + delta;
        if (delta > 0) {
          const p = (products as Product[]).find((p) => p.id === i.productId);
          if (p?.trackStock && newQty > p.stock) return i;
        }
        return { ...i, quantity: newQty };
      }).filter((i) => i.quantity > 0),
    );
  }

  function removeFromCart(cartItemId: string) {
    setCart((prev) => prev.filter((i) => i.cartItemId !== cartItemId));
  }

  function confirm() {
    if (cart.length === 0) return;
    setError(null);
    addOrder.mutate({
      guestId,
      items: cart.map((i) => ({ productId: i.productId, quantity: i.quantity, weightKg: i.weightKg, customAmount: i.customAmount })),
      note: note.trim() || undefined,
    });
  }

  const subtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);

  return (
    <>
    {specialPrompt && (
      <SpecialItemPrompt
        product={specialPrompt.product}
        mode={specialPrompt.mode}
        onConfirm={(value) => addSpecialToCart(specialPrompt.product, value)}
        onCancel={() => setSpecialPrompt(null)}
      />
    )}
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-10">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-white/10">
          <h2 className="font-semibold text-slate-800 dark:text-white">
            Agregar pedido — <span className="text-violet-600 dark:text-violet-400">{guestName}</span>
          </h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-slate-200"
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
              <p className="text-center text-sm text-slate-500">Cargando...</p>
            ) : (
              <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto">
                {filtered.map((p: Product) => {
                  const inCartQty = cart.filter((i) => i.productId === p.id).reduce((s, i) => s + i.quantity, 0);
                  const outOfStock = p.trackStock && p.stock === 0;

                  let tileClass: string;
                  if (outOfStock) {
                    tileClass = "cursor-not-allowed border-slate-100 bg-slate-50 opacity-50 dark:border-white/5 dark:bg-white/5";
                  } else if (inCartQty > 0) {
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
                      onClick={() => handleProductTap(p)}
                      disabled={outOfStock}
                      className={`flex flex-col rounded-xl border p-2.5 text-left text-sm transition active:scale-95 ${tileClass}`}
                    >
                      <span className="font-medium text-slate-800 dark:text-slate-100 line-clamp-2">{p.name}</span>
                      {(p.brand ?? p.presentation) && (
                        <span className="text-xs text-slate-500">{[p.brand, p.presentation].filter(Boolean).join(" · ")}</span>
                      )}
                      <span className="mt-0.5 font-bold text-violet-600 dark:text-violet-400">
                        {p.openPrice ? "Monto libre" : p.soldByWeight ? `${fmt(p.price)}/kg` : fmt(p.price)}
                      </span>
                      <span className={`text-xs mt-0.5 ${outOfStock ? "text-red-500" : "text-slate-500"}`}>
                        {stockLabel}
                      </span>
                      {inCartQty > 0 && <span className="text-xs font-semibold text-violet-600 dark:text-violet-400">× {inCartQty}</span>}
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
                <p className="text-center text-sm text-slate-500 py-4">Toca un producto para agregar</p>
              ) : (
                <ul className="divide-y divide-slate-200 dark:divide-white/10">
                  {cart.map((item) => {
                    const isSpecial = item.weightKg != null || item.customAmount != null;
                    return (
                    <li key={item.cartItemId} className="flex items-center justify-between gap-1 py-1.5 first:pt-0 last:pb-0">
                      <span className="truncate text-sm text-slate-700 dark:text-slate-200 flex-1">{item.name}</span>
                      {isSpecial ? (
                        <button onClick={() => removeFromCart(item.cartItemId)} className="flex h-8 w-8 items-center justify-center rounded text-sm text-red-400 transition active:scale-95 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20">×</button>
                      ) : (
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => updateQty(item.cartItemId, -1)} className="flex h-8 w-8 items-center justify-center rounded bg-slate-200 text-sm transition active:scale-95 dark:bg-white/10">−</button>
                          <span className="w-4 text-center text-sm font-semibold">{item.quantity}</span>
                          <button onClick={() => updateQty(item.cartItemId, 1)} className="flex h-8 w-8 items-center justify-center rounded bg-slate-200 text-sm transition active:scale-95 dark:bg-white/10">+</button>
                        </div>
                      )}
                      <span className="text-xs text-slate-500 w-16 text-right">{fmt(item.price * item.quantity)}</span>
                    </li>
                    );
                  })}
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
    </>
  );
}
