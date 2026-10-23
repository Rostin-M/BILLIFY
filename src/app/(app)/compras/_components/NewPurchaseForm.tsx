"use client";

import { Repeat, Search, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "~/trpc/react";
import { formatCOP } from "~/lib/format/money";
import { SupplierPicker, type PickedSupplier } from "./SupplierPicker";

type Line = { productId: string; name: string; quantity: string; unitCost: string };
type PayMode = "FULL" | "CREDIT";
type PayMethod = "CASH" | "TRANSFER" | "CARD";

const PAY_METHODS: { value: PayMethod; label: string }[] = [
  { value: "CASH", label: "Efectivo de la caja" },
  { value: "TRANSFER", label: "Transferencia" },
  { value: "CARD", label: "Tarjeta" },
];

const DUE_PRESETS: { label: string; days: number | null }[] = [
  { label: "Próxima entrega", days: null },
  { label: "8 días", days: 8 },
  { label: "15 días", days: 15 },
  { label: "30 días", days: 30 },
];

const inputClass =
  "min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base outline-none ring-violet-400 focus:ring-2 sm:text-sm dark:border-white/15 dark:bg-slate-900 dark:text-white";
const cardClass = "space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 dark:border-white/10 dark:bg-white/5";
const sectionTitle = "text-sm font-semibold text-slate-700 dark:text-slate-200";

const num = (v: string) => {
  const n = Number.parseFloat(v.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

function bogotaDatePlus(days: number): string {
  const d = new Date(Date.now() + days * 86_400_000);
  return d.toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
}

const segmentClass = (active: boolean) =>
  `min-h-11 rounded-xl border px-3 text-sm font-semibold transition ${
    active
      ? "border-violet-500 bg-violet-50 text-violet-700 dark:border-violet-400 dark:bg-violet-900/30 dark:text-violet-200"
      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-white/10 dark:bg-transparent dark:text-slate-300"
  }`;

const lineQty = (l: Line) => Math.max(Math.trunc(num(l.quantity)), 0);

function purchaseTotals(p: { lines: Line[]; amountOnly: boolean; amount: string; payMode: PayMode; paidNow: string }) {
  const total = p.amountOnly ? num(p.amount) : p.lines.reduce((s, l) => s + lineQty(l) * num(l.unitCost), 0);
  const paid = p.payMode === "FULL" ? total : Math.min(num(p.paidNow), total);
  const linesValid = p.lines.every((l) => lineQty(l) > 0 && num(l.unitCost) >= 0);
  return { total, paid, balance: Math.max(total - paid, 0), linesValid };
}

function dueDateFor(dueDays: number | null | "custom", customDue: string): string | undefined {
  if (dueDays === "custom") return customDue || undefined;
  return dueDays === null ? undefined : bogotaDatePlus(dueDays);
}

function submitLabelFor(pending: boolean, total: number, paid: number, balance: number): string {
  if (pending) return "Registrando...";
  if (total <= 0) return "Registrar compra";
  if (balance > 0) return `Registrar · pagas ${formatCOP(paid)}, quedas debiendo ${formatCOP(balance)}`;
  return `Registrar compra · ${formatCOP(total)}`;
}

export function NewPurchaseForm() {
  const [supplier, setSupplier] = useState<PickedSupplier | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [search, setSearch] = useState("");
  const [amountOnly, setAmountOnly] = useState(false);
  const [amount, setAmount] = useState("");
  const [payMode, setPayMode] = useState<PayMode>("FULL");
  const [method, setMethod] = useState<PayMethod>("CASH");
  const [paidNow, setPaidNow] = useState("");
  const [dueDays, setDueDays] = useState<number | null | "custom">(null);
  const [customDue, setCustomDue] = useState("");
  const [note, setNote] = useState("");
  const [updateCosts, setUpdateCosts] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const keyRef = useRef<string | null>(null);
  useEffect(() => {
    keyRef.current = null;
  }, [supplier, lines, amount, payMode, method, paidNow, dueDays, customDue, note, amountOnly]);

  const utils = api.useUtils();
  const { data: products = [] } = api.product.search.useQuery();
  const { data: last } = api.purchase.lastForSupplier.useQuery(
    { supplierId: supplier?.id ?? "" },
    { enabled: !!supplier },
  );

  const create = api.purchase.create.useMutation({
    onSuccess: async (result) => {
      keyRef.current = null;
      toast.success(result.message);
      await Promise.all([
        utils.purchase.invalidate(),
        utils.supplier.list.invalidate(),
        utils.product.search.invalidate(),
        utils.product.list.invalidate(),
        utils.cashRegister.getActive.invalidate(),
      ]);
      setSupplier(null);
      setLines([]);
      setAmount("");
      setPayMode("FULL");
      setPaidNow("");
      setDueDays(null);
      setCustomDue("");
      setNote("");
      setError(null);
    },
    onError: (e) => setError(e.message),
  });

  const q = search.trim().toLowerCase();
  const matches = q
    ? products
        .filter((p) => !lines.some((l) => l.productId === p.id))
        .filter((p) => p.name.toLowerCase().includes(q) || (p.brand?.toLowerCase().includes(q) ?? false) || p.barcode === search.trim())
        .slice(0, 8)
    : [];

  function addLine(p: { id: string; name: string }) {
    setLines((prev) => [{ productId: p.id, name: p.name, quantity: "1", unitCost: "" }, ...prev]);
    setSearch("");
  }

  function updateLine(productId: string, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.productId === productId ? { ...l, ...patch } : l)));
  }

  function repeatLast() {
    if (!last) return;
    setAmountOnly(false);
    setLines(last.items.map((i) => ({ productId: i.productId, name: i.name, quantity: String(i.quantity), unitCost: String(i.unitCost) })));
  }

  const { total, paid, balance, linesValid } = purchaseTotals({ lines, amountOnly, amount, payMode, paidNow });
  const hasItems = amountOnly || (lines.length > 0 && linesValid);
  const canSubmit = total > 0 && hasItems && (payMode === "FULL" || !!supplier);
  const dueDate = dueDateFor(dueDays, customDue);

  function submit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit || create.isPending) return;
    setError(null);
    keyRef.current ??= crypto.randomUUID();
    create.mutate({
      supplierId: supplier?.id,
      items: amountOnly
        ? []
        : lines.map((l) => ({ productId: l.productId, quantity: lineQty(l), unitCost: num(l.unitCost) })),
      amount: amountOnly ? total : undefined,
      paidNow: paid,
      paymentMethod: method,
      dueDate: balance > 0 ? dueDate : undefined,
      note: note.trim() || undefined,
      updateCosts,
      idempotencyKey: keyRef.current,
    });
  }

  const submitLabel = submitLabelFor(create.isPending, total, paid, balance);

  return (
    <form onSubmit={submit} className="space-y-4">
      <section className={cardClass}>
        <h2 className={sectionTitle}>¿A quién le compraste?</h2>
        <SupplierPicker value={supplier} onChange={setSupplier} inputClassName={inputClass} placeholder="Ej: Fritos Natalia" />
        {supplier && last && last.items.length > 0 && (
          <button
            type="button"
            onClick={repeatLast}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 text-sm font-semibold text-sky-700 hover:bg-sky-100 dark:border-sky-500/30 dark:bg-sky-900/20 dark:text-sky-300"
          >
            <Repeat className="h-4 w-4" aria-hidden />
            Repetir el último pedido ({new Date(last.createdAt).toLocaleDateString("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short" })} · {last.items.length} {last.items.length === 1 ? "producto" : "productos"})
          </button>
        )}
      </section>

      <section className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className={sectionTitle}>¿Qué llegó?</h2>
          <label className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <input type="checkbox" checked={amountOnly} onChange={(e) => setAmountOnly(e.target.checked)} className="h-4 w-4 accent-violet-600" />
            <span>Sin productos del catálogo, solo el total</span>
          </label>
        </div>

        {amountOnly ? (
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Total de la compra</span>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">$</span>
              <input type="number" inputMode="decimal" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" className={`${inputClass} pl-7`} />
            </div>
          </label>
        ) : (
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                type="search"
                aria-label="Buscar producto"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar producto, marca o código..."
                className={`${inputClass} pl-9`}
              />
              {matches.length > 0 && (
                <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-slate-800">
                  {matches.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => addLine(p)}
                        className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-1.5 text-left hover:bg-violet-50 dark:hover:bg-violet-900/20"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-100">{p.name}</span>
                          {(p.brand ?? p.presentation) && (
                            <span className="block truncate text-xs text-slate-500">{[p.brand, p.presentation].filter(Boolean).join(" · ")}</span>
                          )}
                        </span>
                        {p.trackStock && <span className="shrink-0 text-xs text-slate-500">{p.stock} en stock</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {lines.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">Busca los productos que llegaron. Se suman al inventario al registrar la compra.</p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-white/10">
                {lines.map((l) => {
                  const lineTotal = lineQty(l) * num(l.unitCost);
                  return (
                    <li key={l.productId} className="grid grid-cols-[1fr_auto] gap-x-2 gap-y-2 py-2.5 sm:grid-cols-[1fr_6rem_8rem_auto] sm:items-center">
                      <span className="min-w-0 text-sm font-medium text-slate-800 dark:text-slate-100">
                        {l.name}
                        <span className="block text-xs font-normal tabular-nums text-slate-500">{formatCOP(lineTotal)}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setLines((prev) => prev.filter((x) => x.productId !== l.productId))}
                        aria-label={`Quitar ${l.name}`}
                        className="row-start-1 flex h-10 w-10 items-center justify-center justify-self-end rounded-lg text-red-500 hover:bg-red-50 sm:col-start-4 dark:hover:bg-red-900/20"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                      <label className="col-span-2 flex items-center gap-2 sm:col-span-1 sm:col-start-2 sm:row-start-1">
                        <span className="w-16 text-xs text-slate-500 sm:sr-only">Cantidad</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min="1"
                          step="1"
                          aria-label={`Cantidad de ${l.name}`}
                          value={l.quantity}
                          onChange={(e) => updateLine(l.productId, { quantity: e.target.value })}
                          className={`${inputClass} text-center`}
                        />
                      </label>
                      <label className="col-span-2 flex items-center gap-2 sm:col-span-1 sm:col-start-3 sm:row-start-1">
                        <span className="w-16 text-xs text-slate-500 sm:sr-only">Costo c/u</span>
                        <span className="relative w-full">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">$</span>
                          <input
                            type="number"
                            inputMode="decimal"
                            min="0"
                            aria-label={`Costo unitario de ${l.name}`}
                            value={l.unitCost}
                            onChange={(e) => updateLine(l.productId, { unitCost: e.target.value })}
                            placeholder="Costo c/u"
                            className={`${inputClass} pl-7`}
                          />
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
            {lines.length > 0 && (
              <label className="inline-flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <input type="checkbox" checked={updateCosts} onChange={(e) => setUpdateCosts(e.target.checked)} className="h-4 w-4 accent-violet-600" />
                <span>Actualizar el costo de los productos con el de esta compra</span>
              </label>
            )}
          </>
        )}

        <p className="flex items-baseline justify-between border-t border-slate-100 pt-3 text-sm font-semibold text-slate-700 dark:border-white/10 dark:text-slate-200">
          <span>Total</span>
          <span className="text-lg tabular-nums">{formatCOP(total)}</span>
        </p>
      </section>

      <section className={cardClass}>
        <h2 className={sectionTitle}>¿Cómo la pagas?</h2>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setPayMode("FULL")} aria-pressed={payMode === "FULL"} className={segmentClass(payMode === "FULL")}>
            Pago completo
          </button>
          <button type="button" onClick={() => setPayMode("CREDIT")} aria-pressed={payMode === "CREDIT"} className={segmentClass(payMode === "CREDIT")}>
            A crédito / abono
          </button>
        </div>

        {payMode === "CREDIT" && (
          <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-500/30 dark:bg-amber-900/10">
            {!supplier && (
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Elige el proveedor arriba para saber a quién le quedas debiendo.</p>
            )}
            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">¿Cuánto pagas ahora? (0 si no pagas nada)</span>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">$</span>
                <input type="number" inputMode="decimal" min="0" value={paidNow} onChange={(e) => setPaidNow(e.target.value)} placeholder="0" className={`${inputClass} pl-7`} />
              </div>
            </label>
            <div className="space-y-1">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">¿Cuándo pagas el resto?</span>
              <div className="flex flex-wrap gap-2">
                {DUE_PRESETS.map((p) => (
                  <button key={p.label} type="button" onClick={() => setDueDays(p.days)} aria-pressed={dueDays === p.days} className={segmentClass(dueDays === p.days)}>
                    {p.label}
                  </button>
                ))}
                <button type="button" onClick={() => setDueDays("custom")} aria-pressed={dueDays === "custom"} className={segmentClass(dueDays === "custom")}>
                  Otra fecha
                </button>
              </div>
              {dueDays === "custom" && (
                <input type="date" aria-label="Fecha de pago" value={customDue} min={bogotaDatePlus(0)} onChange={(e) => setCustomDue(e.target.value)} className={inputClass} />
              )}
            </div>
            {total > 0 && (
              <p className="text-sm text-amber-900 dark:text-amber-200">
                Quedas debiendo <span className="font-bold tabular-nums">{formatCOP(balance)}</span>
                {supplier ? ` a ${supplier.name}` : ""}.
              </p>
            )}
          </div>
        )}

        {paid > 0 && (
          <div className="space-y-1">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Pagas con</span>
            <div className="grid grid-cols-3 gap-2">
              {PAY_METHODS.map((m) => (
                <button key={m.value} type="button" onClick={() => setMethod(m.value)} aria-pressed={method === m.value} className={segmentClass(method === m.value)}>
                  {m.label}
                </button>
              ))}
            </div>
            {method === "CASH" && (
              <p className="text-xs text-slate-500 dark:text-slate-400">Sale de tu caja abierta como una salida a nombre del proveedor.</p>
            )}
          </div>
        )}

        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Nota (opcional)</span>
          <textarea
            rows={2}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ej: factura #123, faltaron 2 paquetes..."
            className="w-full resize-none rounded-xl border border-slate-300 bg-white px-3 py-2 text-base outline-none ring-violet-400 focus:ring-2 sm:text-sm dark:border-white/15 dark:bg-slate-900 dark:text-white"
          />
        </label>
      </section>

      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-500/30 dark:bg-red-900/10 dark:text-red-300">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={!canSubmit || create.isPending}
        aria-busy={create.isPending}
        className="min-h-12 w-full rounded-xl bg-violet-600 px-4 text-base font-bold text-white shadow-lg transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
      >
        {submitLabel}
      </button>
    </form>
  );
}
