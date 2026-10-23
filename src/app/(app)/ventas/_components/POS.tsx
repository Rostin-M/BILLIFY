"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Camera, ScanLine } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useOfflineQueue } from "~/hooks/useOfflineQueue";
import type { SyncInput } from "~/lib/offlineQueue";
import { api } from "~/trpc/react";
import { OfflineBanner } from "./OfflineBanner";
import type { ScanResult } from "~/app/_components/ContinuousScanPanel";
import { CashChange } from "~/app/_components/CashChange";
import { ReceiptPhotoButton } from "~/app/_components/ReceiptPhotoButton";
import { SpecialItemPrompt } from "~/app/_components/SpecialItemPrompt";
import { CustomerSelector, CONSUMIDOR_FINAL } from "./CustomerSelector";
import { computeSaleTotals, type TaxConfig } from "~/lib/pricing";
import { matchesSearch, pickOnEnter, usePosShortcuts } from "./usePosShortcuts";
import { formatCOP } from "~/lib/format/money";

// Cámara y lector (@zxing) solo se descargan al abrir el escáner, no con la pantalla.
const BarcodeScanner = dynamic(() => import("~/app/_components/BarcodeScanner").then((m) => m.BarcodeScanner), {
  ssr: false,
});
const ContinuousScanPanel = dynamic(
  () => import("~/app/_components/ContinuousScanPanel").then((m) => m.ContinuousScanPanel),
  { ssr: false },
);

type PaymentMethod = "CASH" | "CARD" | "CREDIT" | "TRANSFER";

type SelectedCustomer = { id?: string; name: string; document?: string; email?: string | null; isGuestWithDoc?: boolean };

type CartItem = {
  cartItemId: string;
  productId: string;
  name: string;
  price: number;
  quantity: number;
  taxSlots: number[];
  weightKg?: number;
  customAmount?: number;
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
  brand: string | null;
  presentation: string | null;
  openPrice: boolean;
  soldByWeight: boolean;
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

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Efectivo",
  CARD: "Tarjeta",
  TRANSFER: "Transferencia",
  CREDIT: "Fiado",
};

function productPriceLabel(p: Product, formatCOP: (v: number) => string): string {
  if (p.openPrice) return "Monto libre";
  if (p.soldByWeight) return `${formatCOP(p.price)}/kg`;
  return formatCOP(p.price);
}

function stockAvailabilityLabel(p: Product, outOfStock: boolean): string {
  if (outOfStock) return "Sin stock";
  if (p.trackStock) return `${p.stock} disponibles`;
  return "Sin control de stock";
}

function productTileClassName(outOfStock: boolean, inCartQty: number): string {
  if (outOfStock) return "cursor-not-allowed border-slate-100 bg-slate-50 opacity-50 dark:border-white/5 dark:bg-white/5";
  if (inCartQty > 0) return "border-violet-300 bg-violet-50 shadow-sm dark:border-violet-500/50 dark:bg-violet-900/20";
  return "border-slate-200 bg-white hover:border-violet-200 hover:bg-violet-50/50 dark:border-white/10 dark:bg-white/5 dark:hover:border-violet-500/30 dark:hover:bg-violet-900/10";
}

