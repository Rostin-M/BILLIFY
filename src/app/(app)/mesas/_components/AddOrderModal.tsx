"use client";

import { Minus, Plus, Search, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "~/trpc/react";
import { SpecialItemPrompt } from "~/app/_components/SpecialItemPrompt";
import { Modal } from "~/app/_components/ui/Modal";
import { formatCOP as fmt } from "~/lib/format/money";

type Product = {
  id: string; name: string; price: number; stock: number; trackStock: boolean; category: string | null;
  brand: string | null; presentation: string | null; openPrice: boolean; soldByWeight: boolean;
};
type CartItem = {
  cartItemId: string; productId: string; name: string; price: number; quantity: number;
  weightKg?: number; customAmount?: number;
  existingItemId?: string;
};

type EditingOrder = {
  orderId: string;
  index: number;
  note: string | null;
  items: { id: string; productId: string; name: string; price: number; quantity: number }[];
};

const LOW_STOCK = 5;

type Props = {
  guestId: string | null;
  guestName: string;
  editing?: EditingOrder;
  onClose: () => void;
  onSuccess: () => void;
};

function initialCart(editing: EditingOrder | undefined): CartItem[] {
  return (editing?.items ?? []).map((i) => ({
    cartItemId: `existing:${i.id}`, existingItemId: i.id, productId: i.productId, name: i.name, price: i.price, quantity: i.quantity,
  }));
}

function isSpecialLine(item: CartItem, products: Product[]): boolean {
  if (item.weightKg != null || item.customAmount != null) return true;
  if (!item.existingItemId) return false;
  const p = products.find((x) => x.id === item.productId);
  return !!p && (p.openPrice || p.soldByWeight);
}

function unitsInCart(items: CartItem[], productId: string, products: Product[]): number {
  return items.filter((i) => i.productId === productId && !isSpecialLine(i, products)).reduce((n, i) => n + i.quantity, 0);
}

// Lo que ya tiene la ronda está descontado del stock.
function availableUnits(p: Product, editing: EditingOrder | undefined): number {
  const inOrder = (editing?.items ?? []).filter((i) => i.productId === p.id).reduce((n, i) => n + i.quantity, 0);
  return p.stock + inOrder;
}

const toItemInput = (i: CartItem) => ({ productId: i.productId, quantity: i.quantity, weightKg: i.weightKg, customAmount: i.customAmount });

function editPayload(cart: CartItem[]) {
  return {
    keep: cart.filter((i) => i.existingItemId).map((i) => ({ itemId: i.existingItemId!, quantity: i.quantity })),
    add: cart.filter((i) => !i.existingItemId).map(toItemInput),
  };
}

function confirmLabelFor(editing: boolean, pending: boolean, subtotal: number, empty: boolean): string {
  if (editing) {
    if (pending) return "Guardando...";
    return empty ? "Guardar cambios" : `Guardar cambios · ${fmt(subtotal)}`;
  }
  if (pending) return "Registrando...";
  return empty ? "Confirmar pedido" : `Confirmar pedido · ${fmt(subtotal)}`;
}

function discardQuestion(editing: EditingOrder | undefined, guestName: string, units: number): string {
  if (editing) return `¿Descartar los cambios a la ronda ${editing.index + 1}?`;
  const noun = units === 1 ? "producto" : "productos";
  return `¿Descartar el pedido de ${guestName}? Tiene ${units} ${noun} sin confirmar.`;
}

export function AddOrderModal({ guestId, guestName, editing, onClose, onSuccess }: Readonly<Props>) {
  const [cart, setCart] = useState<CartItem[]>(() => initialCart(editing));
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [note, setNote] = useState(editing?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [specialPrompt, setSpecialPrompt] = useState<{ product: Product; mode: "weight" | "amount" } | null>(null);
  const cartListRef = useRef<HTMLUListElement>(null);
  const [flash, setFlash] = useState<{ key: string; n: number } | null>(null);
  const [initialSnapshot] = useState(() => JSON.stringify([initialCart(editing), editing?.note ?? ""]));
  const dirty = editing ? JSON.stringify([cart, note]) !== initialSnapshot : cart.length > 0;
  const requestClose = () => (dirty ? setConfirmDiscard(true) : onClose());
  // Clave de idempotencia del pedido: se reutiliza en reintentos y se descarta si cambia el pedido.
  const orderKeyRef = useRef<string | null>(null);
  useEffect(() => {
    orderKeyRef.current = null;
  }, [cart, note]);

  const { data: products = [], isLoading } = api.product.search.useQuery();
  const utils = api.useUtils();

  const updateOrder = api.tableSession.updateOrder.useMutation({
    onSuccess: async (order) => {
      await utils.tableSession.listActive.invalidate();
      await utils.product.search.invalidate();
      await utils.product.list.invalidate();
      toast.success(`Ronda de ${guestName} actualizada · ${fmt(order.total)}`);
      onSuccess();
    },
    onError: (e) => setError(e.message),
  });

  const addOrder = api.tableSession.addOrder.useMutation({
    onSuccess: async (order) => {
      await utils.tableSession.listActive.invalidate();
      await utils.product.search.invalidate();
      await utils.product.list.invalidate();
      toast.success(`Pedido registrado para ${guestName} · ${fmt(order.total)}`);
      onSuccess();
    },
    onError: (e) => setError(e.message),
  });

  const allProducts = products as Product[];
  const available = (p: Product) => availableUnits(p, editing);
  const isSpecial = (item: CartItem) => isSpecialLine(item, allProducts);
  const unitsOf = (items: CartItem[], productId: string) => unitsInCart(items, productId, allProducts);
  const categories = [...new Set(allProducts.map((p) => p.category).filter((c): c is string => !!c))].sort((a, b) =>
    a.localeCompare(b, "es"),
  );
  const q = search.trim().toLowerCase();
  const filtered = allProducts.filter(
    (p) =>
      (!category || p.category === category) &&
      (!q || p.name.toLowerCase().includes(q) || (p.brand?.toLowerCase().includes(q) ?? false)),
  );

  function markAdded(key: string) {
    setFlash((f) => ({ key, n: (f?.n ?? 0) + 1 }));
    cartListRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }

  function addToCart(p: Product) {
    if (p.trackStock && unitsOf(cart, p.id) >= available(p)) {
      toast.error(available(p) === 0 ? `${p.name} no tiene unidades disponibles.` : `Solo hay ${available(p)} de ${p.name}.`);
      return;
    }
    setCart((prev) => {
      const ex = prev.find((i) => i.productId === p.id && i.existingItemId && !isSpecial(i))
        ?? prev.find((i) => i.cartItemId === p.id);
      // Al final del arreglo = arriba en la lista.
      if (ex) return [...prev.filter((i) => i !== ex), { ...ex, quantity: ex.quantity + 1 }];
      return [...prev, { cartItemId: p.id, productId: p.id, name: p.name, price: p.price, quantity: 1 }];
    });
    markAdded(p.id);
    setConfirmDiscard(false);
    if (search) setSearch("");
  }

  function addSpecialToCart(p: Product, value: number) {
    const cartItemId = `${p.id}-${crypto.randomUUID()}`;
    if (p.soldByWeight) {
      const lineTotal = Math.ceil((p.price * value) / 100) * 100;
      setCart((prev) => [...prev, { cartItemId, productId: p.id, name: `${p.name} (${value} kg)`, price: lineTotal, quantity: 1, weightKg: value }]);
    } else {
      setCart((prev) => [...prev, { cartItemId, productId: p.id, name: p.name, price: value, quantity: 1, customAmount: value }]);
    }
    markAdded(cartItemId);
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
          const p = allProducts.find((p) => p.id === i.productId);
          if (p?.trackStock && unitsOf(prev, p.id) + delta > available(p)) return i;
        }
        return { ...i, quantity: newQty };
      }).filter((i) => i.quantity > 0),
    );
  }

  function removeFromCart(cartItemId: string) {
    setCart((prev) => prev.filter((i) => i.cartItemId !== cartItemId));
  }

  function confirm() {
    if (cart.length === 0 || addOrder.isPending || updateOrder.isPending) return;
    setError(null);
    if (editing) {
      updateOrder.mutate({ orderId: editing.orderId, ...editPayload(cart), note: note.trim() });
      return;
    }
    if (!guestId) return;
    orderKeyRef.current ??= crypto.randomUUID();
    addOrder.mutate({
      guestId,
      items: cart.map(toItemInput),
      note: note.trim() || undefined,
      idempotencyKey: orderKeyRef.current,
    });
  }

  const subtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const units = cart.reduce((s, i) => s + i.quantity, 0);
  const pending = addOrder.isPending || updateOrder.isPending;
  const confirmLabel = confirmLabelFor(!!editing, pending, subtotal, cart.length === 0);

  const chipClass = (active: boolean) =>
    `min-h-9 shrink-0 rounded-full border px-3 text-sm font-medium transition ${
      active
        ? "border-violet-500 bg-violet-600 text-white"
        : "border-slate-200 bg-white text-slate-600 hover:border-violet-300 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
    }`;

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
    <Modal
      onClose={requestClose}
      overlayClassName="fixed inset-0 z-50 flex items-stretch justify-center bg-black/50 sm:items-center sm:p-4"
      aria-label={editing ? `Editar ronda ${editing.index + 1} de ${guestName}` : `Agregar pedido para ${guestName}`}
      className="flex h-[100dvh] w-full flex-col bg-white shadow-2xl sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:max-w-4xl sm:rounded-2xl dark:bg-slate-900"
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5 dark:border-white/10">
        <h2 className="min-w-0 font-semibold text-slate-800 dark:text-white">
          <span className="block text-xs font-medium text-slate-500 dark:text-slate-400">
            {editing ? `Editando ronda ${editing.index + 1} de` : "Pedido para"}
          </span>
          <span className="block truncate text-lg text-violet-700 dark:text-violet-300">{guestName}</span>
        </h2>
        <button
          onClick={requestClose}
          aria-label="Cerrar"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-slate-200"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 space-y-2 px-4 pb-2 pt-3 sm:px-5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                aria-label="Buscar producto"
                type="search"
                placeholder="Buscar producto o marca..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="min-h-11 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-4 text-base outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500 sm:text-sm dark:border-white/10 dark:bg-white/5 dark:text-white"
              />
            </div>
            {categories.length > 1 && (
              <fieldset className="-mx-4 flex min-w-0 gap-2 overflow-x-auto px-4 pb-1 sm:-mx-5 sm:px-5" aria-label="Categorías">
                <button type="button" onClick={() => setCategory(null)} aria-pressed={category === null} className={chipClass(category === null)}>
                  Todo
                </button>
                {categories.map((c) => (
                  <button key={c} type="button" onClick={() => setCategory(c)} aria-pressed={category === c} className={chipClass(category === c)}>
                    {c}
                  </button>
                ))}
              </fieldset>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3 sm:min-h-64 sm:px-5">
            {isLoading && <output className="block py-6 text-center text-sm text-slate-500">Cargando productos...</output>}
            {!isLoading && filtered.length === 0 && (
              <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                {q ? <>Ningún producto coincide con &quot;{search}&quot;.</> : "No hay productos en esta categoría."}
              </p>
            )}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {filtered.map((p: Product) => {
                const inCartQty = cart.filter((i) => i.productId === p.id).reduce((s, i) => s + i.quantity, 0);
                const outOfStock = p.trackStock && p.stock === 0;

                let tileClass: string;
                if (outOfStock) {
                  tileClass = "cursor-not-allowed border-slate-100 bg-slate-50 opacity-50 dark:border-white/5 dark:bg-white/5";
                } else if (inCartQty > 0) {
                  tileClass = "border-violet-400 bg-violet-50 ring-1 ring-violet-400 dark:border-violet-500/60 dark:bg-violet-900/25 dark:ring-violet-500/60";
                } else {
                  tileClass = "border-slate-200 bg-white hover:border-violet-300 dark:border-white/10 dark:bg-white/5";
                }

                let stockLabel: React.ReactNode = null;
                if (outOfStock) {
                  stockLabel = <span className="text-xs font-semibold text-red-600 dark:text-red-400">Agotado</span>;
                } else if (p.trackStock && p.stock <= LOW_STOCK) {
                  stockLabel = <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">Quedan {p.stock}</span>;
                } else if (p.trackStock) {
                  stockLabel = <span className="text-xs text-slate-500">{p.stock} disp.</span>;
                }

                let priceLabel: string;
                if (p.openPrice) {
                  priceLabel = "Monto libre";
                } else if (p.soldByWeight) {
                  priceLabel = `${fmt(p.price)}/kg`;
                } else {
                  priceLabel = fmt(p.price);
                }

                return (
                  <button
                    key={p.id}
                    onClick={() => handleProductTap(p)}
                    disabled={outOfStock}
                    aria-label={`${p.name}, ${priceLabel}${inCartQty > 0 ? ", " + inCartQty + " en el pedido" : ""}`}
                    className={`relative flex min-h-24 flex-col rounded-xl border p-2.5 text-left text-sm transition active:scale-95 ${tileClass}`}
                  >
                    {inCartQty > 0 && (
                      <span aria-hidden className="absolute right-1.5 top-1.5 rounded-full bg-violet-600 px-2 py-0.5 text-xs font-bold tabular-nums text-white">
                        {inCartQty}
                      </span>
                    )}
                    <span className={`line-clamp-2 font-medium text-slate-800 dark:text-slate-100 ${inCartQty > 0 ? "pr-7" : ""}`}>{p.name}</span>
                    {(p.brand ?? p.presentation) && (
                      <span className="truncate text-xs text-slate-500">{[p.brand, p.presentation].filter(Boolean).join(" · ")}</span>
                    )}
                    <span className="mt-auto pt-1 font-bold text-violet-700 dark:text-violet-300">{priceLabel}</span>
                    {stockLabel}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] sm:px-5 lg:w-96 lg:border-l lg:border-t-0 lg:shadow-none dark:border-white/10 dark:bg-slate-950/40">
          <p className="flex items-baseline justify-between text-sm font-semibold text-slate-700 dark:text-slate-200">
            <span>Pedido{units > 0 && <span className="font-normal text-slate-500 dark:text-slate-400"> · {units} {units === 1 ? "producto" : "productos"}</span>}</span>
            {cart.length > 0 && <span className="tabular-nums">{fmt(subtotal)}</span>}
          </p>
          {cart.length === 0 ? (
            <p className="py-1 text-sm text-slate-500 dark:text-slate-400">
              {editing ? "La ronda quedó vacía. Agrega un producto o, si ya no quieren nada, elimina la ronda." : "Toca un producto para agregarlo."}
            </p>
          ) : (
            <ul ref={cartListRef} className="max-h-36 divide-y divide-slate-200 overflow-y-auto overscroll-contain lg:max-h-none lg:flex-1 dark:divide-white/10">
              {/* Lo último que se agregó va arriba. */}
              {[...cart].reverse().map((item) => {
                const special = isSpecial(item);
                const flashed = flash?.key === item.cartItemId;
                return (
                  <li
                    key={flashed ? `${item.cartItemId}-${flash.n}` : item.cartItemId}
                    className={`flex items-center gap-2 rounded-lg px-1 py-1.5 ${flashed ? "cart-flash" : ""}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-sm text-slate-800 dark:text-slate-100">{item.name}</span>
                      <span className="block text-xs tabular-nums text-slate-500">{fmt(item.price * item.quantity)}</span>
                    </span>
                    {special ? (
                      <button
                        onClick={() => removeFromCart(item.cartItemId)}
                        aria-label={`Quitar ${item.name}`}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-red-500 transition hover:bg-red-50 active:scale-95 dark:hover:bg-red-900/20"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : (
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          onClick={() => updateQty(item.cartItemId, -1)}
                          aria-label={item.quantity === 1 ? `Quitar ${item.name}` : `Uno menos de ${item.name}`}
                          className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white transition active:scale-95 dark:border-white/10 dark:bg-white/10"
                        >
                          {item.quantity === 1 ? <Trash2 className="h-4 w-4 text-red-500" /> : <Minus className="h-4 w-4" />}
                        </button>
                        <span className="w-6 text-center text-sm font-bold tabular-nums">{item.quantity}</span>
                        <button
                          onClick={() => updateQty(item.cartItemId, 1)}
                          aria-label={`Uno más de ${item.name}`}
                          className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white transition active:scale-95 dark:border-white/10 dark:bg-white/10"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <input
            aria-label="Nota del pedido (opcional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            placeholder="Nota: sin hielo, término medio... (opcional)"
            className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-base outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500 sm:text-sm dark:border-white/10 dark:bg-white/5 dark:text-white"
          />

          {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          {confirmDiscard ? (
            <div role="alertdialog" aria-label="Descartar pedido" className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-500/40 dark:bg-amber-900/20">
              <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                {discardQuestion(editing, guestName, units)}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmDiscard(false)}
                  autoFocus
                  className="min-h-11 flex-1 rounded-xl bg-violet-600 px-3 text-sm font-bold text-white hover:bg-violet-700"
                >
                  {editing ? "Seguir editando" : "Seguir pidiendo"}
                </button>
                <button
                  onClick={onClose}
                  className="min-h-11 flex-1 rounded-xl border border-red-300 bg-white px-3 text-sm font-semibold text-red-600 hover:bg-red-50 dark:border-red-500/40 dark:bg-transparent dark:text-red-300"
                >
                  Descartar
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={confirm}
              disabled={cart.length === 0 || pending || (!!editing && !dirty)}
              aria-busy={pending}
              className="min-h-12 w-full rounded-xl bg-violet-600 text-base font-bold text-white shadow-lg transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-violet-400 disabled:shadow-none dark:disabled:bg-violet-900"
            >
              {confirmLabel}
            </button>
          )}
        </div>
      </div>
    </Modal>
    </>
  );
}
