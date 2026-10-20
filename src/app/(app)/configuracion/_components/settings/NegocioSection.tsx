"use client";

import type { SectionProps } from "./types";
import { changedInput, FieldLabel, inputClass, labelTextClass, Optional, readOnlyInputClass } from "./ui";

export function NegocioSection({
  form,
  saved,
  update,
  document,
}: SectionProps & Readonly<{ document: string }>) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <FieldLabel changed={form.name !== saved.name}>Nombre del negocio</FieldLabel>
          <input
            required
            minLength={2}
            maxLength={80}
            value={form.name}
            onChange={(e) => update({ name: e.target.value })}
            className={`${inputClass} ${changedInput(form.name !== saved.name)}`}
            placeholder="Ej: Cafetería El Rincón"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className={labelTextClass}>
            NIT / Documento del negocio <span className="text-red-500">*</span>
          </span>
          <input
            disabled
            value={document}
            className={readOnlyInputClass}
            title="El documento no es editable"
          />
        </label>
      </div>

      <label className="block space-y-1 text-sm">
        <FieldLabel changed={form.address !== saved.address}>
          Dirección <Optional />
        </FieldLabel>
        <input
          maxLength={200}
          value={form.address}
          onChange={(e) => update({ address: e.target.value })}
          className={`${inputClass} ${changedInput(form.address !== saved.address)}`}
          placeholder="Calle 10 # 5-20, Local 3"
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <FieldLabel changed={form.phone !== saved.phone}>
            Teléfono del negocio <Optional />
          </FieldLabel>
          <input
            type="tel"
            maxLength={20}
            value={form.phone}
            onChange={(e) => update({ phone: e.target.value })}
            className={`${inputClass} ${changedInput(form.phone !== saved.phone)}`}
            placeholder="300 123 4567"
          />
        </label>
        <label className="space-y-1 text-sm">
          <FieldLabel changed={form.email !== saved.email}>
            Correo del negocio <Optional />
          </FieldLabel>
          <input
            type="email"
            maxLength={254}
            value={form.email}
            onChange={(e) => update({ email: e.target.value })}
            className={`${inputClass} ${changedInput(form.email !== saved.email)}`}
            placeholder="contacto@negocio.com"
          />
        </label>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        En <span className="font-medium">Facturación e impuestos</span> decides si este teléfono y
        correo aparecen en las facturas.
      </p>
    </>
  );
}
