"use client";

import dynamic from "next/dynamic";
import { Camera, CheckCircle2, ScanLine } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "~/trpc/react";
import type { BusinessInfoForPdf, SaleForPdf } from "~/lib/pdf/FacturaPDF";
import { CustomerSelector, CONSUMIDOR_FINAL } from "./CustomerSelector";
import type { ScanResult } from "~/app/_components/ContinuousScanPanel";
import { SpecialItemPrompt } from "~/app/_components/SpecialItemPrompt";
import { computeItemTaxBreakdown, computeSaleTotals, type TaxConfig } from "~/lib/pricing";
import { matchesSearch, pickOnEnter, usePosShortcuts } from "./usePosShortcuts";
import { useDialog } from "~/app/_components/ui/useDialog";
import { formatCOP } from "~/lib/format/money";

type PaymentMethod = "CASH" | "CARD" | "CREDIT" | "TRANSFER";

const FacturaPdfActions = dynamic(
  () => import("~/lib/pdf/FacturaPdfActions").then((m) => m.FacturaPdfActions),
  { ssr: false, loading: () => <span className="text-xs text-slate-500">Generando PDF…</span> },
);

// Cámara y lector (@zxing) solo se descargan al abrir el escáner, no con la pantalla.
const BarcodeScanner = dynamic(() => import("~/app/_components/BarcodeScanner").then((m) => m.BarcodeScanner), {
  ssr: false,
});
const ContinuousScanPanel = dynamic(
  () => import("~/app/_components/ContinuousScanPanel").then((m) => m.ContinuousScanPanel),
  { ssr: false },
);

type SelectedCustomer = { id?: string; name: string; document?: string; email?: string | null; isGuestWithDoc?: boolean };

type CartItem = {
  /** Solo en líneas de peso o monto libre: cada una es una línea aparte del mismo producto. */
  cartItemId?: string;
  productId: string;
  name: string;
  price: number;
  quantity: number;
  unit: string;
  taxSlots: number[];
  weightKg?: number;
  customAmount?: number;
};

/** Identificador de la línea (los carritos guardados antes no traen cartItemId). */
const lineKey = (i: CartItem) => i.cartItemId ?? i.productId;
const isSpecialLine = (i: CartItem) => i.weightKg != null || i.customAmount != null;

type Product = {
  id: string;
  name: string;
  price: number;
  unit: string;
  stock: number;
  trackStock: boolean;
  category: string | null;
  barcode: string | null;
  taxSlots: number[];
  openPrice: boolean;
  soldByWeight: boolean;
};

const PAYMENT_LABELS: Record<string, string> = {
  CASH: "Efectivo",
  CARD: "Tarjeta",
  TRANSFER: "Transferencia",
  CREDIT: "Fiado",
};

const CART_KEY = "billify_invoice_cart";
const CUSTOMER_KEY = "billify_invoice_customer";
const NOTE_KEY = "billify_invoice_note";
const PAYMENT_KEY = "billify_invoice_payment";

function loadLS<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function tileClassName(outOfStock: boolean, inCart: boolean): string {
  if (outOfStock) return "cursor-not-allowed border-slate-100 bg-slate-50 opacity-50 dark:border-white/5 dark:bg-white/5";
  if (inCart) return "border-violet-300 bg-violet-50 shadow-sm dark:border-violet-500/50 dark:bg-violet-900/20";
  return "border-slate-200 bg-white hover:border-violet-200 hover:bg-violet-50/50 dark:border-white/10 dark:bg-white/5 dark:hover:border-violet-500/30 dark:hover:bg-violet-900/10";
}

