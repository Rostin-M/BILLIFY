import type { ChangeEvent, Dispatch, SetStateAction } from "react";

export type ProductForm = {
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

export type AdjustForm = { quantity: string; note: string };

export const emptyForm: ProductForm = {
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

export const emptyAdjust: AdjustForm = { quantity: "", note: "" };

export const UNITS = [
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

export type BusinessTax = { name: string; rate: number; enabled: boolean };
export type EnabledTax = { slot: number; name: string; rate: number };

// Sin decimales a propósito (la calculadora de precio produce bases con decimales);
// por eso no usa el formatCOP compartido de ~/lib/format/money.
export function formatCOP(value: number): string {
  return value.toLocaleString("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

export function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString("es-CO", {
    timeZone: "America/Bogota",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function toDateInput(date: Date | null | undefined): string {
  if (!date) return "";
  return new Date(date).toISOString().split("T")[0] ?? "";
}

export function todayISOString(): string {
  const now = new Date();
  now.setDate(now.getDate() + 1);
  return now.toISOString().split("T")[0] ?? "";
}

export function parseForm(form: ProductForm) {
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

/** Campos que van dentro de "Más opciones" en el formulario. */
export function hasAdvancedData(form: ProductForm): boolean {
  return (
    form.category.trim() !== "" ||
    form.brand.trim() !== "" ||
    form.presentation.trim() !== "" ||
    form.cost !== "" ||
    form.taxSlots.length > 0 ||
    form.openPrice ||
    form.soldByWeight ||
    form.lotNumber.trim() !== "" ||
    form.expiresAt !== ""
  );
}

export const ADVANCED_FIELDS = ["category", "brand", "presentation", "cost", "taxSlots", "lotNumber", "expiresAt"];

export const INPUT =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-violet-400 transition focus:ring-2 dark:border-white/15 dark:bg-slate-900";

export const INPUT_ERROR =
  "w-full rounded-lg border border-red-400 bg-white px-3 py-2 text-sm outline-none ring-red-400 transition focus:ring-2 dark:border-red-500/60 dark:bg-slate-900";

type FormSetter = Dispatch<SetStateAction<ProductForm>>;

export function makeChangeHandler(setter: FormSetter) {
  return (field: keyof ProductForm) => (e: ChangeEvent<HTMLInputElement>) =>
    setter((prev) => ({ ...prev, [field]: e.target.value }));
}

export function makeCheckHandler(setter: FormSetter) {
  return (field: keyof ProductForm) => (e: ChangeEvent<HTMLInputElement>) =>
    setter((prev) => ({ ...prev, [field]: e.target.checked }));
}

export function makeSelectHandler(setter: FormSetter) {
  return (field: keyof ProductForm) => (e: ChangeEvent<HTMLSelectElement>) =>
    setter((prev) => ({ ...prev, [field]: e.target.value }));
}

// "Monto libre" y "Se vende por peso" son mutuamente excluyentes — activar uno desactiva el otro.
export function makeExclusiveCheckHandler(setter: FormSetter) {
  return (field: "openPrice" | "soldByWeight") => (e: ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    setter((prev) => {
      if (field === "openPrice") {
        return { ...prev, openPrice: checked, soldByWeight: checked ? false : prev.soldByWeight };
      }
      return { ...prev, soldByWeight: checked, openPrice: checked ? false : prev.openPrice };
    });
  };
}

export function makeToggleTaxSlotHandler(setter: FormSetter) {
  return (slot: number) =>
    setter((prev) => ({
      ...prev,
      taxSlots: prev.taxSlots.includes(slot)
        ? prev.taxSlots.filter((s) => s !== slot)
        : [...prev.taxSlots, slot],
    }));
}
