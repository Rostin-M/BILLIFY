"use client";

import { type ChangeEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "~/trpc/react";

type TaxFormItem = { name: string; rate: string; enabled: boolean };

type ContactSource = "NONE" | "OWNER" | "BUSINESS";
type TaxDetail = "SUMMARY" | "PER_ITEM";

type SettingsForm = {
  name: string;
  address: string;
  phone: string;
  email: string;
  ownerPhone: string;
  invoicePhoneSource: ContactSource;
  invoiceEmailSource: ContactSource;
  invoiceTaxDetail: TaxDetail;
  taxes: [TaxFormItem, TaxFormItem, TaxFormItem];
  autoTax: boolean;
  maxCashRegisters: string;
  categories: string[];
  produceModuleEnabled: boolean;
};

type TaxConfig = { name: string; rate: number; enabled: boolean };

type BusinessData = {
  id: string;
  name: string;
  document: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  invoicePhoneSource: ContactSource;
  invoiceEmailSource: ContactSource;
  invoiceTaxDetail: TaxDetail;
  ownerPhone: string | null;
  ownerEmail: string | null;
  taxes: unknown;
  autoTax: boolean;
  maxCashRegisters: number;
  logoUrl: string | null;
  categories: string[];
  produceModuleEnabled: boolean;
};

function LogoSection({ logoUrl, onLogoChange }: Readonly<{ logoUrl: string | null; onLogoChange: () => void }>) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload/logo", { method: "POST", body: formData });
      const json = await res.json() as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Error al subir el logo");
      } else {
        router.refresh();
        onLogoChange();
      }
    } catch {
      setError("Error de conexión al subir el logo");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async () => {
    setError(null);
    setUploading(true);
    try {
      const res = await fetch("/api/upload/logo", { method: "DELETE" });
      if (!res.ok) {
        setError("Error al eliminar el logo");
      } else {
        router.refresh();
        onLogoChange();
      }
    } catch {
      setError("Error de conexión al eliminar el logo");
    } finally {
      setUploading(false);
    }
  };

  const uploadButtonLabel = logoUrl ? "Cambiar logo" : "Subir logo";

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5">
      <h2 className="mb-1 font-semibold">Logo del negocio</h2>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Se muestra en la parte superior de todos los PDFs generados.{" "}
        <span className="font-medium text-slate-600 dark:text-slate-300">
          Se recomienda PNG con fondo transparente
        </span>{" "}
        (máx. 2 MB).
      </p>

      <div className="flex flex-wrap items-start gap-4">
        {/* Preview */}
        {logoUrl ? (
          <div
            className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border border-slate-200 dark:border-white/10"
            style={{
              backgroundImage:
                "repeating-conic-gradient(#e2e8f0 0% 25%, #f8fafc 0% 50%) 0 0/16px 16px",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoUrl}
              alt="Logo del negocio"
              className="h-full w-full rounded-xl object-contain"
            />
          </div>
        ) : (
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 text-slate-300 dark:border-white/10 dark:bg-white/5 dark:text-slate-600">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
          </div>
        )}

        {/* Acciones */}
        <div className="flex flex-col gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/webp,image/svg+xml"
            className="hidden"
            onChange={handleFileChange}
            disabled={uploading}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="rounded-lg border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-medium text-violet-700 transition hover:bg-violet-100 disabled:opacity-50 dark:border-violet-500/30 dark:bg-violet-900/20 dark:text-violet-300 dark:hover:bg-violet-900/30"
          >
            {uploading ? "Subiendo..." : uploadButtonLabel}
          </button>
          {logoUrl && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={uploading}
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-100 disabled:opacity-50 dark:border-red-500/30 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30"
            >
              Eliminar logo
            </button>
          )}
          <p className="text-xs text-slate-500 dark:text-slate-500">PNG · WebP · SVG</p>
        </div>
      </div>

      {error && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-500/30 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </p>
      )}
    </section>
  );
}

function parseErrorMessage(rawMessage: string): string {
  try {
    const parsed = JSON.parse(rawMessage) as Array<{ message?: string }>;
    if (Array.isArray(parsed)) {
      const first = parsed.find((e) => e.message)?.message;
      if (first) return first;
    }
  } catch {
    // mensaje plano
  }
  return rawMessage;
}