function stockLabel(p: Product, outOfStock: boolean): string {
  if (outOfStock) return "Sin stock";
  if (p.trackStock) return `${p.stock} disp.`;
  return "Sin control de stock";
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

function InvoiceProductGrid({
  statusMessage,
  filteredProducts,
  cart,
  onAdd,
  formatCOP,
}: Readonly<{
  statusMessage: string | null;
  filteredProducts: Product[];
  cart: CartItem[];
  onAdd: (p: Product) => void;
  formatCOP: (v: number) => string;
}>) {
  if (statusMessage) {
    return <p className="text-center text-slate-500 dark:text-slate-400">{statusMessage}</p>;
  }
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-2 xl:grid-cols-3">
      {filteredProducts.map((p) => {
        const inCartQty = cart.filter((i) => i.productId === p.id).reduce((n, i) => n + i.quantity, 0);
        const outOfStock = p.trackStock && p.stock === 0;
        let priceLabel = formatCOP(p.price);
        if (p.openPrice) priceLabel = "Monto libre";
        else if (p.soldByWeight) priceLabel = `${formatCOP(p.price)}/kg`;
        return (
          <button
            key={p.id}
            onClick={() => onAdd(p)}
            disabled={outOfStock}
            className={`flex flex-col rounded-xl border p-3 text-left transition active:scale-95 ${tileClassName(outOfStock, inCartQty > 0)}`}
          >
            <span className="line-clamp-2 text-sm font-medium text-slate-800 dark:text-slate-100">
              {p.name}
            </span>
            <span className="mt-1 text-base font-bold text-violet-600 dark:text-violet-400">
              {priceLabel}
            </span>
            <span className={`mt-1 text-xs ${outOfStock ? "text-red-500" : "text-slate-500 dark:text-slate-400"}`}>
              {stockLabel(p, outOfStock)}
            </span>
            {inCartQty > 0 && (
              <span className="mt-1 text-xs font-semibold text-violet-600 dark:text-violet-400">
                En factura: {inCartQty}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function InvoiceCartList({
  cart,
  onUpdateQty,
  onRemove,
  formatCOP,
}: Readonly<{
  cart: CartItem[];
  onUpdateQty: (key: string, delta: number) => void;
  onRemove: (key: string) => void;
  formatCOP: (v: number) => string;
}>) {
  if (cart.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-slate-500 dark:text-slate-400">
        Toca un producto para agregar a la factura
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {cart.map((item) => (
        <li
          key={lineKey(item)}
          className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 dark:border-white/5 dark:bg-white/5"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
              {item.name}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {isSpecialLine(item) ? formatCOP(item.price) : `${formatCOP(item.price)} × ${item.quantity}`}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {!isSpecialLine(item) && (
              <>
                <button
                  onClick={() => onUpdateQty(lineKey(item), -1)}
                  aria-label={`Quitar una unidad de ${item.name}`}
                  className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-200 text-lg text-slate-700 transition hover:bg-slate-300 active:scale-95 dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/20"
                >
                  −
                </button>
                <span className="w-5 text-center text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {item.quantity}
                </span>
                <button
                  onClick={() => onUpdateQty(lineKey(item), 1)}
                  aria-label={`Agregar una unidad de ${item.name}`}
                  className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-200 text-lg text-slate-700 transition hover:bg-slate-300 active:scale-95 dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/20"
                >
                  +
                </button>
              </>
            )}
            <button
              onClick={() => onRemove(lineKey(item))}
              aria-label={`Quitar ${item.name}`}
              className="ml-1 flex h-10 w-10 items-center justify-center rounded-lg text-lg text-red-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
            >
              ×
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function FactureBottom({
  cart,
  paymentMethod,
  onPaymentMethodChange,
  note,
  onNoteChange,
  subtotal,
  taxLines,
  total,
  formatCOP,
  errorMessage,
  confirmButtonLabel,
  onConfirm,
  isPending,
  creditRequiresCustomer,
  showClearConfirm,
  onShowClearConfirm,
  onClearCart,
}: Readonly<{
  cart: CartItem[];
  paymentMethod: PaymentMethod;
  onPaymentMethodChange: (m: PaymentMethod) => void;
  note: string;
  onNoteChange: (v: string) => void;
  subtotal: number;
  taxLines: { name: string; rate: number; amount: number }[];
  total: number;
  formatCOP: (v: number) => string;
  errorMessage?: string;
  confirmButtonLabel: string;
  onConfirm: () => void;
  isPending: boolean;
  creditRequiresCustomer: boolean;
  showClearConfirm: boolean;
  onShowClearConfirm: (v: boolean) => void;
  onClearCart: () => void;
}>) {
  return (
    <div className="flex flex-col gap-3">
      {/* Método de pago */}
      {cart.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">
            Método de pago
          </p>
          <div className="grid grid-cols-2 gap-2">
            {(["CASH", "CARD", "TRANSFER", "CREDIT"] as const).map((method) => (
              <button
                key={method}
                onClick={() => onPaymentMethodChange(method)}
                aria-pressed={paymentMethod === method}
                className={`min-h-11 rounded-lg border px-2 text-sm font-medium transition ${
                  paymentMethod === method
                    ? "border-violet-400 bg-violet-100 text-violet-700 dark:border-violet-500 dark:bg-violet-900/30 dark:text-violet-300"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-white/10 dark:bg-transparent dark:text-slate-400 dark:hover:border-white/20"
                }`}
              >
                {PAYMENT_LABELS[method]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Nota */}
      {cart.length > 0 && (
        <div>
          <label htmlFor="invoice-note" className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
            {paymentMethod === "CREDIT" ? "Nota del fiado (opcional)" : "Nota (opcional)"}
          </label>
          <textarea
            id="invoice-note"
            value={note}
            onChange={(e) => onNoteChange(e.target.value)}
            rows={2}
            placeholder={
              paymentMethod === "CREDIT"
                ? "Ej: paga el viernes"
                : "Referencia de pago, observación..."
            }
            className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-base outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-500 sm:text-sm dark:border-white/10 dark:bg-white/5 dark:text-white dark:focus:border-violet-500 dark:focus:ring-violet-400"
          />
        </div>
      )}

      {/* Desglose fiscal */}
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
          <div className="flex items-center justify-between border-t border-slate-100 pt-2 dark:border-white/10">
            <span className="font-semibold text-slate-700 dark:text-slate-200">Total</span>
            <span className="text-xl font-bold text-slate-900 dark:text-white">
              {formatCOP(total)}
            </span>
          </div>
        </div>
      )}

      {/* Error */}
      {errorMessage && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-500/30 dark:bg-red-900/20 dark:text-red-300">
          {errorMessage}
        </div>
      )}

      {/* Botón confirmar */}
      <button
        onClick={onConfirm}
        aria-keyshortcuts="Control+Enter F12"
        title="Atajo: Ctrl + Enter"
        disabled={cart.length === 0 || creditRequiresCustomer || isPending}
        aria-busy={isPending}
        className="w-full rounded-2xl bg-violet-600 px-4 py-4 text-base font-bold xl:text-lg text-white shadow-lg transition hover:bg-violet-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {confirmButtonLabel}
      </button>

      {/* Limpiar con confirmación */}
      {cart.length > 0 && (
        <>
          {showClearConfirm ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm dark:border-red-500/30 dark:bg-red-900/10">
              <p className="mb-2 font-medium text-red-700 dark:text-red-300">
                ¿Borrar toda la factura? Se perderán los ítems actuales.
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
              Limpiar factura
            </button>
          )}
        </>
      )}
    </div>
  );
}

type Props = {
  taxes: TaxConfig[];
  autoTax: boolean;
  business: BusinessInfoForPdf;
  userName: string | null;
};

export function InvoicedSaleForm({ taxes, autoTax, business, userName }: Readonly<Props>) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [selectedCustomer, setSelectedCustomer] = useState<SelectedCustomer | null>(CONSUMIDOR_FINAL);
  const [note, setNote] = useState("");
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [continuousScan, setContinuousScan] = useState(false);
  const [specialPrompt, setSpecialPrompt] = useState<{ product: Product; mode: "weight" | "amount" } | null>(null);
  const [completedSale, setCompletedSale] = useState<{ saleId: string; invoiceNumber: string; total: number; customerEmail?: string | null; saleForPdf: SaleForPdf } | null>(null);
  const doneDialogRef = useDialog(() => setCompletedSale(null), completedSale !== null);

  useEffect(() => {
    setCart(loadLS<CartItem[]>(CART_KEY, []));
    setSelectedCustomer(loadLS<SelectedCustomer | null>(CUSTOMER_KEY, CONSUMIDOR_FINAL));
    setNote(loadLS<string>(NOTE_KEY, ""));
    setPaymentMethod(loadLS<PaymentMethod>(PAYMENT_KEY, "CASH"));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }, [cart, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(CUSTOMER_KEY, JSON.stringify(selectedCustomer));
  }, [selectedCustomer, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(NOTE_KEY, JSON.stringify(note));
  }, [note, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(PAYMENT_KEY, JSON.stringify(paymentMethod));
  }, [paymentMethod, hydrated]);

  // Clave de idempotencia de la factura en curso: se reutiliza en reintentos y se descarta
  // cuando cambia el contenido (carrito, cliente, nota o medio de pago).
  const saleKeyRef = useRef<string | null>(null);
  // Zona de detalle y emisión: la barra fija de móvil se oculta cuando ya está en pantalla.
  const checkoutRef = useRef<HTMLDivElement>(null);
  const [checkoutVisible, setCheckoutVisible] = useState(false);
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
  }, [cart, selectedCustomer, note, paymentMethod]);

  const { data: products = [], isLoading } = api.product.search.useQuery();
  const utils = api.useUtils();

  const createSale = api.sale.create.useMutation({
    onSuccess: (data) => {
      const cartSnapshot = [...cart];
      const customerSnapshot = selectedCustomer;
      const noteSnapshot = note;
      const methodSnapshot = paymentMethod;

      clearCart();

      const { subtotal: saleSubtotal, taxAmount: saleTaxAmount, taxLines: saleTaxLines, total: saleTotal } =
        computeSaleTotals(cartSnapshot, taxes, autoTax);

      setCompletedSale({
        saleId: data.id,
        invoiceNumber: data.invoiceNumber!,
        total: data.total,
        customerEmail: customerSnapshot?.email ?? null,
        saleForPdf: {
          invoiceNumber: data.invoiceNumber!,
          createdAt: new Date(),
          customer: customerSnapshot
            ? { name: customerSnapshot.name, document: customerSnapshot.document ?? null }
            : null,
          user: { name: userName },
          items: cartSnapshot.map((i) => ({
            id: lineKey(i),
            name: i.name,
            unit: i.unit,
            quantity: i.quantity,
            price: i.price,
            subtotal: i.price * i.quantity,
            taxLines: autoTax ? computeItemTaxBreakdown(i, taxes).taxLines : null,
          })),
          subtotal: saleSubtotal,
          taxAmount: saleTaxAmount,
          taxLines: saleTaxLines.length > 0 ? saleTaxLines : null,
          total: saleTotal,
          paymentMethod: methodSnapshot,
          note: noteSnapshot.trim() || null,
        },
      });

      void utils.sale.list.invalidate();
      void utils.product.search.invalidate();
    },
    onError: () => {
      setCompletedSale(null);
    },
  });

  const filteredProducts = products.filter((p: Product) => matchesSearch(p, search));
  const searchRef = useRef<HTMLInputElement>(null);

  // Enter en la búsqueda: código de barras exacto (lector USB) o único resultado.
  function handleSearchEnter() {
    const product = pickOnEnter(search, filteredProducts, products);
    if (product) {
      handleProductTap(product);
      setSearch("");
    } else if (search.trim()) {
      toast.error(`Ningún producto coincide con "${search.trim()}".`);
    }
  }

  let catalogStatusMessage: string | null = null;
  if (isLoading) {
    catalogStatusMessage = "Cargando productos...";
  } else if (products.length === 0) {
    catalogStatusMessage = "Aún no tienes productos. Agrégalos en Catálogo para poder facturar.";
  } else if (filteredProducts.length === 0) {
    catalogStatusMessage = "Ningún producto coincide con la búsqueda.";
  }

  function clearCart() {
    setCart([]);
    setNote("");
    setSelectedCustomer(CONSUMIDOR_FINAL);
    setPaymentMethod("CASH");
    localStorage.removeItem(CART_KEY);
    localStorage.removeItem(CUSTOMER_KEY);
    localStorage.removeItem(NOTE_KEY);
    localStorage.removeItem(PAYMENT_KEY);
    setShowClearConfirm(false);
  }

  /** Avisa cuando ya no hay más unidades (antes el "+" no hacía nada sin explicar). */
  function stockLimitReached(product: Pick<Product, "name" | "stock" | "trackStock">, qtyInCart: number) {
    if (!product.trackStock || qtyInCart < product.stock) return false;
    toast.error(
      product.stock === 0
        ? `${product.name} no tiene unidades disponibles.`
        : `Solo hay ${product.stock} ${product.stock === 1 ? "unidad" : "unidades"} de ${product.name}.`,
    );
    return true;
  }

  function addToCart(product: Product) {
    const inCart = cart.find((i) => i.productId === product.id && !isSpecialLine(i))?.quantity ?? 0;
    if (stockLimitReached(product, inCart)) return;
    setCart((prev) => {
      const existing = prev.find((i) => i.productId === product.id && !isSpecialLine(i));
      if (existing) {
        if (product.trackStock && existing.quantity >= product.stock) return prev;
        return prev.map((i) => (i === existing ? { ...i, quantity: i.quantity + 1 } : i));
      }
      if (product.trackStock && product.stock === 0) return prev;
      return [
        ...prev,
        { productId: product.id, name: product.name, price: product.price, quantity: 1, unit: product.unit, taxSlots: product.taxSlots },
      ];
    });
  }

  // Peso y monto libre: igual que en venta rápida, se piden antes de agregar la línea.
  function addSpecialToCart(product: Product, value: number) {
    const base = {
      cartItemId: `${product.id}-${crypto.randomUUID()}`,
      productId: product.id,
      quantity: 1,
      unit: product.unit,
      taxSlots: product.taxSlots,
    };
    if (product.soldByWeight) {
      const lineTotal = Math.ceil((product.price * value) / 100) * 100;
      setCart((prev) => [...prev, { ...base, name: `${product.name} (${value} kg)`, price: lineTotal, weightKg: value }]);
    } else {
      setCart((prev) => [...prev, { ...base, name: product.name, price: value, customAmount: value }]);
    }
    setSpecialPrompt(null);
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
      toast.error(`Ningún producto tiene el código ${code}.`);
      return;
    }
    if (product.openPrice || product.soldByWeight) {
      handleProductTap(product);
      return;
    }
    addToCart(product);
    toast.success(`${product.name} agregado a la factura.`);
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

  function updateQty(key: string, delta: number) {
    if (delta > 0) {
      const line = cart.find((i) => lineKey(i) === key);
      const product = products.find((p: Product) => p.id === line?.productId);
      if (line && product && stockLimitReached(product, line.quantity)) return;
    }
    setCart((prev) =>
      prev
        .map((i) => {
          if (lineKey(i) !== key) return i;
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

  function removeFromCart(key: string) {
    setCart((prev) => prev.filter((i) => lineKey(i) !== key));
  }

  const { subtotal, taxLines, total } = computeSaleTotals(cart, taxes, autoTax);

  const creditRequiresCustomer = paymentMethod === "CREDIT" && !selectedCustomer?.id;

  function confirmSale() {
    if (cart.length === 0 || creditRequiresCustomer || createSale.isPending) return;
    saleKeyRef.current ??= crypto.randomUUID();
    createSale.mutate({
      items: cart.map((i) => ({ productId: i.productId, quantity: i.quantity, weightKg: i.weightKg, customAmount: i.customAmount })),
      saleType: "INVOICED",
      paymentMethod,
      customerId: selectedCustomer?.id,
      note: note.trim() || undefined,
      idempotencyKey: saleKeyRef.current,
    });
  }

  const cartUnits = cart.reduce((n, i) => n + i.quantity, 0);
  usePosShortcuts(searchRef, confirmSale);
  let confirmButtonLabel: string;
  if (createSale.isPending) {
    confirmButtonLabel = "Generando factura...";
  } else if (cart.length > 0) {
    confirmButtonLabel = `Emitir factura · ${formatCOP(total)}`;
  } else {
    confirmButtonLabel = "Emitir factura";
  }

  return (
    <>
      {/* Modal post-emisión */}
      {completedSale && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center">
          <div
            ref={doneDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="invoice-done-title"
            className="my-auto w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900"
          >
            <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
              <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h2 id="invoice-done-title" className="mt-3 text-lg font-bold text-slate-800 dark:text-white">
              Factura emitida
            </h2>
            <p className="mt-1 text-sm font-semibold text-violet-600 dark:text-violet-400">
              {completedSale.invoiceNumber}
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Total: {formatCOP(completedSale.total)}
            </p>

            <div className="mt-5">
              <p className="mb-3 text-sm font-medium text-slate-600 dark:text-slate-300">
                ¿Qué quieres hacer con la factura?
              </p>
              <FacturaPdfActions
                saleId={completedSale.saleId}
                business={business}
                sale={completedSale.saleForPdf}
                fileName={`${completedSale.invoiceNumber}.pdf`}
                onClose={() => setCompletedSale(null)}
                defaultEmail={completedSale.customerEmail}
                hideClose
              />
            </div>

            <button
              onClick={() => setCompletedSale(null)}
              className="mt-4 min-h-11 w-full rounded-xl border border-slate-200 text-center text-sm text-slate-500 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/5"
            >
              Listo, nueva venta
            </button>
          </div>
        </div>
      )}

      {/* Cliente */}
      <div className="mb-3">
        <p className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">
          Cliente{" "}
          {paymentMethod === "CREDIT" ? (
            <span className="text-red-500">*</span>
          ) : (
            <span className="text-slate-500">(opcional)</span>
          )}
        </p>
        <CustomerSelector value={selectedCustomer} onChange={setSelectedCustomer} />
        {creditRequiresCustomer && (
          <p className="mt-1 text-xs text-red-500">
            Selecciona un cliente registrado (arriba, en &quot;Cliente&quot;) para fiar esta venta. No se puede usar &quot;Consumidor Final&quot; ni &quot;Solo documento&quot;.
          </p>
        )}
      </div>

      {specialPrompt && (
        <SpecialItemPrompt
          product={specialPrompt.product}
          mode={specialPrompt.mode}
          onConfirm={(value) => addSpecialToCart(specialPrompt.product, value)}
          onCancel={() => setSpecialPrompt(null)}
        />
      )}

      {/* Un solo árbol para todos los tamaños: el escáner (cámara) se monta una sola vez. */}
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
          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm md:max-h-[calc(100dvh-17rem)] md:overflow-y-auto dark:border-white/10 dark:bg-white/5">
            <InvoiceProductGrid
              statusMessage={catalogStatusMessage}
              filteredProducts={filteredProducts}
              cart={cart}
              onAdd={handleProductTap}
              formatCOP={formatCOP}
            />
          </div>
        </div>

        <div ref={checkoutRef} className="flex scroll-mt-20 flex-col gap-3 md:sticky md:top-20">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/5">
            <div className="mb-3 flex items-center gap-2">
              <span className="inline-flex items-center rounded-lg bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
                FACTURA
              </span>
              <h2 className="font-semibold text-slate-700 dark:text-slate-200">Detalle</h2>
            </div>
            <div className="max-h-[40dvh] overflow-y-auto md:max-h-[calc(100dvh-34rem)] md:min-h-24">
              <InvoiceCartList cart={cart} onUpdateQty={updateQty} onRemove={removeFromCart} formatCOP={formatCOP} />
            </div>
            <div className="mt-3">
              <FactureBottom
                cart={cart}
                paymentMethod={paymentMethod}
                onPaymentMethodChange={setPaymentMethod}
                note={note}
                onNoteChange={setNote}
                subtotal={subtotal}
                taxLines={taxLines}
                total={total}
                formatCOP={formatCOP}
                errorMessage={createSale.error?.message}
                confirmButtonLabel={confirmButtonLabel}
                onConfirm={confirmSale}
                isPending={createSale.isPending}
                creditRequiresCustomer={creditRequiresCustomer}
                showClearConfirm={showClearConfirm}
                onShowClearConfirm={setShowClearConfirm}
                onClearCart={clearCart}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Móvil/tablet: acceso fijo a la emisión mientras se eligen productos. */}
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
            <span className="text-base font-bold">{formatCOP(total)} · Facturar</span>
          </button>
        </div>
      )}
    </>
  );
}
