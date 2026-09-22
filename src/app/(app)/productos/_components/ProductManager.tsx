"use client";

import { Camera } from "lucide-react";
import { type ChangeEvent, useState } from "react";
import { toast } from "sonner";

import { api } from "~/trpc/react";
import { parseZodError } from "~/lib/parseZodError";
import { BarcodeScanner } from "~/app/_components/BarcodeScanner";

type ProductForm = {
  name: string;
  price: string;
  cost: string;
  unit: string;
  taxSlots: number[];
  stock: string;
  trackStock: boolean;
  category: string;
  lotNumber: string;
  expiresAt: string;
  barcode: string;
  brand: string;
  presentation: string;
  openPrice: boolean;
  soldByWeight: boolean;
};

type AdjustForm = { quantity: string; note: string };

const emptyForm: ProductForm = {
  name: "",
  price: "",
  cost: "",
  unit: "und",
  taxSlots: [],
  stock: "0",
  trackStock: true,
  category: "",
  lotNumber: "",
  expiresAt: "",
  barcode: "",
  brand: "",
  presentation: "",
  openPrice: false,
  soldByWeight: false,
};

const emptyAdjust: AdjustForm = { quantity: "", note: "" };

const UNITS = [
  { value: "und", label: "Unidad (und)" },
  { value: "kg", label: "Kilogramo (kg)" },
  { value: "gr", label: "Gramo (gr)" },
  { value: "litro", label: "Litro" },
  { value: "ml", label: "Mililitro (ml)" },
  { value: "shot", label: "Shot" },
  { value: "paquete", label: "Paquete" },
  { value: "caja", label: "Caja" },
  { value: "bolsa", label: "Bolsa" },
  { value: "docena", label: "Docena" },
  { value: "porcion", label: "Porción" },
];

type BusinessTax = { name: string; rate: number; enabled: boolean };

