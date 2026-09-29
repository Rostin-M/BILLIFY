"use client";

import type { ContactSource, SectionProps, TaxFormItem, TaxSlots } from "./types";
import {
  CheckboxRow,
  dividerClass,
  inputClass,
  labelTextClass,
  Notice,
  Optional,
  readOnlyInputClass,
  SubHeading,
} from "./ui";

export function FacturacionSection({
  form,
  saved,
  update,
  ownerEmail,
}: SectionProps & Readonly<{ ownerEmail: string | null }>) {
  const updateTax = (idx: number, patch: Partial<TaxFormItem>) => {
    const next = form.taxes.map((t, i) => (i === idx ? { ...t, ...patch } : t)) as TaxSlots;
    update({ taxes: next });
  };

  // El servidor valida contra lo guardado en "Negocio", no contra borradores
  const missingBusinessPhone = form.invoicePhoneSource === "BUSINESS" && !saved.phone.trim();
  const missingBusinessEmail = form.invoiceEmailSource === "BUSINESS" && !saved.email.trim();

  return (
    <>
      {/* Contacto en facturas */}
      <div>
        <SubHeading>Contacto en facturas</SubHeading>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className={labelTextClass}>
                Mi teléfono personal <Optional />
              </span>
              <input
                type="tel"
                maxLength={20}
                value={form.ownerPhone}
                onChange={(e) => update({ ownerPhone: e.target.value })}
                className={inputClass}
                placeholder="300 123 4567"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className={labelTextClass}>¿Qué teléfono va en la factura?</span>
              <select
                value={form.invoicePhoneSource}
                onChange={(e) => update({ invoicePhoneSource: e.target.value as ContactSource })}
                className={inputClass}
              >
                <option value="NONE">No mostrar teléfono</option>
                <option value="BUSINESS">Teléfono del negocio</option>
                <option value="OWNER">Mi teléfono personal</option>
              </select>
            </label>
          </div>
          {missingBusinessPhone && (
            <Notice>
              Primero guarda el teléfono del negocio en la sección <strong>Negocio</strong>.
            </Notice>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className={labelTextClass}>Mi correo (propietario)</span>
              <input
                disabled
                value={ownerEmail ?? ""}
                className={readOnlyInputClass}
                title="Se cambia desde tu cuenta"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className={labelTextClass}>¿Qué correo va en la factura?</span>
              <select
                value={form.invoiceEmailSource}
                onChange={(e) => update({ invoiceEmailSource: e.target.value as ContactSource })}
                className={inputClass}
              >
                <option value="NONE">No mostrar correo</option>
                <option value="OWNER">Mi correo (propietario)</option>
                <option value="BUSINESS">Correo del negocio</option>
              </select>
            </label>
          </div>
          {missingBusinessEmail && (
            <Notice>
              Primero guarda el correo del negocio en la sección <strong>Negocio</strong>.
            </Notice>
          )}
        </div>
      </div>

      <div className={dividerClass} />

      {/* Impuestos */}
      <div>
        <SubHeading>Impuestos</SubHeading>
        <div className="space-y-4">
          <CheckboxRow
            checked={form.autoTax}
            onChange={(checked) => update({ autoTax: checked })}
            title="Calcular impuesto en facturas"
            description="Si está activo se muestra subtotal + impuestos + total. Si no, solo se muestra el total."
          />

          {/* Slots — solo cuando autoTax está activo */}
          {form.autoTax && (
            <div className="space-y-3">
              <p className="text-xs text-slate-500 dark:text-slate-500">
                Configura hasta 3 impuestos. Se mostrarán en facturas, venta rápida y PDFs.
              </p>
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
                        onChange={(e) => updateTax(i, { enabled: e.target.checked })}
                        aria-label={`Activar impuesto ${i + 1}`}
                        className="h-4 w-4 rounded accent-violet-600"
                      />
                      <span className="text-xs text-slate-500 dark:text-slate-400">{i + 1}</span>
                    </label>
                    <input
                      value={taxItem.name}
                      maxLength={40}
                      onChange={(e) => updateTax(i, { name: e.target.value })}
                      disabled={!taxItem.enabled}
                      placeholder={`Impuesto ${i + 1}`}
                      aria-label={`Nombre del impuesto ${i + 1}`}
                      className={inputClass}
                    />
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={taxItem.rate}
                      onChange={(e) => updateTax(i, { rate: e.target.value })}
                      disabled={!taxItem.enabled}
                      placeholder="0"
                      aria-label={`Tasa del impuesto ${i + 1}`}
                      className={`${inputClass} pr-7`}
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

              <div className={`${dividerClass} pt-3`}>
                <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                  ¿Cómo mostrar los impuestos en la factura?
                </p>
                <div className="space-y-2">
                  <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 p-3 dark:border-white/10">
                    <input
                      type="radio"
                      name="invoiceTaxDetail"
                      checked={form.invoiceTaxDetail === "SUMMARY"}
                      onChange={() => update({ invoiceTaxDetail: "SUMMARY" })}
                      aria-label="Solo el total al final (actual)"
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
                      onChange={() => update({ invoiceTaxDetail: "PER_ITEM" })}
                      aria-label="Desglosado por producto"
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
        </div>
      </div>
    </>
  );
}