const DEFAULT_NAMES = ["IVA", "INC", ""] as const;

function parseTaxes(raw: unknown): [TaxFormItem, TaxFormItem, TaxFormItem] {
  const arr = Array.isArray(raw) ? (raw as TaxConfig[]) : [];
  const get = (i: number): TaxFormItem => {
    const t = arr[i];
    return {
      name: t?.name ?? DEFAULT_NAMES[i] ?? "",
      rate: t != null ? String(t.rate) : "0",
      enabled: t?.enabled ?? false,
    };
  };
  return [get(0), get(1), get(2)];
}

function BusinessSettingsForm({ initial }: Readonly<{ initial: BusinessData }>) {
  const utils = api.useUtils();
  const [logoUrl, setLogoUrl] = useState<string | null>(initial.logoUrl);
  const [categoryDraft, setCategoryDraft] = useState("");
  const [form, setForm] = useState<SettingsForm>({
    name: initial.name,
    address: initial.address ?? "",
    phone: initial.phone ?? "",
    email: initial.email ?? "",
    ownerPhone: initial.ownerPhone ?? "",
    invoicePhoneSource: initial.invoicePhoneSource,
    invoiceEmailSource: initial.invoiceEmailSource,
    invoiceTaxDetail: initial.invoiceTaxDetail,
    taxes: parseTaxes(initial.taxes),
    autoTax: initial.autoTax,
    maxCashRegisters: String(initial.maxCashRegisters),
    categories: initial.categories,
    produceModuleEnabled: initial.produceModuleEnabled,
  });
  const updateSettings = api.business.updateSettings.useMutation({
    onSuccess: async (data) => {
      toast.success(data.message);
      await utils.business.getSettings.invalidate();
    },
  });

  const handleField =
    (field: "name" | "address" | "phone" | "email" | "ownerPhone" | "maxCashRegisters") =>
    (e: ChangeEvent<HTMLInputElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
    };

  const handleAutoTax = (e: ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, autoTax: e.target.checked }));
  };

  const handleTaxEnabled = (idx: number) => (e: ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => {
      const next = prev.taxes.map((t, i) =>
        i === idx ? { ...t, enabled: e.target.checked } : t,
      ) as [TaxFormItem, TaxFormItem, TaxFormItem];
      return { ...prev, taxes: next };
    });
  };

  const handleTaxText =
    (idx: number, field: "name" | "rate") =>
    (e: ChangeEvent<HTMLInputElement>) => {
      setForm((prev) => {
        const next = prev.taxes.map((t, i) =>
          i === idx ? { ...t, [field]: e.target.value } : t,
        ) as [TaxFormItem, TaxFormItem, TaxFormItem];
        return { ...prev, taxes: next };
      });
    };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const maxReg = Number.parseInt(form.maxCashRegisters, 10);
    if (Number.isNaN(maxReg)) return;

    const taxes = form.taxes
      .map((t) => ({ name: t.name.trim(), rate: Number.parseFloat(t.rate) || 0, enabled: t.enabled }))
      .filter((t) => t.name.length > 0);

    updateSettings.mutate({
      name: form.name,
      address: form.address || undefined,
      phone: form.phone || undefined,
      email: form.email || undefined,
      ownerPhone: form.ownerPhone || undefined,
      invoicePhoneSource: form.invoicePhoneSource,
      invoiceEmailSource: form.invoiceEmailSource,
      invoiceTaxDetail: form.invoiceTaxDetail,
      taxes,
      autoTax: form.autoTax,
      maxCashRegisters: maxReg,
      categories: form.categories,
      produceModuleEnabled: form.produceModuleEnabled,
    });
  };

  function addCategory() {
    const name = categoryDraft.trim();
    if (!name) return;
    setForm((prev) =>
      prev.categories.some((c) => c.toLowerCase() === name.toLowerCase())
        ? prev
        : { ...prev, categories: [...prev.categories, name] },
    );
    setCategoryDraft("");
  }

  function removeCategory(name: string) {
    setForm((prev) => ({ ...prev, categories: prev.categories.filter((c) => c !== name) }));
  }

  return (
    <div className="space-y-6">
      {/* Logo — fuera del form para no interferir con el submit */}
      <LogoSection
        logoUrl={logoUrl}
        onLogoChange={async () => {
          await utils.business.getSettings.invalidate();
          const fresh = await utils.business.getSettings.fetch();
          setLogoUrl(fresh?.logoUrl ?? null);
        }}
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Datos generales */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5">
          <h2 className="mb-4 font-semibold">Datos generales</h2>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="text-slate-700 dark:text-slate-300">Nombre del negocio</span>
                <input
                  required
                  value={form.name}
                  onChange={handleField("name")}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-violet-400 transition focus:ring-2 dark:border-white/15 dark:bg-slate-900"
                  placeholder="Ej: Cafetería El Rincón"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-slate-700 dark:text-slate-300">
                  NIT / Documento del negocio <span className="text-red-500">*</span>
                </span>
                <input
                  disabled
                  value={initial.document}
                  className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-500 dark:border-white/10 dark:bg-slate-800 dark:text-slate-400"
                  title="El documento no es editable"
                />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="text-slate-700 dark:text-slate-300">
                  Dirección <span className="text-slate-500">(opcional)</span>
                </span>
                <input
                  value={form.address}
                  onChange={handleField("address")}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-violet-400 transition focus:ring-2 dark:border-white/15 dark:bg-slate-900"
                  placeholder="Calle 10 # 5-20, Local 3"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-slate-700 dark:text-slate-300">
                  Teléfono <span className="text-slate-500">(opcional)</span>
                </span>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={handleField("phone")}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-violet-400 transition focus:ring-2 dark:border-white/15 dark:bg-slate-900"
                  placeholder="300 123 4567"
                />
              </label>
            </div>
          </div>
        </section>

        {/* Contacto en facturas */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5">
          <h2 className="mb-1 font-semibold">Contacto en facturas</h2>
          <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
            Decide qué teléfono y correo se muestran en las facturas que generas.
          </p>

          <div className="space-y-5">
            {/* Teléfono */}
            <div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1 text-sm">
                  <span className="text-slate-700 dark:text-slate-300">
                    Mi teléfono personal <span className="text-slate-500">(opcional)</span>
                  </span>
                  <input
                    type="tel"
                    value={form.ownerPhone}
                    onChange={handleField("ownerPhone")}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-violet-400 transition focus:ring-2 dark:border-white/15 dark:bg-slate-900"
                    placeholder="300 123 4567"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-slate-700 dark:text-slate-300">¿Qué teléfono va en la factura?</span>
                  <select
                    value={form.invoicePhoneSource}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, invoicePhoneSource: e.target.value as ContactSource }))
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-violet-400 transition focus:ring-2 dark:border-white/15 dark:bg-slate-900"
                  >
                    <option value="NONE">No mostrar teléfono</option>
                    <option value="BUSINESS">Teléfono del negocio</option>
                    <option value="OWNER">Mi teléfono personal</option>
                  </select>
                </label>
              </div>
            </div>

            <div className="border-t border-slate-100 dark:border-white/10" />

            {/* Correo */}
            <div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1 text-sm">
                  <span className="text-slate-700 dark:text-slate-300">
                    Mi correo (propietario) <span className="text-red-500">*</span>
                  </span>
                  <input
                    disabled
                    value={initial.ownerEmail ?? ""}
                    className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-500 dark:border-white/10 dark:bg-slate-800 dark:text-slate-400"
                    title="Se cambia desde tu cuenta"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-slate-700 dark:text-slate-300">
                    Correo del negocio <span className="text-slate-500">(opcional)</span>
                  </span>
                  <input
                    type="email"
                    value={form.email}
                    onChange={handleField("email")}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-violet-400 transition focus:ring-2 dark:border-white/15 dark:bg-slate-900"
                    placeholder="contacto@negocio.com"
                  />
                </label>
              </div>
              <label className="mt-4 block space-y-1 text-sm">
                <span className="text-slate-700 dark:text-slate-300">¿Qué correo va en la factura?</span>
                <select
                  value={form.invoiceEmailSource}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, invoiceEmailSource: e.target.value as ContactSource }))
                  }
                  className="w-full max-w-xs rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-violet-400 transition focus:ring-2 dark:border-white/15 dark:bg-slate-900"
                >
                  <option value="NONE">No mostrar correo</option>
                  <option value="OWNER">Mi correo (propietario)</option>
                  <option value="BUSINESS">Correo del negocio</option>
                </select>
              </label>
            </div>
          </div>
        </section>

        {/* Impuestos */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5">
          <h2 className="mb-1 font-semibold">Impuestos en facturas</h2>
          <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
            Configura hasta 3 impuestos. Se mostrarán en facturas, venta rápida y PDFs.
          </p>

          {/* Toggle global */}
          <label className="mb-4 flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 p-3 dark:border-white/10">
            <input
              type="checkbox"
              checked={form.autoTax}
              onChange={handleAutoTax}
              className="h-4 w-4 rounded accent-violet-600"
            />
            <div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Calcular impuesto en facturas
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-500">
                Si está activo se muestra subtotal + impuestos + total. Si no, solo se muestra el total.
              </p>
            </div>
          </label>

          {/* Slots — solo cuando autoTax está activo */}
          {form.autoTax && (
            <div className="space-y-3">
              <div className="hidden gap-2 px-1 text-xs font-medium text-slate-500 dark:text-slate-400 sm:grid sm:grid-cols-[5rem_1fr_7rem]">
                <span className="text-center">Activo</span>
                <span>Nombre</span>
                <span>Tasa (%)</span>
              </div>
              {form.taxes.map((taxItem, i) => (
                <div
                  key={i}
                  className="flex flex-col gap-2 rounded-xl border border-slate-100 p-2 dark:border-white/5 sm:grid sm:grid-cols-[5rem_1fr_7rem] sm:items-center sm:gap-2 sm:border-0 sm:p-0"
                >
                  <div className="flex items-center gap-2 sm:contents">
                    <label className="flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-2 py-2 dark:border-white/10">
                      <input
                        type="checkbox"
                        checked={taxItem.enabled}
                        onChange={handleTaxEnabled(i)}
                        className="h-4 w-4 rounded accent-violet-600"
                      />
                      <span className="text-xs text-slate-500 dark:text-slate-400">{i + 1}</span>
                    </label>
                    <input
                      value={taxItem.name}
                      onChange={handleTaxText(i, "name")}
                      disabled={!taxItem.enabled}
                      placeholder={`Impuesto ${i + 1}`}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-violet-400 transition focus:ring-2 disabled:bg-slate-50 disabled:text-slate-500 dark:border-white/15 dark:bg-slate-900 dark:disabled:bg-slate-900/50"
                    />
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={taxItem.rate}
                      onChange={handleTaxText(i, "rate")}
                      disabled={!taxItem.enabled}
                      placeholder="0"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 pr-7 text-sm outline-none ring-violet-400 transition focus:ring-2 disabled:bg-slate-50 disabled:text-slate-500 dark:border-white/15 dark:bg-slate-900 dark:disabled:bg-slate-900/50"
                    />
                    <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-500">
                      %
                    </span>
                  </div>
                </div>
              ))}
              <p className="text-xs text-slate-500 dark:text-slate-500">
                Activa cada impuesto por separado. Los desactivados no se incluirán en el cálculo.
              </p>

              <div className="border-t border-slate-100 pt-3 dark:border-white/10">
                <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                  ¿Cómo mostrar los impuestos en la factura?
                </p>
                <div className="space-y-2">
                  <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 p-3 dark:border-white/10">
                    <input
                      type="radio"
                      name="invoiceTaxDetail"
                      checked={form.invoiceTaxDetail === "SUMMARY"}
                      onChange={() => setForm((prev) => ({ ...prev, invoiceTaxDetail: "SUMMARY" }))}
                      className="mt-0.5 h-4 w-4 accent-violet-600"
                    />
                    <span>
                      <span className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                        Solo el total al final (actual)
                      </span>
                      <span className="block text-xs text-slate-500 dark:text-slate-500">
                        La factura muestra subtotal, impuestos y total agrupados al final, sin desglosar por producto.
                      </span>
                    </span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 p-3 dark:border-white/10">
                    <input
                      type="radio"
                      name="invoiceTaxDetail"
                      checked={form.invoiceTaxDetail === "PER_ITEM"}
                      onChange={() => setForm((prev) => ({ ...prev, invoiceTaxDetail: "PER_ITEM" }))}
                      className="mt-0.5 h-4 w-4 accent-violet-600"
                    />
                    <span>
                      <span className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                        Desglosado por producto
                      </span>
                      <span className="block text-xs text-slate-500 dark:text-slate-500">
                        Cada producto muestra qué impuesto se le cobra (o ninguno) y su valor, además del resumen final.
                      </span>
                    </span>
                  </label>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Categorías de productos */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5">
          <h2 className="mb-1 font-semibold">Categorías de productos</h2>
          <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
            Aparecerán como sugerencias al crear o editar un producto.
          </p>

          <div className="flex gap-2">
            <input
              value={categoryDraft}
              onChange={(e) => setCategoryDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCategory();
                }
              }}
              placeholder="Ej: Bebidas frías"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-violet-400 transition focus:ring-2 dark:border-white/15 dark:bg-slate-900"
            />
            <button
              type="button"
              onClick={addCategory}
              disabled={!categoryDraft.trim()}
              className="shrink-0 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Agregar
            </button>
          </div>

          {form.categories.length === 0 ? (
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-500">
              Aún no has agregado categorías.
            </p>
          ) : (
            <ul className="mt-3 flex flex-wrap gap-2">
              {form.categories.map((c) => (
                <li
                  key={c}
                  className="flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 py-1 pl-3 pr-1.5 text-xs font-medium text-violet-700 dark:border-violet-500/30 dark:bg-violet-900/20 dark:text-violet-300"
                >
                  {c}
                  <button
                    type="button"
                    onClick={() => removeCategory(c)}
                    aria-label={`Eliminar categoría ${c}`}
                    className="flex h-4 w-4 items-center justify-center rounded-full text-violet-400 transition hover:bg-violet-200 hover:text-violet-700 dark:text-violet-500 dark:hover:bg-violet-800/40 dark:hover:text-violet-200"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Frutas y verduras (venta por peso) */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5">
          <h2 className="mb-1 font-semibold">Frutas y verduras</h2>
          <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
            Actívalo si vendes productos por peso (ej. tomate, papa). Habilita la opción &quot;Se vende por peso&quot; en el formulario de productos.
          </p>
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 p-3 dark:border-white/10">
            <input
              type="checkbox"
              checked={form.produceModuleEnabled}
              onChange={(e) => setForm((prev) => ({ ...prev, produceModuleEnabled: e.target.checked }))}
              className="h-4 w-4 rounded accent-violet-600"
            />
            <div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Habilitar venta por peso
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-500">
                Si no vendes productos por peso, déjalo desactivado para no complicar el formulario de productos.
              </p>
            </div>
          </label>
        </section>

        {/* Caja */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5">
          <h2 className="mb-1 font-semibold">Cajas registradoras</h2>
          <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
            Número máximo de cajas simultáneas permitidas para este negocio.
          </p>
          <label className="max-w-40 space-y-1 text-sm">
            <span className="text-slate-700 dark:text-slate-300">Máximo de cajas</span>
            <input
              type="number"
              min="1"
              max="10"
              step="1"
              value={form.maxCashRegisters}
              onChange={handleField("maxCashRegisters")}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-violet-400 transition focus:ring-2 dark:border-white/15 dark:bg-slate-900"
            />
          </label>
        </section>

        {updateSettings.error && (
          <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
            {parseErrorMessage(updateSettings.error.message)}
          </p>
        )}

        <button
          type="submit"
          disabled={updateSettings.isPending}
          className="w-full rounded-lg bg-violet-600 px-4 py-2.5 font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:px-8"
        >
          {updateSettings.isPending ? "Guardando..." : "Guardar configuración"}
        </button>
      </form>
    </div>
  );
}

export function BusinessSettings() {
  const { data: settings, isPending: loadingSettings } =
    api.business.getSettings.useQuery();

  if (loadingSettings) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Cargando configuración...
      </p>
    );
  }

  if (!settings) return null;

  return <BusinessSettingsForm initial={settings} />;
}
