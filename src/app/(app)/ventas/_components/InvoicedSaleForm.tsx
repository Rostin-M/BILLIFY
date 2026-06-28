"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { api } from "~/trpc/react";
import type { BusinessInfoForPdf, SaleForPdf, TaxLine } from "~/lib/pdf/FacturaPDF";
import { CustomerSelector } from "./CustomerSelector";

const FacturaPdfActions = dynamic(
  () => import("~/lib/pdf/FacturaPdfActions").then((m) => m.FacturaPdfActions),
  { ssr: false, loading: () => <span className="text-xs text-slate-400">Generando PDF…</span> },
);

type SelectedCustomer = { id?: string; name: string; document?: string; email?: string | null; isGuestWithDoc?: boolean };

type CartItem = {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  unit: string;
};

type Product = {
  id: string;
  name: string;
  price: number;
  unit: string;
  stock: number;
  trackStock: boolean;
  category: string | null;
};

const PAYMENT_LABELS: Record<string, string> = {
  CASH: "Efectivo",
  CARD: "Tarjeta",
  TRANSFER: "Transferencia",
  CREDIT: "Crédito",
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

type TaxConfig = { name: string; rate: number; enabled: boolean };

type Props = {
  taxes: TaxConfig[];
  autoTax: boolean;
  business: BusinessInfoForPdf;
  userName: string | null;
};

export function InvoicedSaleForm({ taxes, autoTax, business, userName }: Props) {
  const activeTaxes = autoTax ? taxes.filter((t) => t.enabled && t.rate > 0) : [];
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "CARD" | "CREDIT" | "TRANSFER">("CASH");
  const [selectedCustomer, setSelectedCustomer] = useState<SelectedCustomer | null>(null);
  const [note, setNote] = useState("");
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [completedSale, setCompletedSale] = useState<{ saleId: string; invoiceNumber: string; total: number; customerEmail?: string | null; saleForPdf: SaleForPdf } | null>(null);

  useEffect(() => {
    setCart(loadLS<CartItem[]>(CART_KEY, []));
    setSelectedCustomer(loadLS<SelectedCustomer | null>(CUSTOMER_KEY, null));
    setNote(loadLS<string>(NOTE_KEY, ""));
    setPaymentMethod(loadLS<"CASH" | "CARD" | "CREDIT" | "TRANSFER">(PAYMENT_KEY, "CASH"));
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

  const { data: products = [], isLoading } = api.product.search.useQuery();
  const utils = api.useUtils();

  const createSale = api.sale.create.useMutation({
    onSuccess: (data) => {
      const cartSnapshot = [...cart];
      const customerSnapshot = selectedCustomer;
      const noteSnapshot = note;
      const methodSnapshot = paymentMethod;

      clearCart();

      const saleSubtotal = cartSnapshot.reduce((sum, i) => sum + i.price * i.quantity, 0);
      const saleTaxLines: TaxLine[] = activeTaxes.map((t) => ({
        name: t.name,
        rate: t.rate,
        amount: saleSubtotal * (t.rate / 100),
      }));
      const saleTaxAmount = saleTaxLines.reduce((s, l) => s + l.amount, 0);
      const saleTotal = saleSubtotal + saleTaxAmount;

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
            name: i.name,
            unit: i.unit,
            quantity: i.quantity,
            price: i.price,
            subtotal: i.price * i.quantity,
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

  const filteredProducts = products.filter((p: Product) =>
    p.name.toLowerCase().includes(search.toLowerCase()),
  );

  function clearCart() {
    setCart([]);
    setNote("");
    setSelectedCustomer(null);
    setPaymentMethod("CASH");
    localStorage.removeItem(CART_KEY);
    localStorage.removeItem(CUSTOMER_KEY);
    localStorage.removeItem(NOTE_KEY);
    localStorage.removeItem(PAYMENT_KEY);
    setShowClearConfirm(false);
  }

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
        { productId: product.id, name: product.name, price: product.price, quantity: 1, unit: product.unit },
      ];
    });
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

  const subtotal = cart.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const taxAmount = activeTaxes.reduce((sum, t) => sum + subtotal * (t.rate / 100), 0);
  const total = subtotal + taxAmount;

  const creditRequiresNote = paymentMethod === "CREDIT" && !note.trim();

  function confirmSale() {
    if (cart.length === 0 || creditRequiresNote) return;
    createSale.mutate({
      items: cart.map((i) => ({ productId: i.productId, quantity: i.quantity })),
      saleType: "INVOICED",
      paymentMethod,
      customerId: selectedCustomer?.id,
      note: note.trim() || undefined,
    });
  }

  const formatCOP = (v: number) =>
    v.toLocaleString("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0 });

  return (
    <>
      {/* Modal post-emisión */}
      {completedSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
            <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
              <span className="text-2xl">✓</span>
            </div>
            <h2 className="mt-3 text-lg font-bold text-slate-800 dark:text-white">
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
                ¿Deseas imprimir o descargar la factura?
              </p>
              <FacturaPdfActions
                saleId={completedSale.saleId}
                business={business}
                sale={completedSale.saleForPdf}
                fileName={`${completedSale.invoiceNumber}.pdf`}
                onClose={() => setCompletedSale(null)}
                defaultEmail={completedSale.customerEmail}
              />
            </div>

            <button
              onClick={() => setCompletedSale(null)}
              className="mt-4 w-full rounded-xl border border-slate-200 py-2 text-sm text-slate-500 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/5"
            >
              No, cerrar
            </button>
          </div>
        </div>
      )}

      <div className="flex h-full flex-col gap-4 lg:flex-row">
        {/* Catálogo */}
        <div className="flex flex-col gap-3 lg:w-3/5">
          <input
            type="search"
            placeholder="Buscar producto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base shadow-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-200 dark:border-white/10 dark:bg-white/5 dark:text-white dark:focus:border-violet-500 dark:focus:ring-violet-900"
          />

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
                      {outOfStock ? "Sin stock" : p.trackStock ? `${p.stock} disp.` : "∞ disp."}
                    </span>
                    {inCart && (
                      <span className="mt-1 text-xs font-semibold text-violet-600 dark:text-violet-400">
                        En factura: {inCart.quantity}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Panel de factura */}
        <div className="flex flex-col gap-3 lg:w-2/5">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/5">
            <div className="mb-3 flex items-center gap-2">
              <span className="inline-flex items-center rounded-lg bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
                FACTURA
              </span>
              <h2 className="font-semibold text-slate-700 dark:text-slate-200">Detalle</h2>
              {cart.length > 0 && (
                <span className="ml-auto text-xs text-slate-400 dark:text-slate-500">
                  guardado automáticamente
                </span>
              )}
            </div>

            {/* Ítems */}
            {cart.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-400 dark:text-slate-500">
                Toca un producto para agregar a la factura
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
                        {formatCOP(item.price)} × {item.quantity}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => updateQty(item.productId, -1)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-200 text-slate-700 transition hover:bg-slate-300 dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/20"
                      >
                        −
                      </button>
                      <span className="w-5 text-center text-sm font-semibold text-slate-800 dark:text-slate-100">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateQty(item.productId, 1)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-200 text-slate-700 transition hover:bg-slate-300 dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/20"
                      >
                        +
                      </button>
                      <button
                        onClick={() => removeFromCart(item.productId)}
                        className="ml-1 flex h-7 w-7 items-center justify-center rounded-lg text-red-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
                      >
                        ×
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {/* Cliente */}
            <div className="mt-4">
              <p className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                Cliente <span className="text-slate-400">(opcional)</span>
              </p>
              <CustomerSelector value={selectedCustomer} onChange={setSelectedCustomer} />
            </div>

            {/* Método de pago */}
            {cart.length > 0 && (
              <div className="mt-4">
                <p className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                  Método de pago
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {(["CASH", "CARD", "TRANSFER", "CREDIT"] as const).map((method) => (
                    <button
                      key={method}
                      onClick={() => setPaymentMethod(method)}
                      className={`rounded-lg border px-2 py-2 text-xs font-medium transition ${
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
              <div className="mt-3">
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                  {paymentMethod === "CREDIT" ? (
                    <span>
                      Nota del crédito{" "}
                      <span className="text-red-500">*</span>
                    </span>
                  ) : (
                    "Nota (opcional)"
                  )}
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder={
                    paymentMethod === "CREDIT"
                      ? "Ej: Juan Pérez — paga el viernes"
                      : "Referencia de pago, observación..."
                  }
                  className={`w-full resize-none rounded-lg border px-3 py-2 text-sm outline-none transition focus:ring-2 dark:bg-white/5 dark:text-white ${
                    creditRequiresNote
                      ? "border-red-300 focus:border-red-400 focus:ring-red-100 dark:border-red-500/50 dark:focus:ring-red-900/30"
                      : "border-slate-200 focus:border-violet-400 focus:ring-violet-100 dark:border-white/10 dark:focus:border-violet-500 dark:focus:ring-violet-900/30"
                  }`}
                />
                {creditRequiresNote && (
                  <p className="mt-1 text-xs text-red-500">
                    Requerido para ventas a crédito.
                  </p>
                )}
              </div>
            )}

            {/* Desglose fiscal */}
            {cart.length > 0 && (
              <div className="mt-4 space-y-1 border-t border-slate-100 pt-3 dark:border-white/10">
                {activeTaxes.length > 0 && (
                  <div className="flex justify-between text-sm text-slate-500 dark:text-slate-400">
                    <span>Subtotal</span>
                    <span>{formatCOP(subtotal)}</span>
                  </div>
                )}
                {activeTaxes.map((t, i) => (
                  <div key={i} className="flex justify-between text-sm text-slate-500 dark:text-slate-400">
                    <span>{t.name} ({t.rate}%)</span>
                    <span>{formatCOP(subtotal * (t.rate / 100))}</span>
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
          </div>

          {/* Error */}
          {createSale.error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-500/30 dark:bg-red-900/20 dark:text-red-300">
              {createSale.error.message}
            </div>
          )}

          {/* Botón confirmar */}
          <button
            onClick={confirmSale}
            disabled={cart.length === 0 || creditRequiresNote || createSale.isPending}
            className="w-full rounded-2xl bg-violet-600 px-6 py-4 text-lg font-bold text-white shadow-lg transition hover:bg-violet-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {createSale.isPending
              ? "Generando factura..."
              : cart.length > 0
                ? `Emitir factura · ${formatCOP(total)}`
                : "Emitir factura"}
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
                  Limpiar factura
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