function formatCOP(value: number): string {
  return value.toLocaleString("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function toDateInput(date: Date | null | undefined): string {
  if (!date) return "";
  return new Date(date).toISOString().split("T")[0] ?? "";
}

function todayISOString(): string {
  const now = new Date();
  now.setDate(now.getDate() + 1);
  return now.toISOString().split("T")[0] ?? "";
}

function parseForm(form: ProductForm) {
  return {
    name: form.name,
    price: Number.parseFloat(form.price),
    cost: form.cost ? Number.parseFloat(form.cost) : undefined,
    unit: form.unit,
    taxSlots: form.taxSlots,
    stock: Number.parseInt(form.stock, 10) || 0,
    trackStock: form.trackStock,
    category: form.category.trim() || undefined,
    lotNumber: form.lotNumber.trim() || undefined,
    barcode: form.barcode.trim() || undefined,
    brand: form.brand.trim() || undefined,
    presentation: form.presentation.trim() || undefined,
    openPrice: form.openPrice,
    soldByWeight: form.soldByWeight,
    expiresAt: form.expiresAt ? new Date(form.expiresAt) : undefined,
  };
}

const REASON_LABELS: Record<string, string> = {
  MANUAL_ADJUSTMENT: "Ajuste manual",
  SALE: "Venta",
  RETURN: "Devolución",
  CORRECTION: "Corrección",
};

const INPUT =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-violet-400 transition focus:ring-2 dark:border-white/15 dark:bg-slate-900";

const INPUT_ERROR =
  "w-full rounded-lg border border-red-400 bg-white px-3 py-2 text-sm outline-none ring-red-400 transition focus:ring-2 dark:border-red-500/60 dark:bg-slate-900";

function FieldError({ msg }: Readonly<{ msg?: string }>) {
  if (!msg) return null;
  return <p className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">{msg}</p>;
}

type EnabledTax = { slot: number; name: string; rate: number };

function PriceCalculator({
  businessTaxes,
  onApply,
}: Readonly<{
  businessTaxes: EnabledTax[];
  onApply: (price: number, cost: number, taxSlots: number[]) => void;
}>) {
  const [cost, setCost] = useState("");
  const [margin, setMargin] = useState("20");
  const [selectedSlots, setSelectedSlots] = useState<number[]>([]);
  const [result, setResult] = useState<{ base: number; taxAmount: number; total: number } | null>(null);

  function toggleSlot(slot: number) {
    setSelectedSlots((prev) => (prev.includes(slot) ? prev.filter((s) => s !== slot) : [...prev, slot]));
    setResult(null);
  }

  function calculate() {
    const costNum = Number.parseFloat(cost);
    const marginNum = Number.parseFloat(margin);
    if (Number.isNaN(costNum) || costNum <= 0) return;
    const base = costNum * (1 + (Number.isNaN(marginNum) ? 0 : marginNum) / 100);
    const totalRate = businessTaxes
      .filter((t) => selectedSlots.includes(t.slot))
      .reduce((sum, t) => sum + t.rate, 0);
    const taxAmount = base * (totalRate / 100);
    // Aproxima por encima a la centena más cercana
    const total = Math.ceil((base + taxAmount) / 100) * 100;
    setResult({ base, taxAmount, total });
  }

  function apply() {
    const costNum = Number.parseFloat(cost);
    if (Number.isNaN(costNum) || result === null) return;
    onApply(result.total, costNum, selectedSlots);
    setCost("");
    setResult(null);
  }

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50 p-3 dark:border-violet-500/30 dark:bg-violet-900/10">
      <p className="mb-2 text-xs font-semibold text-violet-700 dark:text-violet-300">
        Calculadora de precio
      </p>
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1 text-xs">
          <span className="text-slate-600 dark:text-slate-400">Costo (COP)</span>
          <input
            type="number"
            min="0"
            step="100"
            value={cost}
            onChange={(e) => { setCost(e.target.value); setResult(null); }}
            placeholder="2000"
            className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-violet-400 dark:border-white/15 dark:bg-slate-900"
          />
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-slate-600 dark:text-slate-400">Margen de ganancia (%)</span>
          <input
            type="number"
            min="0"
            step="1"
            value={margin}
            onChange={(e) => { setMargin(e.target.value); setResult(null); }}
            placeholder="20"
            className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-violet-400 dark:border-white/15 dark:bg-slate-900"
          />
        </label>
      </div>

      <div className="mt-2 space-y-1 text-xs">
        <span className="text-slate-600 dark:text-slate-400">Impuestos que aplican a este producto</span>
        {businessTaxes.length === 0 ? (
          <p className="text-slate-500 dark:text-slate-500">
            Tu negocio no tiene impuestos configurados en Ajustes.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {businessTaxes.map((t) => (
              <button
                type="button"
                key={t.slot}
                onClick={() => toggleSlot(t.slot)}
                className={`rounded-full border px-2.5 py-1 font-medium transition ${
                  selectedSlots.includes(t.slot)
                    ? "border-violet-400 bg-violet-600 text-white"
                    : "border-violet-200 bg-white text-violet-700 hover:bg-violet-100 dark:border-violet-500/30 dark:bg-transparent dark:text-violet-300"
                }`}
              >
                {t.name} {t.rate}%
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={calculate}
          className="rounded-lg border border-violet-300 bg-white px-3 py-1.5 text-xs font-semibold text-violet-700 transition hover:bg-violet-100 dark:border-violet-500/40 dark:bg-transparent dark:text-violet-300 dark:hover:bg-violet-900/20"
        >
          Calcular
        </button>
        {result !== null && (
          <button
            type="button"
            onClick={apply}
            className="ml-auto rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-violet-500"
          >
            Aplicar al precio
          </button>
        )}
      </div>

      {result !== null && (
        <p className="mt-2 text-xs text-violet-700 dark:text-violet-300">
          Base {formatCOP(result.base)}
          {result.taxAmount > 0 && <> + impuestos {formatCOP(result.taxAmount)}</>}
          {" "}→ precio de venta{" "}
          <span className="font-bold">{formatCOP(result.total)}</span>
        </p>
      )}
    </div>
  );
}

function ProductFormFields({
  form,
  onChange,
  onCheckChange,
  onSelectChange,
  onToggleTaxSlot,
  onBarcodeScanned,
  onExclusiveCheckChange,
  fieldErrors,
  onApplyCalculator,
  categories,
  businessTaxes,
  produceModuleEnabled,
}: Readonly<{
  form: ProductForm;
  onChange: (field: keyof ProductForm) => (e: ChangeEvent<HTMLInputElement>) => void;
  onCheckChange: (field: keyof ProductForm) => (e: ChangeEvent<HTMLInputElement>) => void;
  onSelectChange: (field: keyof ProductForm) => (e: ChangeEvent<HTMLSelectElement>) => void;
  onToggleTaxSlot: (slot: number) => void;
  onBarcodeScanned: (code: string) => void;
  onExclusiveCheckChange: (field: "openPrice" | "soldByWeight") => (e: ChangeEvent<HTMLInputElement>) => void;
  fieldErrors: Record<string, string>;
  onApplyCalculator: (price: number, cost: number, taxSlots: number[]) => void;
  categories: string[];
  businessTaxes: EnabledTax[];
  produceModuleEnabled: boolean;
}>) {
  const [showCalc, setShowCalc] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  return (
    <div className="space-y-3">
      {/* Nombre + categoría + unidad */}
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1 text-sm sm:col-span-1">
          <span className="text-slate-700 dark:text-slate-300">Nombre</span>
          <input
            required
            value={form.name}
            onChange={onChange("name")}
            className={fieldErrors.name ? INPUT_ERROR : INPUT}
            placeholder="Ej: Café americano"
          />
          <FieldError msg={fieldErrors.name} />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-slate-700 dark:text-slate-300">
            Categoría <span className="text-slate-500">(opc.)</span>
          </span>
          <input
            list="category-options"
            value={form.category}
            onChange={onChange("category")}
            className={INPUT}
            placeholder="Ej: Bebidas calientes"
          />
          <datalist id="category-options">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-slate-700 dark:text-slate-300">Unidad de venta</span>
          <select
            value={form.unit}
            onChange={onSelectChange("unit")}
            className={INPUT}
          >
            {UNITS.map((u) => (
              <option key={u.value} value={u.value}>{u.label}</option>
            ))}
          </select>
        </label>
      </div>

      {/* Marca + presentación — ayuda a distinguir el mismo producto en distintas marcas/tamaños */}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-slate-700 dark:text-slate-300">
            Marca <span className="text-slate-500">(opc.)</span>
          </span>
          <input
            value={form.brand}
            onChange={onChange("brand")}
            className={INPUT}
            placeholder="Ej: Diana"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-slate-700 dark:text-slate-300">
            Presentación <span className="text-slate-500">(opc.)</span>
          </span>
          <input
            value={form.presentation}
            onChange={onChange("presentation")}
            className={INPUT}
            placeholder="Ej: Libra, Paca x24"
          />
        </label>
      </div>

      {/* Precio + costo */}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-slate-700 dark:text-slate-300">
            {form.soldByWeight ? "Precio por kg (COP)" : "Precio de venta (COP)"} <span className="text-red-500">*</span>
          </span>
          <input
            required
            type="number"
            min="1"
            step="1"
            value={form.price}
            onChange={onChange("price")}
            className={fieldErrors.price ? INPUT_ERROR : INPUT}
            placeholder="2500"
          />
          <FieldError msg={fieldErrors.price} />
          {form.openPrice && (
            <p className="text-xs text-slate-500 dark:text-slate-500">
              Este precio no se usa — en cada venta se pedirá el monto.
            </p>
          )}
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-slate-700 dark:text-slate-300">
            Precio de costo <span className="text-slate-500">(opc.)</span>
          </span>
          <input
            type="number"
            min="0"
            step="1"
            value={form.cost}
            onChange={onChange("cost")}
            className={INPUT}
            placeholder="1500"
          />
        </label>
      </div>

      {/* Impuestos del producto — solo los que el negocio tiene configurados */}
      <div className="space-y-1 text-sm">
        <span className="text-slate-700 dark:text-slate-300">
          Impuestos aplicables <span className="text-slate-500">(opc.)</span>
        </span>
        {businessTaxes.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500 dark:border-white/15 dark:text-slate-500">
            Tu negocio no tiene impuestos configurados. Configúralos en Ajustes para poder asignarlos a este producto.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {businessTaxes.map((t) => (
              <button
                type="button"
                key={t.slot}
                onClick={() => onToggleTaxSlot(t.slot)}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                  form.taxSlots.includes(t.slot)
                    ? "border-violet-400 bg-violet-600 text-white"
                    : "border-slate-300 bg-white text-slate-600 hover:border-violet-300 hover:text-violet-700 dark:border-white/15 dark:bg-slate-900 dark:text-slate-300"
                }`}
              >
                {t.name} {t.rate}%
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Calculadora de precio */}
      <div>
        <button
          type="button"
          onClick={() => setShowCalc((v) => !v)}
          className="text-xs text-violet-600 underline underline-offset-2 hover:text-violet-800 dark:text-violet-400 dark:hover:text-violet-200"
        >
          {showCalc ? "Ocultar calculadora" : "Calcular precio desde costo + margen + impuestos"}
        </button>
        {showCalc && (
          <div className="mt-2">
            <PriceCalculator businessTaxes={businessTaxes} onApply={onApplyCalculator} />
          </div>
        )}
      </div>

      {/* Venta especial: monto libre o por peso */}
      <div className="space-y-2 rounded-xl border border-slate-200 p-3 text-sm dark:border-white/10">
        <span className="text-slate-700 dark:text-slate-300">Venta especial (opc.)</span>
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={form.openPrice}
            onChange={onExclusiveCheckChange("openPrice")}
            className="h-4 w-4 rounded accent-violet-600"
          />
          <span className="text-slate-700 dark:text-slate-300">
            Monto libre <span className="text-slate-500">(ej. confites — se pide el monto en cada venta)</span>
          </span>
        </label>
        {produceModuleEnabled && (
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={form.soldByWeight}
              onChange={onExclusiveCheckChange("soldByWeight")}
              className="h-4 w-4 rounded accent-violet-600"
            />
            <span className="text-slate-700 dark:text-slate-300">
              Se vende por peso (kg) <span className="text-slate-500">(ej. frutas y verduras)</span>
            </span>
          </label>
        )}
      </div>

      {/* Stock */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-2 text-sm">
          {form.openPrice || form.soldByWeight ? (
            <p className="text-xs text-slate-500 dark:text-slate-500">
              Sin control de stock (venta especial)
            </p>
          ) : (
            <>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.trackStock}
                  onChange={onCheckChange("trackStock")}
                  className="h-4 w-4 rounded accent-violet-600"
                />
                <span className="text-slate-700 dark:text-slate-300">
                  Controlar stock
                </span>
              </label>
              {form.trackStock && (
                <div>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form.stock}
                    onChange={onChange("stock")}
                    className={fieldErrors.stock ? INPUT_ERROR : INPUT}
                    placeholder="0"
                  />
                  <FieldError msg={fieldErrors.stock} />
                </div>
              )}
              {!form.trackStock && (
                <p className="text-xs text-slate-500 dark:text-slate-500">
                  Sin límite de stock (ej. productos de servicio)
                </p>
              )}
            </>
          )}
        </div>
        <label className="space-y-1 text-sm">
          <span className="text-slate-700 dark:text-slate-300">
            Lote <span className="text-slate-500">(opc.)</span>
          </span>
          <input
            value={form.lotNumber}
            onChange={onChange("lotNumber")}
            className={INPUT}
            placeholder="Ej: L-2024-001"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-slate-700 dark:text-slate-300">
            Vencimiento <span className="text-slate-500">(opc.)</span>
          </span>
          <input
            type="date"
            min={todayISOString()}
            value={form.expiresAt}
            onChange={onChange("expiresAt")}
            className={fieldErrors.expiresAt ? INPUT_ERROR : INPUT}
          />
          <FieldError msg={fieldErrors.expiresAt} />
        </label>
      </div>

      {/* Código de barras */}
      <label className="block space-y-1 text-sm">
        <span className="text-slate-700 dark:text-slate-300">
          Código de barras <span className="text-slate-500">(opc.)</span>
        </span>
        <div className="flex gap-2">
          <input
            value={form.barcode}
            onChange={onChange("barcode")}
            className={fieldErrors.barcode ? INPUT_ERROR : INPUT}
            placeholder="Ej: 7702001234567"
          />
          <button
            type="button"
            onClick={() => setShowScanner(true)}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-violet-300 bg-white px-3 py-2 text-xs font-semibold text-violet-700 transition hover:bg-violet-50 dark:border-violet-500/40 dark:bg-transparent dark:text-violet-300 dark:hover:bg-violet-900/20"
          >
            <Camera className="h-3.5 w-3.5" /> Escanear
          </button>
        </div>
        <FieldError msg={fieldErrors.barcode} />
      </label>

      {showScanner && (
        <BarcodeScanner
          onDetected={(code) => {
            setShowScanner(false);
            onBarcodeScanned(code);
          }}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  );
}

type RowMode = "view" | "edit" | "price" | "adjust" | "history";

export function ProductManager({ userRole }: Readonly<{ userRole: "OWNER" | "CASHIER" }>) {
  const utils = api.useUtils();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<ProductForm>(emptyForm);
  const [activeRow, setActiveRow] = useState<{ id: string; mode: RowMode } | null>(null);
  const [editForm, setEditForm] = useState<ProductForm>(emptyForm);
  const [adjustForm, setAdjustForm] = useState<AdjustForm>(emptyAdjust);
  const [priceForm, setPriceForm] = useState("");

  const { data: products, isPending: loadingList } = api.product.list.useQuery(undefined, {
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const normalizedSearch = search.trim().toLowerCase();
  const filteredProducts = normalizedSearch
    ? products?.filter((p) => p.name.toLowerCase().includes(normalizedSearch))
    : products;

  const { data: settings } = api.business.getSettings.useQuery(undefined, {
    enabled: userRole === "OWNER",
    staleTime: 30_000,
  });
  const categories = settings?.categories ?? [];
  const businessTaxes: EnabledTax[] = (
    (settings?.taxes as BusinessTax[] | undefined) ?? []
  )
    .map((t, slot) => ({ slot, name: t.name, rate: t.rate, enabled: t.enabled }))
    .filter((t) => t.enabled && t.rate > 0);

  const activeProduct = products?.find((p) => p.id === activeRow?.id);

  const movementsQuery = api.product.listMovements.useQuery(
    { productId: activeRow?.id ?? "" },
    { enabled: activeRow?.mode === "history" && !!activeRow.id && (activeProduct?.trackStock ?? true) },
  );

  const salesQuery = api.product.listProductSales.useQuery(
    { productId: activeRow?.id ?? "" },
    { enabled: activeRow?.mode === "history" && !!activeRow.id && activeProduct?.trackStock === false },
  );

  const createProduct = api.product.create.useMutation({
    onSuccess: async (data) => {
      toast.success(data.message);
      setCreateForm(emptyForm);
      setShowCreate(false);
      await utils.product.list.invalidate();
    },
  });

  const updateProduct = api.product.update.useMutation({
    onMutate: async (newData) => {
      await utils.product.list.cancel();
      const prev = utils.product.list.getData();
      utils.product.list.setData(undefined, (old) =>
        old?.map((p) =>
          p.id === newData.id
            ? {
                ...p,
                name: newData.name,
                price: newData.price,
                cost: newData.cost ?? null,
                unit: newData.unit ?? "und",
                taxSlots: newData.taxSlots ?? [],
                stock: (newData.trackStock ?? true) ? newData.stock : 0,
                trackStock: newData.trackStock ?? true,
                category: newData.category ?? null,
                lotNumber: newData.lotNumber ?? null,
                expiresAt: newData.expiresAt ?? null,
              }
            : p,
        ),
      );
      return { prev };
    },
    onError: (_, __, ctx) => {
      utils.product.list.setData(undefined, ctx?.prev);
    },
    onSuccess: async (data) => {
      toast.success(data.message);
      setActiveRow(null);
      await utils.product.list.invalidate();
    },
  });

  const updatePrice = api.product.updatePrice.useMutation({
    onMutate: async ({ productId, price }) => {
      await utils.product.list.cancel();
      const prev = utils.product.list.getData();
      utils.product.list.setData(undefined, (old) =>
        old?.map((p) => (p.id === productId ? { ...p, price } : p)),
      );
      return { prev };
    },
    onError: (_, __, ctx) => {
      utils.product.list.setData(undefined, ctx?.prev);
    },
    onSuccess: async (data) => {
      toast.success(data.message);
      setActiveRow(null);
      setPriceForm("");
      await utils.product.list.invalidate();
    },
  });

  const adjustStock = api.product.adjustStock.useMutation({
    onMutate: async ({ productId, quantity }) => {
      await utils.product.list.cancel();
      const prev = utils.product.list.getData();
      utils.product.list.setData(undefined, (old) =>
        old?.map((p) =>
          p.id === productId ? { ...p, stock: p.stock + quantity } : p,
        ),
      );
      return { prev };
    },
    onError: (_, __, ctx) => {
      utils.product.list.setData(undefined, ctx?.prev);
    },
    onSuccess: async (data) => {
      toast.success(data.message);
      setAdjustForm(emptyAdjust);
      setActiveRow(null);
      await utils.product.list.invalidate();
    },
  });

  const setActive = api.product.setActive.useMutation({
    onMutate: async ({ productId, isActive }) => {
      await utils.product.list.cancel();
      const prev = utils.product.list.getData();
      utils.product.list.setData(undefined, (old) =>
        old?.map((p) => (p.id === productId ? { ...p, isActive } : p)),
      );
      return { prev };
    },
    onError: (_, __, ctx) => {
      utils.product.list.setData(undefined, ctx?.prev);
    },
    onSuccess: async () => {
      await utils.product.list.invalidate();
    },
  });

  function makeChangeHandler(setter: React.Dispatch<React.SetStateAction<ProductForm>>) {
    return (field: keyof ProductForm) => (e: ChangeEvent<HTMLInputElement>) =>
      setter((prev) => ({ ...prev, [field]: e.target.value }));
  }

  function makeCheckHandler(setter: React.Dispatch<React.SetStateAction<ProductForm>>) {
    return (field: keyof ProductForm) => (e: ChangeEvent<HTMLInputElement>) =>
      setter((prev) => ({ ...prev, [field]: e.target.checked }));
  }

  function makeSelectHandler(setter: React.Dispatch<React.SetStateAction<ProductForm>>) {
    return (field: keyof ProductForm) => (e: ChangeEvent<HTMLSelectElement>) =>
      setter((prev) => ({ ...prev, [field]: e.target.value }));
  }

  // "Monto libre" y "Se vende por peso" son mutuamente excluyentes — activar uno desactiva el otro.
  function makeExclusiveCheckHandler(setter: React.Dispatch<React.SetStateAction<ProductForm>>) {
    return (field: "openPrice" | "soldByWeight") => (e: ChangeEvent<HTMLInputElement>) =>
      setter((prev) => ({
        ...prev,
        openPrice: field === "openPrice" ? e.target.checked : e.target.checked ? false : prev.openPrice,
        soldByWeight: field === "soldByWeight" ? e.target.checked : e.target.checked ? false : prev.soldByWeight,
      }));
  }

  function makeToggleTaxSlotHandler(setter: React.Dispatch<React.SetStateAction<ProductForm>>) {
    return (slot: number) =>
      setter((prev) => ({
        ...prev,
        taxSlots: prev.taxSlots.includes(slot)
          ? prev.taxSlots.filter((s) => s !== slot)
          : [...prev.taxSlots, slot],
      }));
  }

  const openRow = (
    id: string,
    mode: RowMode,
    product?: {
      name: string;
      price: number;
      cost: number | null;
      unit: string;
      taxSlots: number[];
      stock: number;
      trackStock: boolean;
      category: string | null;
      lotNumber: string | null;
      expiresAt: Date | null;
      barcode: string | null;
      brand: string | null;
      presentation: string | null;
      openPrice: boolean;
      soldByWeight: boolean;
    },
  ) => {
    if (activeRow?.id === id && activeRow.mode === mode) {
      setActiveRow(null);
      return;
    }
    setActiveRow({ id, mode });
    if (mode === "edit" && product) {
      setEditForm({
        name: product.name,
        price: String(product.price),
        cost: product.cost != null ? String(product.cost) : "",
        unit: product.unit,
        taxSlots: product.taxSlots,
        stock: String(product.stock),
        trackStock: product.trackStock,
        category: product.category ?? "",
        lotNumber: product.lotNumber ?? "",
        expiresAt: toDateInput(product.expiresAt),
        barcode: product.barcode ?? "",
        brand: product.brand ?? "",
        presentation: product.presentation ?? "",
        openPrice: product.openPrice,
        soldByWeight: product.soldByWeight,
      });
    }
    if (mode === "price" && product) {
      setPriceForm(String(product.price));
      updatePrice.reset();
    }
    if (mode === "adjust") {
      setAdjustForm(emptyAdjust);
      adjustStock.reset();
    }
  };

  const closeRow = () => setActiveRow(null);

  const handleCreate = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    const parsed = parseForm(createForm);
    if (Number.isNaN(parsed.price)) return;
    createProduct.mutate(parsed);
  };

  const handleUpdate = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!activeRow) return;
    const parsed = parseForm(editForm);
    if (Number.isNaN(parsed.price)) return;
    updateProduct.mutate({ id: activeRow.id, ...parsed });
  };

  const handleUpdatePrice = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!activeRow) return;
    const price = Number.parseFloat(priceForm);
    if (Number.isNaN(price) || price <= 0) return;
    updatePrice.mutate({ productId: activeRow.id, price });
  };

  const handleAdjust = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!activeRow) return;
    const qty = Number.parseInt(adjustForm.quantity, 10);
    if (Number.isNaN(qty) || qty === 0) return;
    adjustStock.mutate({
      productId: activeRow.id,
      quantity: qty,
      note: adjustForm.note.trim() || undefined,
    });
  };

  const createErrors = parseZodError(createProduct.error?.message ?? "");
  const updateErrors = parseZodError(updateProduct.error?.message ?? "");

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5">
        {/* Cabecera */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold">Productos registrados</h2>
          {userRole === "OWNER" && (
            <button
              type="button"
              onClick={() => {
                setShowCreate((v) => !v);
                createProduct.reset();
              }}
              className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-violet-500"
            >
              {showCreate ? "Cancelar" : "+ Nuevo producto"}
            </button>
          )}
        </div>

        {/* Buscador */}
        {products && products.length > 0 && (
          <div className="mb-4">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar producto por nombre..."
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-200 dark:border-white/10 dark:bg-white/5 dark:text-white dark:focus:border-violet-500 dark:focus:ring-violet-900"
            />
          </div>
        )}

        {/* Formulario de creación — solo OWNER */}
        {userRole === "OWNER" && showCreate && (
          <form
            onSubmit={handleCreate}
            className="mb-5 space-y-3 border-b border-slate-200 pb-5 dark:border-white/10"
          >
            <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300">
              Crear nuevo producto
            </h3>
            <ProductFormFields
              form={createForm}
              onChange={makeChangeHandler(setCreateForm)}
              onCheckChange={makeCheckHandler(setCreateForm)}
              onSelectChange={makeSelectHandler(setCreateForm)}
              onToggleTaxSlot={makeToggleTaxSlotHandler(setCreateForm)}
              onBarcodeScanned={(code) => setCreateForm((p) => ({ ...p, barcode: code }))}
              onExclusiveCheckChange={makeExclusiveCheckHandler(setCreateForm)}
              fieldErrors={createErrors.fieldErrors}
              categories={categories}
              businessTaxes={businessTaxes}
              produceModuleEnabled={settings?.produceModuleEnabled ?? false}
              onApplyCalculator={(price, cost, taxSlots) =>
                setCreateForm((p) => ({
                  ...p,
                  price: String(price),
                  cost: String(cost),
                  taxSlots,
                }))
              }
            />
            {createErrors.formError && (
              <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
                {createErrors.formError}
              </p>
            )}
            <button
              type="submit"
              disabled={createProduct.isPending}
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {createProduct.isPending ? "Creando..." : "Crear producto"}
            </button>
          </form>
        )}

        {/* Lista */}
        {loadingList ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Cargando productos...</p>
        ) : products?.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No hay productos registrados todavía.
          </p>
        ) : filteredProducts?.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Ningún producto coincide con &quot;{search}&quot;.
          </p>
        ) : (
          <>
            <div className="mb-1 hidden grid-cols-12 gap-2 px-1 text-xs font-medium text-slate-500 sm:grid dark:text-slate-400">
              <span className="col-span-4">Nombre</span>
              <span className="col-span-2 text-right">Precio</span>
              <span className="col-span-1 text-right">Stock</span>
              <span className="col-span-5 text-right">Acciones</span>
            </div>

            <ul className="divide-y divide-slate-100 dark:divide-white/5">
              {filteredProducts?.map((product) => (
                <li key={product.id}>
                  {/* Fila de lectura */}
                  <div className="grid grid-cols-12 items-start gap-2 py-3">
                    <div className="col-span-12 min-w-0 sm:col-span-4">
                      <p className="truncate text-sm font-medium">{product.name}</p>
                      {(product.brand ?? product.presentation) && (
                        <p className="truncate text-xs text-slate-500 dark:text-slate-500">
                          {[product.brand, product.presentation].filter(Boolean).join(" · ")}
                        </p>
                      )}
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
                        <span className="text-xs text-slate-500 dark:text-slate-500">
                          {product.unit}
                        </span>
                      </div>
                      {(product.lotNumber != null || product.expiresAt != null) && (
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                          {[
                            product.lotNumber ? `Lote: ${product.lotNumber}` : null,
                            product.expiresAt ? `Vence: ${formatDate(product.expiresAt)}` : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      )}
                    </div>
                    <div className="col-span-7 pt-0.5 sm:col-span-2 sm:text-right">
                      <p className="text-sm tabular-nums">{formatCOP(product.price)}</p>
                      {/* Costo: solo visible para OWNER */}
                      {userRole === "OWNER" && product.cost != null && (
                        <p className="text-xs text-slate-500 dark:text-slate-500">
                          Costo: {formatCOP(product.cost)}
                        </p>
                      )}
                    </div>
                    <p className="col-span-5 pt-0.5 text-sm tabular-nums sm:col-span-1 sm:text-right">
                      {product.trackStock ? product.stock : "∞"}
                    </p>

                    {/* Botones de acción — condicionados por rol */}
                    <div className="col-span-12 flex flex-wrap gap-1.5 pt-1 sm:col-span-5 sm:justify-end sm:pt-0.5">
                      {/* OWNER: edición completa */}
                      {userRole === "OWNER" && (
                        <button
                          type="button"
                          onClick={() => openRow(product.id, "edit", product)}
                          className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                            activeRow?.id === product.id && activeRow.mode === "edit"
                              ? "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-500/40 dark:bg-violet-500/10 dark:text-violet-300"
                              : "border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/10"
                          }`}
                        >
                          Editar
                        </button>
                      )}

                      {/* CASHIER: solo actualizar precio */}
                      {userRole === "CASHIER" && (
                        <button
                          type="button"
                          onClick={() => openRow(product.id, "price", product)}
                          className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                            activeRow?.id === product.id && activeRow.mode === "price"
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
                          className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                            activeRow?.id === product.id && activeRow.mode === "adjust"
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
                        className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                          activeRow?.id === product.id && activeRow.mode === "history"
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
                          onClick={() =>
                            setActive.mutate({
                              productId: product.id,
                              isActive: !product.isActive,
                            })
                          }
                          disabled={setActive.isPending}
                          className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                            product.isActive
                              ? "bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20"
                              : "bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:hover:bg-emerald-500/20"
                          }`}
                        >
                          {product.isActive ? "Desactivar" : "Activar"}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Panel: Editar completo (solo OWNER) */}
                  {activeRow?.id === product.id && activeRow.mode === "edit" && (
                    <div className="border-t border-slate-100 pb-4 pt-3 dark:border-white/5">
                      <form onSubmit={handleUpdate} className="space-y-3">
                        <ProductFormFields
                          form={editForm}
                          onChange={makeChangeHandler(setEditForm)}
                          onCheckChange={makeCheckHandler(setEditForm)}
                          onSelectChange={makeSelectHandler(setEditForm)}
                          onToggleTaxSlot={makeToggleTaxSlotHandler(setEditForm)}
                          onBarcodeScanned={(code) => setEditForm((p) => ({ ...p, barcode: code }))}
                          onExclusiveCheckChange={makeExclusiveCheckHandler(setEditForm)}
                          fieldErrors={updateErrors.fieldErrors}
                          categories={categories}
                          businessTaxes={businessTaxes}
                          produceModuleEnabled={settings?.produceModuleEnabled ?? false}
                          onApplyCalculator={(price, cost, taxSlots) =>
                            setEditForm((p) => ({
                              ...p,
                              price: String(price),
                              cost: String(cost),
                              taxSlots,
                            }))
                          }
                        />
                        {updateErrors.formError && (
                          <p className="text-xs text-red-600 dark:text-red-400">
                            {updateErrors.formError}
                          </p>
                        )}
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <button
                            type="submit"
                            disabled={updateProduct.isPending}
                            className="min-h-11 rounded-lg bg-violet-600 px-3 text-sm font-medium text-white transition hover:bg-violet-500 disabled:opacity-60"
                          >
                            {updateProduct.isPending ? "Guardando..." : "Guardar"}
                          </button>
                          <button
                            type="button"
                            onClick={closeRow}
                            className="min-h-11 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/10"
                          >
                            Cancelar
                          </button>
                        </div>
                      </form>
                    </div>
                  )}

                  {/* Panel: Actualizar precio (CASHIER y OWNER si quiere) */}
                  {activeRow?.id === product.id && activeRow.mode === "price" && (
                    <div className="border-t border-slate-100 pb-4 pt-3 dark:border-white/5">
                      <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
                        El cambio quedará registrado con tu nombre y la hora exacta.
                      </p>
                      <form onSubmit={handleUpdatePrice} className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                        <label className="flex-1 space-y-1 text-sm sm:min-w-40">
                          <span className="text-slate-700 dark:text-slate-300">
                            Nuevo precio (COP)
                          </span>
                          <input
                            required
                            type="number"
                            min="1"
                            step="1"
                            value={priceForm}
                            onChange={(e) => setPriceForm(e.target.value)}
                            className={INPUT}
                            placeholder={String(product.price)}
                          />
                        </label>
                        <div className="flex gap-2">
                          <button
                            type="submit"
                            disabled={updatePrice.isPending}
                            className="min-h-11 flex-1 rounded-lg bg-violet-600 px-3 text-sm font-medium text-white transition hover:bg-violet-500 disabled:opacity-60 sm:flex-none"
                          >
                            {updatePrice.isPending ? "Guardando..." : "Guardar precio"}
                          </button>
                          <button
                            type="button"
                            onClick={closeRow}
                            className="min-h-11 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/10"
                          >
                            Cancelar
                          </button>
                        </div>
                      </form>
                      {updatePrice.error && (
                        <p className="mt-2 text-xs text-red-600 dark:text-red-400">
                          {updatePrice.error.message}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Panel: Ajustar stock (ambos roles) */}
                  {activeRow?.id === product.id && activeRow.mode === "adjust" && (
                    <div className="border-t border-slate-100 pb-4 pt-3 dark:border-white/5">
                      <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
                        Usa número positivo para agregar stock, negativo para reducirlo.
                        Este movimiento queda registrado con tu nombre en el historial.
                      </p>
                      <form onSubmit={handleAdjust} className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                        <label className="flex-1 space-y-1 text-sm sm:min-w-32">
                          <span className="text-slate-700 dark:text-slate-300">
                            Cantidad (+/-)
                          </span>
                          <input
                            required
                            type="number"
                            value={adjustForm.quantity}
                            onChange={(e) =>
                              setAdjustForm((p) => ({ ...p, quantity: e.target.value }))
                            }
                            className={INPUT}
                            placeholder="Ej: 10 o -3"
                          />
                        </label>
                        <label className="space-y-1 text-sm sm:min-w-48 sm:flex-[2]">
                          <span className="text-slate-700 dark:text-slate-300">
                            Motivo <span className="text-slate-500">(opc.)</span>
                          </span>
                          <input
                            value={adjustForm.note}
                            onChange={(e) =>
                              setAdjustForm((p) => ({ ...p, note: e.target.value }))
                            }
                            className={INPUT}
                            placeholder="Ej: Recepción de pedido"
                          />
                        </label>
                        <div className="flex gap-2 sm:items-end">
                          <button
                            type="submit"
                            disabled={adjustStock.isPending}
                            className="min-h-11 flex-1 rounded-lg bg-amber-500 px-3 text-sm font-medium text-white transition hover:bg-amber-400 disabled:opacity-60 sm:flex-none"
                          >
                            {adjustStock.isPending ? "Ajustando..." : "Aplicar ajuste"}
                          </button>
                          <button
                            type="button"
                            onClick={closeRow}
                            className="min-h-11 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/10"
                          >
                            Cancelar
                          </button>
                        </div>
                      </form>
                      {adjustStock.error && (
                        <p className="mt-2 text-xs text-red-600 dark:text-red-400">
                          {adjustStock.error.message}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Panel: Historial (movimientos para tracked, ventas para no-tracked) */}
                  {activeRow?.id === product.id && activeRow.mode === "history" && (
                    <div className="border-t border-slate-100 pb-4 pt-3 dark:border-white/5">
                      {(product.trackStock ? movementsQuery : salesQuery).isLoading ? (
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Cargando historial...
                        </p>
                      ) : (product.trackStock ? movementsQuery : salesQuery).isError ? (
                        <p className="text-xs text-red-500 dark:text-red-400">
                          No se pudo cargar el historial. Intenta de nuevo.
                        </p>
                      ) : product.trackStock ? (
                        movementsQuery.data?.length === 0 ? (
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Sin movimientos registrados todavía.
                          </p>
                        ) : (
                          <ul className="space-y-0.5">
                            {movementsQuery.data?.slice(0, 10).map((m, i) => (
                              <li
                                key={m.id}
                                className={`flex items-start justify-between gap-4 rounded px-2 py-1.5 text-xs ${
                                  i % 2 === 0
                                    ? "bg-slate-50 dark:bg-white/5"
                                    : "bg-white dark:bg-transparent"
                                }`}
                              >
                                <div className="min-w-0">
                                  <span
                                    className={`font-medium tabular-nums ${
                                      m.quantity > 0
                                        ? "text-emerald-600 dark:text-emerald-400"
                                        : "text-red-600 dark:text-red-400"
                                    }`}
                                  >
                                    {m.quantity > 0 ? "+" : ""}
                                    {m.quantity}
                                  </span>
                                  <span className="ml-2 text-slate-500 dark:text-slate-400">
                                    {REASON_LABELS[m.reason] ?? m.reason}
                                  </span>
                                  {m.note && (
                                    <span className="ml-1 text-slate-500 dark:text-slate-500">
                                      — {m.note}
                                    </span>
                                  )}
                                  <span className="ml-2 text-slate-500 dark:text-slate-500">
                                    por {m.user.name ?? "sistema"}
                                  </span>
                                </div>
                                <div className="shrink-0 text-right text-slate-500 dark:text-slate-500">
                                  <p>Stock: {m.stockAfter}</p>
                                  <p>{new Date(m.createdAt).toLocaleDateString("es-CO")}</p>
                                  <p>
                                    {new Date(m.createdAt).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
                                  </p>
                                </div>
                              </li>
                            ))}
                          </ul>
                        )
                      ) : salesQuery.data?.length === 0 ? (
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Sin ventas registradas todavía.
                        </p>
                      ) : (
                        <ul className="space-y-0.5">
                          {salesQuery.data?.slice(0, 10).map((item, i) => (
                            <li
                              key={item.id}
                              className={`flex items-start justify-between gap-4 rounded px-2 py-1.5 text-xs ${
                                i % 2 === 0
                                  ? "bg-slate-50 dark:bg-white/5"
                                  : "bg-white dark:bg-transparent"
                              }`}
                            >
                              <div className="min-w-0">
                                <span className="font-medium tabular-nums text-red-600 dark:text-red-400">
                                  -{item.quantity}
                                </span>
                                <span className="ml-2 text-slate-500 dark:text-slate-400">
                                  Venta
                                </span>
                                {item.sale.invoiceNumber && (
                                  <span className="ml-1 text-slate-500 dark:text-slate-500">
                                    — {item.sale.invoiceNumber}
                                  </span>
                                )}
                                <span className="ml-2 text-slate-500 dark:text-slate-500">
                                  por {item.sale.user.name ?? "sistema"}
                                </span>
                              </div>
                              <div className="shrink-0 text-right text-slate-500 dark:text-slate-500">
                                <p>${item.price.toLocaleString("es-CO")}</p>
                                <p>{new Date(item.sale.createdAt).toLocaleDateString("es-CO")}</p>
                                <p>
                                  {new Date(item.sale.createdAt).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
                                </p>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
