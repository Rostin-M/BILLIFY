"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Camera, ChevronDown } from "lucide-react";
import { type ChangeEvent, useId, useState } from "react";

import { PlanFeatureLocked, usePlanFeature } from "~/app/_components/subscription/PlanFeatureLocked";

import { BrandCombobox } from "./BrandCombobox";
import { PriceCalculator } from "./PriceCalculator";
import {
  ADVANCED_FIELDS,
  type EnabledTax,
  hasAdvancedData,
  INPUT,
  INPUT_ERROR,
  type ProductForm,
  todayISOString,
  UNITS,
} from "./productForm";

// Cámara y lector (@zxing) solo se descargan al abrir el escáner.
const BarcodeScanner = dynamic(() => import("~/app/_components/BarcodeScanner").then((m) => m.BarcodeScanner), {
  ssr: false,
});

function FieldError({ msg }: Readonly<{ msg?: string }>) {
  if (!msg) return null;
  return <p className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">{msg}</p>;
}

export function ProductFormFields({
  form,
  onChange,
  onCheckChange,
  onSelectChange,
  onToggleTaxSlot,
  onBarcodeScanned,
  onExclusiveCheckChange,
  fieldErrors,
  onApplyCalculator,
  onBrandChange,
  categories,
  brands,
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
  onBrandChange: (brand: string) => void;
  categories: string[];
  brands: string[];
  businessTaxes: EnabledTax[];
  produceModuleEnabled: boolean;
}>) {
  const [showCalc, setShowCalc] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  // Al editar un producto que ya usa estos campos, se abren solos para no esconder sus datos.
  const [showMore, setShowMore] = useState(() => hasAdvancedData(form));
  const moreId = useId();
  const brandId = useId();
  // Si el servidor rechaza un campo de "Más opciones", se muestra aunque esté cerrado.
  const advancedHasError = ADVANCED_FIELDS.some((f) => fieldErrors[f]);
  const moreOpen = showMore || advancedHasError;
  // Lote y vencimiento dependen del plan; sin la función, el servidor los ignora.
  const hasLots = usePlanFeature("lots");

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1 text-sm sm:col-span-2">
          <span className="text-slate-700 dark:text-slate-300">
            Nombre <span className="text-red-500">*</span>
          </span>
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
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Este precio no se usa — en cada venta se pedirá el monto.
            </p>
          )}
        </label>

        <div className="space-y-1 text-sm">
          {form.openPrice || form.soldByWeight ? (
            <p className="pt-6 text-xs text-slate-500 dark:text-slate-400">
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
                    aria-label="Stock inicial"
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
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Sin límite de stock (ej. productos de servicio)
                </p>
              )}
            </>
          )}
        </div>
      </div>

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

      {/* Más opciones: datos que no hacen falta para empezar a vender */}
      <div className="rounded-xl border border-slate-200 dark:border-white/10">
        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          aria-expanded={moreOpen}
          aria-controls={moreId}
          className="flex min-h-11 w-full items-center justify-between gap-3 px-3 text-left text-sm"
        >
          <span>
            <span className="font-medium text-slate-700 dark:text-slate-200">Más opciones</span>
            <span className="block text-xs text-slate-500 dark:text-slate-400">
              Categoría, marca, costo, impuestos, venta por peso o monto libre, lote y vencimiento
            </span>
          </span>
          <ChevronDown
            aria-hidden="true"
            className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${moreOpen ? "rotate-180" : ""}`}
          />
        </button>

        {moreOpen && (
          <div id={moreId} className="space-y-3 border-t border-slate-200 p-3 dark:border-white/10">
            {/* Categoría + marca + presentación — ayuda a distinguir el mismo producto en distintas marcas/tamaños */}
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="space-y-1 text-sm">
                <span className="text-slate-700 dark:text-slate-300">Categoría</span>
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
              <div className="space-y-1 text-sm">
                <label htmlFor={brandId} className="text-slate-700 dark:text-slate-300">Marca</label>
                <BrandCombobox id={brandId} value={form.brand} brands={brands} onChange={onBrandChange} />
              </div>
              <label className="space-y-1 text-sm">
                <span className="text-slate-700 dark:text-slate-300">Presentación</span>
                <input
                  value={form.presentation}
                  onChange={onChange("presentation")}
                  className={INPUT}
                  placeholder="Ej: Libra, Paca x24"
                />
              </label>
            </div>

            <label className="block space-y-1 text-sm sm:max-w-xs">
              <span className="text-slate-700 dark:text-slate-300">Precio de costo</span>
              <input
                type="number"
                min="0"
                step="1"
                value={form.cost}
                onChange={onChange("cost")}
                className={fieldErrors.cost ? INPUT_ERROR : INPUT}
                placeholder="1500"
              />
              <FieldError msg={fieldErrors.cost} />
            </label>

            {/* Impuestos del producto — solo los que el negocio tiene configurados */}
            <div className="space-y-1 text-sm">
              <span className="text-slate-700 dark:text-slate-300">Impuestos aplicables</span>
              {businessTaxes.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500 dark:border-white/15 dark:text-slate-400">
                  Tu negocio no tiene impuestos configurados. Agrégalos en{" "}
                  <Link href="/configuracion" className="font-medium text-violet-700 underline underline-offset-2 dark:text-violet-300">
                    Configuración → Facturación e impuestos
                  </Link>{" "}
                  para asignarlos a este producto.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {businessTaxes.map((t) => (
                    <button
                      type="button"
                      key={t.slot}
                      onClick={() => onToggleTaxSlot(t.slot)}
                      aria-pressed={form.taxSlots.includes(t.slot)}
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

            <div className="space-y-2 rounded-xl border border-slate-200 p-3 text-sm dark:border-white/10">
              <span className="text-slate-700 dark:text-slate-300">Venta especial</span>
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

            {hasLots === false ? (
              <PlanFeatureLocked compact feature="lots" title="Lote y fecha de vencimiento" />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-sm">
                  <span className="text-slate-700 dark:text-slate-300">Lote</span>
                  <input
                    value={form.lotNumber}
                    onChange={onChange("lotNumber")}
                    className={INPUT}
                    placeholder="Ej: L-2024-001"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-slate-700 dark:text-slate-300">Vencimiento</span>
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
            )}
          </div>
        )}
      </div>

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
