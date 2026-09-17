"use client";

import { useCallback, useEffect, useState } from "react";
import { useOfflineQueue } from "~/hooks/useOfflineQueue";
import { api } from "~/trpc/react";
import { OfflineBanner } from "./OfflineBanner";
import { BarcodeScanner } from "~/app/_components/BarcodeScanner";
import { ContinuousScanPanel, type ScanResult } from "~/app/_components/ContinuousScanPanel";
import { CustomerSelector } from "./CustomerSelector";
import { computeSaleTotals, type TaxConfig } from "~/lib/pricing";

type SelectedCustomer = { id?: string; name: string; document?: string; email?: string | null; isGuestWithDoc?: boolean };

type CartItem = {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  taxSlots: number[];
};

type Product = {
  id: string;
  name: string;
  price: number;
  stock: number;
  trackStock: boolean;
  category: string | null;
  barcode: string | null;
  taxSlots: number[];
};

const QUICK_CART_KEY = "billify_quick_cart";
const QUICK_PAYMENT_KEY = "billify_quick_payment";
const QUICK_CUSTOMER_KEY = "billify_quick_customer";

function loadLS<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function POS({ taxes, autoTax }: Readonly<{ taxes: TaxConfig[]; autoTax: boolean }>) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "CARD" | "CREDIT" | "TRANSFER">("CASH");
  const [selectedCustomer, setSelectedCustomer] = useState<SelectedCustomer | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [continuousScan, setContinuousScan] = useState(false);

  useEffect(() => {
    setCart(loadLS<CartItem[]>(QUICK_CART_KEY, []));
    setPaymentMethod(loadLS<"CASH" | "CARD" | "CREDIT" | "TRANSFER">(QUICK_PAYMENT_KEY, "CASH"));
    setSelectedCustomer(loadLS<SelectedCustomer | null>(QUICK_CUSTOMER_KEY, null));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(QUICK_CART_KEY, JSON.stringify(cart));
  }, [cart, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(QUICK_PAYMENT_KEY, JSON.stringify(paymentMethod));
  }, [paymentMethod, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(QUICK_CUSTOMER_KEY, JSON.stringify(selectedCustomer));
  }, [selectedCustomer, hydrated]);

  const { data: products = [], isLoading } = api.product.search.useQuery();
  const utils = api.useUtils();

  const createSale = api.sale.create.useMutation({
    onSuccess: (data) => {
      clearCart();
      showMessage("success", `Venta registrada: ${formatCOP(data.total)}`);
      void utils.sale.list.invalidate();
      void utils.product.search.invalidate();
      void utils.product.list.invalidate();
    },
    onError: (err) => showMessage("error", err.message),
  });

  const syncFn = useCallback(
    async (sale: { items: { productId: string; quantity: number }[]; paymentMethod: "CASH" | "CARD" | "CREDIT" | "TRANSFER"; customerId?: string; note?: string }) => {
      await createSale.mutateAsync({ ...sale, saleType: "QUICK" });
      await utils.sale.list.invalidate();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const { isOnline, pendingCount, isSyncing, syncErrors, addToQueue, processQueue } =
    useOfflineQueue(syncFn);

  function showMessage(type: "success" | "error", text: string) {
    setStatusMessage({ type, text });
    if (type === "success") setTimeout(() => setStatusMessage(null), 4000);
  }

  function clearCart() {
    setCart([]);
    setPaymentMethod("CASH");
    setSelectedCustomer(null);
    localStorage.removeItem(QUICK_CART_KEY);
    localStorage.removeItem(QUICK_PAYMENT_KEY);
    localStorage.removeItem(QUICK_CUSTOMER_KEY);
    setShowClearConfirm(false);
  }

  const filteredProducts = products.filter((p: Product) =>
    p.name.toLowerCase().includes(search.toLowerCase()),
  );

  function addToCart(product: Product) {
    setCart((prev) => {
      const existing = prev.find((i) => i.productId === product.id);
      if (existing) {
        if (product.trackStock && existing.quantity >= product.stock) return prev;
        return prev.map((i) =>
          i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i,
        );
      }
      if (product.trackStock && product.stock === 0) return prev;
      return [
        ...prev,
        { productId: product.id, name: product.name, price: product.price, quantity: 1, taxSlots: product.taxSlots },
      ];
    });
  }

  function handleBarcodeDetected(code: string) {
    setShowScanner(false);
    const product = products.find((p: Product) => p.barcode === code);
    if (!product) {
      showMessage("error", `Ningún producto tiene el código ${code}.`);
      return;
    }
    addToCart(product);
    showMessage("success", `${product.name} agregado al carrito.`);
  }

  function handleContinuousScan(code: string): ScanResult {
    const product = products.find((p: Product) => p.barcode === code);
    if (!product) return { ok: false, code };
    addToCart(product);
    return { ok: true, name: product.name };
  }

  function updateQty(productId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((i) => {
          if (i.productId !== productId) return i;
          const newQty = i.quantity + delta;
          if (delta > 0) {
            const product = products.find((p: Product) => p.id === productId);
            if (product?.trackStock && newQty > product.stock) return i;
          }
          return { ...i, quantity: newQty };
        })
        .filter((i) => i.quantity > 0),
    );
  }

  function removeFromCart(productId: string) {
    setCart((prev) => prev.filter((i) => i.productId !== productId));
  }

  const { subtotal, taxLines, total } = computeSaleTotals(cart, taxes, autoTax);

  const creditRequiresCustomer = paymentMethod === "CREDIT" && !selectedCustomer?.id;

  async function confirmSale() {
    if (cart.length === 0 || creditRequiresCustomer) return;

    const saleData = {
      items: cart.map((i) => ({ productId: i.productId, quantity: i.quantity })),
      paymentMethod,
      customerId: selectedCustomer?.id,
    };

    if (!isOnline) {
      try {
        await addToQueue(saleData);
        clearCart();
        showMessage("success", `Venta guardada localmente (${saleData.items.length} producto${saleData.items.length > 1 ? "s" : ""}). Se sincronizará al recuperar la conexión.`);
      } catch {
        showMessage("error", "No se pudo guardar la venta localmente.");
      }
      return;
    }

    createSale.mutate({ ...saleData, saleType: "QUICK" });
  }

  const formatCOP = (v: number) =>
    v.toLocaleString("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0 });

  const isPending = createSale.isPending || isSyncing;

  return (
    <div>
      <OfflineBanner
        isOnline={isOnline}
        pendingCount={pendingCount}
        isSyncing={isSyncing}
        syncErrors={syncErrors}
        onManualSync={processQueue}
      />

      <div className="flex h-full flex-col gap-4 lg:flex-row">
        {/* Panel izquierdo: catálogo */}
        <div className="flex flex-col gap-3 lg:w-3/5">
          <div className="flex gap-2">
            <input
              type="search"
              placeholder="Buscar producto..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base shadow-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-200 dark:border-white/10 dark:bg-white/5 dark:text-white dark:focus:border-violet-500 dark:focus:ring-violet-900"
            />
            <button
              type="button"
              onClick={() => setShowScanner(true)}
              className="shrink-0 rounded-xl border border-violet-300 bg-white px-4 py-3 text-base font-semibold text-violet-700 shadow-sm transition hover:bg-violet-50 dark:border-violet-500/40 dark:bg-white/5 dark:text-violet-300 dark:hover:bg-violet-900/20"
            >
              📷
            </button>
          </div>

          {showScanner && (
            <BarcodeScanner onDetected={handleBarcodeDetected} onClose={() => setShowScanner(false)} />
          )}

          {isLoading ? (
            <p className="text-center text-slate-400 dark:text-slate-500">Cargando productos...</p>
          ) : filteredProducts.length === 0 ? (
            <p className="text-center text-slate-400 dark:text-slate-500">Sin resultados</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
              {filteredProducts.map((p: Product) => {
                const inCart = cart.find((i) => i.productId === p.id);
                const outOfStock = p.trackStock && p.stock === 0;
                return (
                  <button
                    key={p.id}
                    onClick={() => addToCart(p)}
                    disabled={outOfStock}
                    className={`flex flex-col rounded-xl border p-3 text-left transition active:scale-95 ${
                      outOfStock
                        ? "cursor-not-allowed border-slate-100 bg-slate-50 opacity-50 dark:border-white/5 dark:bg-white/5"
                        : inCart
                          ? "border-violet-300 bg-violet-50 shadow-sm dark:border-violet-500/50 dark:bg-violet-900/20"
                          : "border-slate-200 bg-white hover:border-violet-200 hover:bg-violet-50/50 dark:border-white/10 dark:bg-white/5 dark:hover:border-violet-500/30 dark:hover:bg-violet-900/10"
                    }`}
                  >
                    <span className="line-clamp-2 text-sm font-medium text-slate-800 dark:text-slate-100">
                      {p.name}
                    </span>
                    <span className="mt-1 text-base font-bold text-violet-600 dark:text-violet-400">
                      {formatCOP(p.price)}
                    </span>
                    <span
                      className={`mt-1 text-xs ${outOfStock ? "text-red-500" : "text-slate-400 dark:text-slate-500"}`}
                    >
                      {outOfStock ? "Sin stock" : p.trackStock ? `${p.stock} disponibles` : "∞ disponibles"}
                    </span>
                    {inCart && (
                      <span className="mt-1 text-xs font-semibold text-violet-600 dark:text-violet-400">
                        En carrito: {inCart.quantity}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Panel derecho: carrito */}
        <div className="flex flex-col gap-3 lg:w-2/5">
          {continuousScan ? (
            <ContinuousScanPanel onScan={handleContinuousScan} onClose={() => setContinuousScan(false)} />
          ) : (
            <button
              type="button"
              onClick={() => setContinuousScan(true)}
              className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-dashed border-violet-300 bg-violet-50/50 text-sm font-medium text-violet-700 transition hover:bg-violet-50 dark:border-violet-500/30 dark:bg-violet-900/10 dark:text-violet-300 dark:hover:bg-violet-900/20"
            >
              📷 Activar escaneo continuo
            </button>
          )}

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/5">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="font-semibold text-slate-700 dark:text-slate-200">Carrito</h2>
              {cart.length > 0 && (
                <span className="ml-auto text-xs text-slate-400 dark:text-slate-500">
                  guardado automáticamente
                </span>
              )}
            </div>

            {cart.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-400 dark:text-slate-500">
                Toca un producto para agregar
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {cart.map((item) => (
                  <li
                    key={item.productId}
                    className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 dark:border-white/5 dark:bg-white/5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                        {item.name}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {formatCOP(item.price)} × {item.quantity} ={" "}
                        {formatCOP(item.price * item.quantity)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={() => updateQty(item.productId, -1)}
                        className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-200 text-lg text-slate-700 transition hover:bg-slate-300 active:scale-95 dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/20"
                      >
                        −
                      </button>
                      <span className="w-5 text-center text-sm font-semibold text-slate-800 dark:text-slate-100">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateQty(item.productId, 1)}
                        className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-200 text-lg text-slate-700 transition hover:bg-slate-300 active:scale-95 dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/20"
                      >
                        +
                      </button>
                      <button
                        onClick={() => removeFromCart(item.productId)}
                        className="ml-1 flex h-9 w-9 items-center justify-center rounded-lg text-lg text-red-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
                      >
                        ×
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {/* Método de pago */}
            {cart.length > 0 && (
              <div className="mt-3">
                <p className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                  Método de pago
                </p>
                <div className="flex gap-2">
                  {(["CASH", "CARD", "TRANSFER", "CREDIT"] as const).map((method) => (
                    <button
                      key={method}
                      onClick={() => setPaymentMethod(method)}
                      className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition ${
                        paymentMethod === method
                          ? "border-violet-400 bg-violet-100 text-violet-700 dark:border-violet-500 dark:bg-violet-900/30 dark:text-violet-300"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-white/10 dark:bg-transparent dark:text-slate-400 dark:hover:border-white/20"
                      }`}
                    >
                      {method === "CASH"
                        ? "Efectivo"
                        : method === "CARD"
                          ? "Tarjeta"
                          : method === "TRANSFER"
                            ? "Transf."
                            : "Crédito"}
                    </button>
                  ))}
                </div>
                {paymentMethod === "CREDIT" && (
                  <div className="mt-2">
                    <CustomerSelector value={selectedCustomer} onChange={setSelectedCustomer} />
                    {creditRequiresCustomer && (
                      <p className="mt-1 text-xs text-red-500">
                        Selecciona un cliente registrado para fiar esta venta.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Desglose de totales */}
            {cart.length > 0 && (
              <div className="mt-3 space-y-1 border-t border-slate-100 pt-3 dark:border-white/10">
                {taxLines.length > 0 && (
                  <div className="flex justify-between text-sm text-slate-500 dark:text-slate-400">
                    <span>Subtotal</span>
                    <span>{formatCOP(subtotal)}</span>
                  </div>
                )}
                {taxLines.map((t) => (
                  <div key={`${t.name}-${t.rate}`} className="flex justify-between text-sm text-slate-500 dark:text-slate-400">
                    <span>{t.name} ({t.rate}%)</span>
                    <span>{formatCOP(t.amount)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500 dark:text-slate-400">Total</span>
                  <span className="text-xl font-bold text-slate-900 dark:text-white">
                    {formatCOP(total)}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Mensajes */}
          {statusMessage && (
            <div
              className={`rounded-xl border px-4 py-3 text-sm font-medium ${
                statusMessage.type === "success"
                  ? "border-green-200 bg-green-50 text-green-700 dark:border-green-500/30 dark:bg-green-900/20 dark:text-green-300"
                  : "border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-900/20 dark:text-red-300"
              }`}
            >
              {statusMessage.text}
            </div>
          )}

          {/* Botón confirmar */}
          <button
            onClick={confirmSale}
            disabled={cart.length === 0 || creditRequiresCustomer || isPending}
            className={`w-full rounded-2xl px-6 py-4 text-lg font-bold text-white shadow-lg transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 ${
              !isOnline
                ? "bg-amber-500 hover:bg-amber-400"
                : "bg-violet-600 hover:bg-violet-500"
            }`}
          >
            {isPending
              ? "Procesando..."
              : !isOnline
                ? `Guardar sin conexión${cart.length > 0 ? ` · ${formatCOP(total)}` : ""}`
                : `Confirmar venta${cart.length > 0 ? ` · ${formatCOP(total)}` : ""}`}
          </button>

          {/* Limpiar carrito con confirmación */}
          {cart.length > 0 && (
            <>
              {showClearConfirm ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm dark:border-red-500/30 dark:bg-red-900/10">
                  <p className="mb-2 font-medium text-red-700 dark:text-red-300">
                    ¿Borrar el carrito? Se perderán los ítems actuales.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={clearCart}
                      className="flex-1 rounded-lg bg-red-600 py-1.5 text-sm font-semibold text-white hover:bg-red-700"
                    >
                      Sí, limpiar
                    </button>
                    <button
                      onClick={() => setShowClearConfirm(false)}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-50 dark:border-white/10"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowClearConfirm(true)}
                  className="text-center text-sm text-slate-400 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400"
                >
                  Limpiar carrito
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
