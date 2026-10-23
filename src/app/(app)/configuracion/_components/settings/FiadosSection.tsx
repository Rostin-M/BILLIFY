"use client";

import { DEFAULT_CREDIT_TERMS, MAX_CREDIT_TERMS_LENGTH, renderCreditTerms } from "~/lib/creditTerms";
import type { SectionProps } from "./types";
import { changedInput, dividerClass, FieldLabel, inputClass, SubHeading, ToggleRow } from "./ui";

export function FiadosSection({ form, saved, update, businessName }: SectionProps & Readonly<{ businessName: string }>) {
  const termsChanged = form.creditTerms !== saved.creditTerms;
  const preview = renderCreditTerms(form.creditTerms, {
    businessName: businessName || "Tu negocio",
    customerName: "Ana Pérez",
    creditLimit: 200000,
    creditTermDays: 15,
  });

  return (
    <>
      <div className="space-y-3">
        <SubHeading>Firma del cliente</SubHeading>
        <ToggleRow
          changed={form.creditSignatureRequired !== saved.creditSignatureRequired}
          checked={form.creditSignatureRequired}
          onChange={(checked) => update({ creditSignatureRequired: checked })}
          title="Exigir la firma para fiar"
          description={
            <>
              Antes de fiarle a un cliente, tiene que firmar el acuerdo en pantalla (en Fiados → Abrir cuenta). Si está
              apagado, la firma es opcional: igual puedes pedirla y enviarle el PDF por correo.
            </>
          }
        />
      </div>

      <div className={dividerClass} />

      <div className="space-y-2">
        <SubHeading>Condiciones del acuerdo</SubHeading>
        <label className="block space-y-1 text-sm">
          <FieldLabel changed={termsChanged}>Texto que el cliente acepta</FieldLabel>
          <textarea
            rows={9}
            maxLength={MAX_CREDIT_TERMS_LENGTH}
            value={form.creditTerms || DEFAULT_CREDIT_TERMS}
            onChange={(e) => update({ creditTerms: e.target.value === DEFAULT_CREDIT_TERMS ? "" : e.target.value })}
            className={`${inputClass} min-h-48 py-2 leading-relaxed ${changedInput(termsChanged)}`}
          />
        </label>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Se llenan solos al firmar: <code>{"{negocio}"}</code>, <code>{"{cliente}"}</code>, <code>{"{limite}"}</code>{" "}
          (monto máximo) y <code>{"{plazo}"}</code>. Este texto sirve como constancia de lo que el cliente aceptó; no es un
          pagaré ni un título valor.
        </p>
        {form.creditTerms && (
          <button
            type="button"
            onClick={() => update({ creditTerms: "" })}
            className="text-xs font-semibold text-violet-600 underline underline-offset-2 dark:text-violet-400"
          >
            Volver al texto por defecto
          </button>
        )}
        <details className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm dark:border-white/10 dark:bg-white/5">
          <summary className="cursor-pointer font-medium text-slate-700 dark:text-slate-200">Así lo verá el cliente (ejemplo)</summary>
          <div className="mt-2 space-y-1.5 whitespace-pre-line text-slate-600 dark:text-slate-300">{preview}</div>
        </details>
      </div>
    </>
  );
}