function ProductGrid({
  isLoading,
  hasAnyProducts,
  filteredProducts,
  cart,
  onProductTap,
  formatCOP,
}: Readonly<{
  isLoading: boolean;
  hasAnyProducts: boolean;
  filteredProducts: Product[];
  cart: CartItem[];
  onProductTap: (p: Product) => void;
  formatCOP: (v: number) => string;
}>) {
  if (isLoading) {
    return <p className="text-center text-slate-500 dark:text-slate-400">Cargando productos...</p>;
  }
  if (filteredProducts.length === 0) {
    if (!hasAnyProducts) {
      return (
        <div className="py-6 text-center">
          <p className="font-medium text-slate-700 dark:text-slate-200">Aún no tienes productos</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Agrégalos en el catálogo para empezar a vender.</p>
          <Link
            href="/productos"
            className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-700"
          >
            Agregar productos
          </Link>
        </div>
      );
    }
    return (
      <p className="py-4 text-center text-sm text-slate-500 dark:text-slate-400">
        Ningún producto coincide con la búsqueda.
      </p>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-2 xl:grid-cols-3">
      {filteredProducts.map((p) => {
        const inCartQty = cart.filter((i) => i.productId === p.id).reduce((s, i) => s + i.quantity, 0);
        const outOfStock = p.trackStock && p.stock === 0;
        return (
          <button
            key={p.id}
            onClick={() => onProductTap(p)}
            disabled={outOfStock}
            className={`flex flex-col rounded-xl border p-3 text-left transition active:scale-95 ${productTileClassName(outOfStock, inCartQty)}`}
          >
            <span className="line-clamp-2 text-sm font-medium text-slate-800 dark:text-slate-100">{p.name}</span>
            {(p.brand ?? p.presentation) && (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {[p.brand, p.presentation].filter(Boolean).join(" · ")}
              </span>
            )}
            <span className="mt-1 text-base font-bold text-violet-600 dark:text-violet-400">
              {productPriceLabel(p, formatCOP)}
            </span>
            <span className={`mt-1 text-xs ${outOfStock ? "text-red-500" : "text-slate-500 dark:text-slate-400"}`}>
              {stockAvailabilityLabel(p, outOfStock)}
            </span>
            {inCartQty > 0 && (
              <span className="mt-1 text-xs font-semibold text-violet-600 dark:text-violet-400">
                En carrito: {inCartQty}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function CartList({
  cart,
  onUpdateQty,
  onRemove,
  formatCOP,
  flash,
}: Readonly<{
  cart: CartItem[];
  onUpdateQty: (cartItemId: string, delta: number) => void;
  onRemove: (cartItemId: string) => void;
  formatCOP: (v: number) => string;
  /** Línea recién agregada: se ilumina (n cambia en cada toque para repetir el destello). */
  flash: { key: string; n: number } | null;
}>) {
  if (cart.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-slate-500 dark:text-slate-400">
        Toca un producto para agregar
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {/* Lo último que se agregó va arriba. */}
      {[...cart].reverse().map((item) => {
        const isSpecial = item.weightKg != null || item.customAmount != null;
        const flashed = flash?.key === item.cartItemId;
        return (
          <li
            key={flashed ? `${item.cartItemId}-${flash.n}` : item.cartItemId}
            className={`flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 dark:border-white/5 dark:bg-white/5 ${flashed ? "cart-flash" : ""}`}
          >
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-sm font-medium text-slate-800 dark:text-slate-100">{item.name}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isSpecial
                  ? formatCOP(item.price)
                  : `${formatCOP(item.price)} × ${item.quantity} = ${formatCOP(item.price * item.quantity)}`}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {isSpecial ? (
                <button
                  onClick={() => onRemove(item.cartItemId)}
                  aria-label={`Quitar ${item.name}`}
                  className="flex h-10 w-10 items-center justify-center rounded-lg text-lg text-red-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
                >
                  ×
                </button>
              ) : (
                <>
                  <button
                    onClick={() => onUpdateQty(item.cartItemId, -1)}
                    aria-label={`Quitar una unidad de ${item.name}`}
                    className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-200 text-lg text-slate-700 transition hover:bg-slate-300 active:scale-95 dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/20"
                  >
                    −
                  </button>
                  <span className="w-5 text-center text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {item.quantity}
                  </span>
                  <button
                    onClick={() => onUpdateQty(item.cartItemId, 1)}
                    aria-label={`Agregar una unidad de ${item.name}`}
                    className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-200 text-lg text-slate-700 transition hover:bg-slate-300 active:scale-95 dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/20"
                  >
                    +
                  </button>
                  <button
                    onClick={() => onRemove(item.cartItemId)}
                    aria-label={`Quitar ${item.name}`}
                    className="ml-1 flex h-10 w-10 items-center justify-center rounded-lg text-lg text-red-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
                  >
                    ×
                  </button>
                </>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function ScanControls({
  search,
  onSearchChange,
  onSearchEnter,
  searchRef,
  onSingleScan,
  continuousScan,
  onToggleContinuousScan,
}: Readonly<{
  search: string;
  onSearchChange: (v: string) => void;
  onSearchEnter: () => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
  onSingleScan: () => void;
  continuousScan: boolean;
  onToggleContinuousScan: () => void;
}>) {
  return (
    <div className="flex gap-2">
      <input
        ref={searchRef}
        type="search"
        aria-label="Buscar producto por nombre, categoría o código"
        aria-keyshortcuts="/ F2"
        placeholder="Buscar producto o código..."
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            onSearchEnter();
          } else if (e.key === "Escape" && search) {
            e.preventDefault();
            onSearchChange("");
          }
        }}
        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base shadow-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500 dark:border-white/10 dark:bg-white/5 dark:text-white dark:focus:border-violet-500 dark:focus:ring-violet-400"
      />
      <button
        type="button"
        onClick={onSingleScan}
        aria-label="Escanear código de barras"
        className="shrink-0 rounded-xl border border-violet-300 bg-white px-3.5 py-3 text-base font-semibold text-violet-700 shadow-sm transition hover:bg-violet-50 dark:border-violet-500/40 dark:bg-white/5 dark:text-violet-300 dark:hover:bg-violet-900/20"
      >
        <Camera className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={onToggleContinuousScan}
        aria-label={continuousScan ? "Detener escaneo continuo" : "Activar escaneo continuo"}
        title={continuousScan ? "Detener escaneo continuo" : "Activar escaneo continuo"}
        className={`shrink-0 rounded-xl border px-3.5 py-3 text-base font-semibold shadow-sm transition ${
          continuousScan
            ? "border-violet-500 bg-violet-600 text-white hover:bg-violet-700"
            : "border-violet-300 bg-white text-violet-700 hover:bg-violet-50 dark:border-violet-500/40 dark:bg-white/5 dark:text-violet-300 dark:hover:bg-violet-900/20"
        }`}
      >
        <ScanLine className="h-5 w-5" />
      </button>
    </div>
  );
}

function TotalsAndPayment({
  cart,
  paymentMethod,
  onPaymentMethodChange,
  creditRequiresCustomer,
  receiptPath,
  onReceiptPathChange,
  subtotal,
  taxLines,
  total,
  formatCOP,
  statusMessage,
  confirmButtonLabel,
  onConfirm,
  isPending,
  isOnline,
  showClearConfirm,
  onShowClearConfirm,
  onClearCart,
}: Readonly<{
  cart: CartItem[];
  paymentMethod: PaymentMethod;
  onPaymentMethodChange: (m: PaymentMethod) => void;
  creditRequiresCustomer: boolean;
  receiptPath: string | null;
  onReceiptPathChange: (v: string | null) => void;
  subtotal: number;
  taxLines: { name: string; rate: number; amount: number }[];
  total: number;
  formatCOP: (v: number) => string;
  statusMessage: { type: "success" | "error"; text: string } | null;
  confirmButtonLabel: string;
  onConfirm: () => void;
  isPending: boolean;
  isOnline: boolean;
  showClearConfirm: boolean;
  onShowClearConfirm: (v: boolean) => void;
  onClearCart: () => void;
}>) {
  return (
    <div className="flex flex-col gap-3">
      {cart.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">
            Método de pago
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-2 xl:grid-cols-4">
            {(["CASH", "CARD", "TRANSFER", "CREDIT"] as const).map((method) => (
              <button
                key={method}
                onClick={() => onPaymentMethodChange(method)}
                aria-pressed={paymentMethod === method}
                className={`min-h-11 rounded-lg border px-2 text-sm leading-tight font-medium transition ${
                  paymentMethod === method
                    ? "border-violet-400 bg-violet-100 text-violet-700 dark:border-violet-500 dark:bg-violet-900/30 dark:text-violet-300"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-white/10 dark:bg-transparent dark:text-slate-400 dark:hover:border-white/20"
                }`}
              >
                {PAYMENT_METHOD_LABELS[method]}
              </button>
            ))}
          </div>
          {paymentMethod === "CREDIT" && creditRequiresCustomer && (
            <p className="mt-1 text-xs text-red-500">
              Selecciona un cliente registrado (arriba, en &quot;Cliente&quot;) para fiar esta venta.
            </p>
          )}
          {paymentMethod === "TRANSFER" && (
            <div className="mt-2">
              <ReceiptPhotoButton value={receiptPath} onChange={onReceiptPathChange} />
            </div>
          )}
          {paymentMethod === "CASH" && <CashChange key={total} total={total} />}
        </div>
      )}

      {cart.length > 0 && (
        <div className="space-y-1 border-t border-slate-100 pt-3 dark:border-white/10">
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

      {statusMessage && (
        <div
          role={statusMessage.type === "error" ? "alert" : "status"}
          className={`rounded-xl border px-4 py-3 text-sm font-medium ${
            statusMessage.type === "success"
              ? "border-green-200 bg-green-50 text-green-700 dark:border-green-500/30 dark:bg-green-900/20 dark:text-green-300"
              : "border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-900/20 dark:text-red-300"
          }`}
        >
          {statusMessage.text}
        </div>
      )}

      <button
        onClick={onConfirm}
        aria-keyshortcuts="Control+Enter F12"
        title="Atajo: Ctrl + Enter"
        disabled={cart.length === 0 || creditRequiresCustomer || isPending}
        aria-busy={isPending}
        className={`w-full rounded-2xl px-4 py-4 text-base font-bold xl:text-lg text-white shadow-lg transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 ${
          !isOnline
            ? "bg-amber-500 hover:bg-amber-400"
            : "bg-violet-600 hover:bg-violet-700"
        }`}
      >
        {confirmButtonLabel}
      </button>

      {cart.length > 0 && (
        <>
          {showClearConfirm ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm dark:border-red-500/30 dark:bg-red-900/10">
              <p className="mb-2 font-medium text-red-700 dark:text-red-300">
                ¿Borrar el carrito? Se perderán los ítems actuales.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={onClearCart}
                  className="min-h-11 flex-1 rounded-lg bg-red-600 text-sm font-semibold text-white hover:bg-red-700"
                >
                  Sí, limpiar
                </button>
                <button
                  onClick={() => onShowClearConfirm(false)}
                  className="min-h-11 rounded-lg border border-slate-200 px-4 text-sm text-slate-500 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => onShowClearConfirm(true)}
              className="min-h-11 text-center text-sm text-slate-500 hover:text-red-500 dark:text-slate-400 dark:hover:text-red-400"
            >
              Limpiar carrito
            </button>
          )}
        </>
      )}
    </div>
  );
}

type POSProps = {
  taxes: TaxConfig[];
  autoTax: boolean;
  /** Usuario y negocio de la sesión: las ventas sin conexión quedan ligadas a ellos. */
  userId: string;
  businessId: string;
};

export function PointOfSale({ taxes, autoTax, userId, businessId }: Readonly<POSProps>) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [selectedCustomer, setSelectedCustomer] = useState<SelectedCustomer | null>(CONSUMIDOR_FINAL);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [continuousScan, setContinuousScan] = useState(false);
  const [receiptPath, setReceiptPath] = useState<string | null>(null);
  const [specialPrompt, setSpecialPrompt] = useState<{ product: Product; mode: "weight" | "amount" } | null>(null);
  // Clave de idempotencia de la venta en curso: se genera al confirmar y se reutiliza si el
  // usuario reintenta (error de red, doble clic). Cambiar el carrito implica una venta nueva.
  const saleKeyRef = useRef<string | null>(null);
  // Zona de carrito y cobro: la barra fija de móvil se oculta cuando ya está en pantalla.
  const checkoutRef = useRef<HTMLDivElement>(null);
  const [checkoutVisible, setCheckoutVisible] = useState(false);
  const cartListRef = useRef<HTMLDivElement>(null);
  const [flash, setFlash] = useState<{ key: string; n: number } | null>(null);

  function markAdded(key: string) {
    setFlash((f) => ({ key, n: (f?.n ?? 0) + 1 }));
    cartListRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }

  useEffect(() => {
    const el = checkoutRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setCheckoutVisible(entry?.isIntersecting ?? false), {
      threshold: 0.25,
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    saleKeyRef.current = null;
  }, [cart, paymentMethod, selectedCustomer, receiptPath]);

  useEffect(() => {
    setCart(loadLS<CartItem[]>(QUICK_CART_KEY, []));
    setPaymentMethod(loadLS<PaymentMethod>(QUICK_PAYMENT_KEY, "CASH"));
    setSelectedCustomer(loadLS<SelectedCustomer | null>(QUICK_CUSTOMER_KEY, CONSUMIDOR_FINAL));
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

  // Mutación aparte para reenviar la cola: la de arriba limpia el carrito al terminar y
  // no debe borrar la venta que el cajero está armando mientras se sincroniza.
  const syncSale = api.sale.create.useMutation();

  const syncFn = useCallback(
    async (sale: SyncInput) => {
      await syncSale.mutateAsync({ ...sale, saleType: "QUICK" });
      void utils.sale.list.invalidate();
      void utils.product.search.invalidate();
      void utils.product.list.invalidate();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const {
    isOnline,
    pendingCount,
    legacySales,
    isSyncing,
    syncErrors,
    addToQueue,
    processQueue,
    discardLegacy,
  } = useOfflineQueue(syncFn, { userId, businessId });

  function showMessage(type: "success" | "error", text: string) {
    setStatusMessage({ type, text });
    if (type === "success") setTimeout(() => setStatusMessage(null), 4000);
  }

  function clearCart() {
    setCart([]);
    setPaymentMethod("CASH");
    setSelectedCustomer(CONSUMIDOR_FINAL);
    setReceiptPath(null);
    localStorage.removeItem(QUICK_CART_KEY);
    localStorage.removeItem(QUICK_PAYMENT_KEY);
    localStorage.removeItem(QUICK_CUSTOMER_KEY);
    setShowClearConfirm(false);
  }

  const filteredProducts = products.filter((p: Product) => matchesSearch(p, search));
  const searchRef = useRef<HTMLInputElement>(null);

  // Enter en la búsqueda: código de barras exacto (lector USB) o único resultado.
  function handleSearchEnter() {
    const product = pickOnEnter(search, filteredProducts, products);
    if (product) handleProductTap(product);
    else if (search.trim()) showMessage("error", `Ningún producto coincide con "${search.trim()}".`);
  }

  function stockLimitReached(product: Pick<Product, "name" | "stock" | "trackStock">, qtyInCart: number) {
    if (!product.trackStock || qtyInCart < product.stock) return false;
    const units = product.stock === 1 ? "unidad" : "unidades";
    showMessage(
      "error",
      product.stock === 0
        ? `${product.name} no tiene unidades disponibles.`
        : `Solo hay ${product.stock} ${units} de ${product.name}.`,
    );
    return true;
  }

  function addToCart(product: Product) {
    if (stockLimitReached(product, cart.find((i) => i.cartItemId === product.id)?.quantity ?? 0)) return;
    setCart((prev) => {
      const existing = prev.find((i) => i.cartItemId === product.id);
      if (existing) {
        if (product.trackStock && existing.quantity >= product.stock) return prev;
        // Al final del arreglo = arriba en la lista.
        return [...prev.filter((i) => i !== existing), { ...existing, quantity: existing.quantity + 1 }];
      }
      if (product.trackStock && product.stock === 0) return prev;
      return [
        ...prev,
        { cartItemId: product.id, productId: product.id, name: product.name, price: product.price, quantity: 1, taxSlots: product.taxSlots },
      ];
    });
    markAdded(product.id);
    if (search) setSearch("");
  }

  function addSpecialToCart(product: Product, value: number) {
    const cartItemId = `${product.id}-${crypto.randomUUID()}`;
    if (product.soldByWeight) {
      const lineTotal = Math.ceil((product.price * value) / 100) * 100;
      setCart((prev) => [
        ...prev,
        { cartItemId, productId: product.id, name: `${product.name} (${value} kg)`, price: lineTotal, quantity: 1, taxSlots: product.taxSlots, weightKg: value },
      ]);
    } else {
      setCart((prev) => [
        ...prev,
        { cartItemId, productId: product.id, name: product.name, price: value, quantity: 1, taxSlots: product.taxSlots, customAmount: value },
      ]);
    }
    markAdded(cartItemId);
    setSpecialPrompt(null);
    if (search) setSearch("");
  }

  function handleProductTap(product: Product) {
    if (product.openPrice) {
      setSpecialPrompt({ product, mode: "amount" });
      return;
    }
    if (product.soldByWeight) {
      setSpecialPrompt({ product, mode: "weight" });
      return;
    }
    addToCart(product);
  }

  function handleBarcodeDetected(code: string) {
    setShowScanner(false);
    const product = products.find((p: Product) => p.barcode === code);
    if (!product) {
      showMessage("error", `Ningún producto tiene el código ${code}.`);
      return;
    }
    if (product.openPrice || product.soldByWeight) {
      handleProductTap(product);
      return;
    }
    addToCart(product);
    showMessage("success", `${product.name} agregado al carrito.`);
  }

  function handleContinuousScan(code: string): ScanResult {
    const product = products.find((p: Product) => p.barcode === code);
    if (!product) return { ok: false, code };
    if (product.openPrice || product.soldByWeight) {
      handleProductTap(product);
      return { ok: true, name: `${product.name} — confirma el monto/peso` };
    }
    addToCart(product);
    return { ok: true, name: product.name };
  }

  function updateQty(cartItemId: string, delta: number) {
    if (delta > 0) {
      const line = cart.find((i) => i.cartItemId === cartItemId);
      const product = products.find((p: Product) => p.id === line?.productId);
      if (line && product && stockLimitReached(product, line.quantity)) return;
    }
    setCart((prev) =>
      prev
        .map((i) => {
          if (i.cartItemId !== cartItemId) return i;
          const newQty = i.quantity + delta;
          if (delta > 0) {
            const product = products.find((p: Product) => p.id === i.productId);
            if (product?.trackStock && newQty > product.stock) return i;
          }
          return { ...i, quantity: newQty };
        })
        .filter((i) => i.quantity > 0),
    );
  }

  function removeFromCart(cartItemId: string) {
    setCart((prev) => prev.filter((i) => i.cartItemId !== cartItemId));
  }

  const { subtotal, taxLines, total } = computeSaleTotals(cart, taxes, autoTax);

  const creditRequiresCustomer = paymentMethod === "CREDIT" && !selectedCustomer?.id;

  async function confirmSale() {
    if (cart.length === 0 || creditRequiresCustomer || createSale.isPending) return;

    saleKeyRef.current ??= crypto.randomUUID();

    const saleData = {
      items: cart.map((i) => ({ productId: i.productId, quantity: i.quantity, weightKg: i.weightKg, customAmount: i.customAmount })),
      paymentMethod,
      customerId: selectedCustomer?.id,
      receiptPath: receiptPath ?? undefined,
      idempotencyKey: saleKeyRef.current,
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

  const isPending = createSale.isPending || isSyncing;

  usePosShortcuts(searchRef, () => void confirmSale());

  const cartUnits = cart.reduce((n, i) => n + i.quantity, 0);
  const cartTotalSuffix = cart.length > 0 ? ` · ${formatCOP(total)}` : "";
  let confirmButtonLabel: string;
  if (isPending) {
    confirmButtonLabel = "Procesando...";
  } else if (!isOnline) {
    confirmButtonLabel = `Guardar sin conexión${cartTotalSuffix}`;
  } else {
    confirmButtonLabel = `Confirmar venta${cartTotalSuffix}`;
  }

  return (
    <div>
      {specialPrompt && (
        <SpecialItemPrompt
          product={specialPrompt.product}
          mode={specialPrompt.mode}
          onConfirm={(value) => addSpecialToCart(specialPrompt.product, value)}
          onCancel={() => setSpecialPrompt(null)}
        />
      )}
      <OfflineBanner
        isOnline={isOnline}
        pendingCount={pendingCount}
        isSyncing={isSyncing}
        syncErrors={syncErrors}
        onManualSync={processQueue}
        legacySales={legacySales}
        onDiscardLegacy={discardLegacy}
      />

      {/* Cliente — siempre visible arriba de todo, identificado o Consumidor Final */}
      <div className="mb-3">
        <p className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">Cliente</p>
        <CustomerSelector value={selectedCustomer} onChange={setSelectedCustomer} />
      </div>

      {/* Un solo árbol para todos los tamaños: el escáner (cámara) se monta una sola vez.
          Móvil: catálogo y carrito uno sobre otro, cada uno con su scroll, y barra fija para ir
          a cobrar. Escritorio: catálogo a la izquierda y carrito fijo a la derecha. */}
      <div className="grid grid-cols-1 gap-3 pb-24 md:grid-cols-[minmax(0,1fr)_19rem] md:items-start md:gap-4 md:pb-0 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex min-w-0 flex-col gap-3">
          <ScanControls
            search={search}
            onSearchChange={setSearch}
            onSearchEnter={handleSearchEnter}
            searchRef={searchRef}
            onSingleScan={() => setShowScanner(true)}
            continuousScan={continuousScan}
            onToggleContinuousScan={() => setContinuousScan((v) => !v)}
          />
          {showScanner && (
            <BarcodeScanner onDetected={handleBarcodeDetected} onClose={() => setShowScanner(false)} />
          )}
          {continuousScan && (
            <ContinuousScanPanel onScan={handleContinuousScan} onClose={() => setContinuousScan(false)} />
          )}
          <div className="max-h-[32dvh] overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-white p-3 shadow-sm md:max-h-[calc(100dvh-15rem)] dark:border-white/10 dark:bg-white/5">
            <ProductGrid
              isLoading={isLoading}
              hasAnyProducts={products.length > 0}
              filteredProducts={filteredProducts}
              cart={cart}
              onProductTap={handleProductTap}
              formatCOP={formatCOP}
            />
          </div>
        </div>

        <div className="flex flex-col gap-3 md:sticky md:top-20">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/5">
            <div className="mb-3 flex items-baseline gap-2">
              <h2 className="font-semibold text-slate-700 dark:text-slate-200">Carrito</h2>
              {cart.length > 0 && (
                <>
                  <span className="whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">
                    {cartUnits} {cartUnits === 1 ? "producto" : "productos"}
                  </span>
                  <span className="ml-auto hidden whitespace-nowrap text-xs text-slate-500 min-[400px]:inline dark:text-slate-400">lo último, arriba</span>
                </>
              )}
            </div>
            <div ref={cartListRef} className="max-h-[24dvh] overflow-y-auto overscroll-contain md:max-h-[calc(100dvh-30rem)] md:min-h-24">
              <CartList cart={cart} onUpdateQty={updateQty} onRemove={removeFromCart} formatCOP={formatCOP} flash={flash} />
            </div>
            <div ref={checkoutRef} className="mt-3 scroll-mt-20">
              <TotalsAndPayment
                cart={cart}
                paymentMethod={paymentMethod}
                onPaymentMethodChange={setPaymentMethod}
                creditRequiresCustomer={creditRequiresCustomer}
                receiptPath={receiptPath}
                onReceiptPathChange={setReceiptPath}
                subtotal={subtotal}
                taxLines={taxLines}
                total={total}
                formatCOP={formatCOP}
                statusMessage={statusMessage}
                confirmButtonLabel={confirmButtonLabel}
                onConfirm={confirmSale}
                isPending={isPending}
                isOnline={isOnline}
                showClearConfirm={showClearConfirm}
                onShowClearConfirm={setShowClearConfirm}
                onClearCart={clearCart}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Móvil/tablet: acceso fijo al cobro mientras se eligen productos (encima del menú inferior). */}
      {cart.length > 0 && !checkoutVisible && (
        <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 px-3 pb-2 md:hidden">
          <button
            type="button"
            onClick={() => checkoutRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
            className="flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl bg-violet-600 px-5 text-white shadow-xl shadow-violet-900/30 transition active:scale-[0.98]"
          >
            <span className="text-sm font-medium">
              {cartUnits} {cartUnits === 1 ? "producto" : "productos"}
            </span>
            <span className="flex items-center gap-2 text-base font-bold">
              {formatCOP(total)} · Cobrar
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
