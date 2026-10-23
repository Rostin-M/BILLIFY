"use client";

import { UserCheck, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "~/trpc/react";
import { Modal } from "~/app/_components/ui/Modal";
import { renderCreditTerms } from "~/lib/creditTerms";
import { formatCOP } from "~/lib/format/money";
import { SignaturePad } from "./SignaturePad";

type Customer = { id: string; name: string; document: string | null; email: string | null };

type Props = {
  customer?: Customer & { creditLimit: number | null; creditTermDays: number | null };
  onClose: () => void;
};

const TERM_PRESETS: { label: string; days: number | null }[] = [
  { label: "Sin fecha", days: null },
  { label: "8 días", days: 8 },
  { label: "15 días", days: 15 },
  { label: "30 días", days: 30 },
];

const inputClass =
  "min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base outline-none ring-violet-400 focus:ring-2 sm:text-sm dark:border-white/15 dark:bg-slate-800 dark:text-white";
const labelClass = "text-xs font-medium text-slate-600 dark:text-slate-300";
const chip = (active: boolean) =>
  `min-h-10 rounded-lg border px-3 text-sm font-semibold transition ${
    active
      ? "border-violet-500 bg-violet-50 text-violet-700 dark:border-violet-400 dark:bg-violet-900/30 dark:text-violet-200"
      : "border-slate-200 bg-white text-slate-600 dark:border-white/10 dark:bg-transparent dark:text-slate-300"
  }`;

function CustomerStep({ onPick }: Readonly<{ onPick: (c: Customer) => void }>) {
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", document: "", phone: "", email: "" });
  const utils = api.useUtils();
  const { data: results = [] } = api.customer.search.useQuery({ q: query.trim() }, { enabled: query.trim().length >= 2 });

  const create = api.customer.create.useMutation({
    onSuccess: async (c) => {
      await utils.customer.search.invalidate();
      onPick({ id: c.id, name: c.name, document: form.document.trim() || null, email: form.email.trim() || null });
    },
  });

  if (creating) {
    return (
      <form
        onSubmit={(e) => { e.preventDefault(); create.mutate(form); }}
        className="space-y-3"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1"><span className={labelClass}>Nombre completo</span>
            <input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={120} className={inputClass} />
          </label>
          <label className="space-y-1"><span className={labelClass}>Cédula</span>
            <input value={form.document} onChange={(e) => setForm({ ...form, document: e.target.value })} maxLength={20} inputMode="numeric" className={inputClass} />
          </label>
          <label className="space-y-1"><span className={labelClass}>Celular</span>
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} maxLength={20} inputMode="tel" className={inputClass} />
          </label>
          <label className="space-y-1"><span className={labelClass}>Correo (para enviarle el acuerdo)</span>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} maxLength={254} className={inputClass} />
          </label>
        </div>
        {create.error && <p role="alert" className="text-sm text-red-600">{create.error.message}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={() => setCreating(false)} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm dark:border-white/10 dark:text-slate-300">Volver</button>
          <button type="submit" disabled={form.name.trim().length < 2 || create.isPending} className="min-h-11 flex-1 rounded-xl bg-violet-600 px-4 text-sm font-bold text-white disabled:opacity-50">
            {create.isPending ? "Guardando..." : "Guardar cliente y seguir"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-2">
      <label className="block space-y-1">
        <span className={labelClass}>¿A quién le abres el fiado?</span>
        <input autoFocus type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar cliente por nombre, apodo o cédula" className={inputClass} />
      </label>
      {results.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-white/5 dark:border-white/10">
          {results.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onPick({ id: c.id, name: c.name, document: c.document, email: c.email })}
                className="flex min-h-11 w-full flex-col justify-center px-3 py-2 text-left hover:bg-violet-50 dark:hover:bg-violet-900/20"
              >
                <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{c.name}</span>
                {(c.document ?? c.phone) && <span className="text-xs text-slate-500">{[c.document, c.phone].filter(Boolean).join(" · ")}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={() => { setForm({ name: query.trim(), document: "", phone: "", email: "" }); setCreating(true); }}
        className="min-h-11 w-full rounded-xl border border-dashed border-violet-300 text-sm font-semibold text-violet-700 hover:bg-violet-50 dark:border-violet-500/40 dark:text-violet-300 dark:hover:bg-violet-900/20"
      >
        + Cliente nuevo{query.trim() ? `: "${query.trim()}"` : ""}
      </button>
    </div>
  );
}

type LimitAndTermProps = {
  noLimit: boolean; setNoLimit: (v: boolean) => void;
  limit: string; setLimit: (v: string) => void; limitValue: number | null;
  termDays: number | null; setTermDays: (v: number | null) => void;
  useCustomTerm: boolean; setUseCustomTerm: (v: boolean) => void;
  customTerm: string; setCustomTerm: (v: string) => void;
};

function LimitAndTermFields({
  noLimit, setNoLimit, limit, setLimit, limitValue, termDays, setTermDays, useCustomTerm, setUseCustomTerm, customTerm, setCustomTerm,
}: Readonly<LimitAndTermProps>) {
  return (
    <section className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1.5">
        <span className={labelClass}>Monto máximo que puede deber</span>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">$</span>
          <input
            type="number"
            inputMode="numeric"
            min="1"
            aria-label="Monto máximo"
            disabled={noLimit}
            value={noLimit ? "" : limit}
            onChange={(e) => setLimit(e.target.value)}
            placeholder={noLimit ? "Sin límite" : "Ej: 200000"}
            className={`${inputClass} pl-7 disabled:bg-slate-100 dark:disabled:bg-slate-800/50`}
          />
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <input type="checkbox" checked={noLimit} onChange={(e) => setNoLimit(e.target.checked)} className="h-4 w-4 accent-violet-600" />
          <span>Sin límite</span>
        </label>
        {!noLimit && limitValue && limitValue > 0 && <p className="text-xs text-slate-500">{formatCOP(limitValue)}</p>}
      </div>
      <div className="space-y-1.5">
        <span className={labelClass}>Plazo para pagar cada fiado</span>
        <div className="flex flex-wrap gap-1.5">
          {TERM_PRESETS.map((p) => (
            <button key={p.label} type="button" onClick={() => { setTermDays(p.days); setUseCustomTerm(false); }} aria-pressed={!useCustomTerm && termDays === p.days} className={chip(!useCustomTerm && termDays === p.days)}>
              {p.label}
            </button>
          ))}
          <button type="button" onClick={() => setUseCustomTerm(true)} aria-pressed={useCustomTerm} className={chip(useCustomTerm)}>Otro</button>
        </div>
        {useCustomTerm && (
          <label className="flex items-center gap-2">
            <input type="number" inputMode="numeric" min="1" max="365" aria-label="Días de plazo" value={customTerm} onChange={(e) => setCustomTerm(e.target.value)} className={`${inputClass} max-w-28`} />
            <span className="text-sm text-slate-500">días</span>
          </label>
        )}
      </div>
    </section>
  );
}

function creditFormValues(f: { noLimit: boolean; limit: string; useCustomTerm: boolean; customTerm: string; termDays: number | null }) {
  const limitValue = f.noLimit ? null : Number.parseFloat(f.limit);
  const limitValid = limitValue === null || (Number.isFinite(limitValue) && limitValue > 0);
  const term = f.useCustomTerm ? Number.parseInt(f.customTerm, 10) : f.termDays;
  const termValid = term === null || (Number.isInteger(term) && term > 0 && term <= 365);
  return { limitValue, limitValid, term, termValid };
}

const isPresetTerm = (days: number | null | undefined) => !days || [8, 15, 30].includes(days);

export function OpenCreditAccountModal({ customer: initialCustomer, onClose }: Readonly<Props>) {
  const [customer, setCustomer] = useState<Customer | null>(initialCustomer ?? null);
  const [noLimit, setNoLimit] = useState(initialCustomer ? initialCustomer.creditLimit == null : false);
  const [limit, setLimit] = useState(initialCustomer?.creditLimit ? String(initialCustomer.creditLimit) : "");
  const [termDays, setTermDays] = useState<number | null>(initialCustomer?.creditTermDays ?? null);
  const [customTerm, setCustomTerm] = useState(
    isPresetTerm(initialCustomer?.creditTermDays) ? "" : String(initialCustomer?.creditTermDays),
  );
  const [useCustomTerm, setUseCustomTerm] = useState(customTerm !== "");
  const [signerName, setSignerName] = useState(initialCustomer?.name ?? "");
  const [signerDocument, setSignerDocument] = useState(initialCustomer?.document ?? "");
  const [email, setEmail] = useState(initialCustomer?.email ?? "");
  const [signature, setSignature] = useState<string | null>(null);

  const utils = api.useUtils();
  const { data: settings } = api.customer.creditSettings.useQuery();

  const sign = api.customer.signCreditAgreement.useMutation({
    onSuccess: async (data) => {
      if (data.emailed || !email.trim()) toast.success(data.message);
      else toast.warning(data.message);
      await Promise.all([utils.customer.creditAccount.invalidate(), utils.customer.listDebtors.invalidate()]);
      onClose();
    },
  });

  function pickCustomer(c: Customer) {
    setCustomer(c);
    setSignerName(c.name);
    setSignerDocument(c.document ?? "");
    setEmail(c.email ?? "");
  }

  const { limitValue, limitValid, term, termValid } = creditFormValues({ noLimit, limit, useCustomTerm, customTerm, termDays });
  const signatureRequired = settings?.creditSignatureRequired ?? false;
  const canSubmit = !!customer && limitValid && termValid && signerName.trim().length >= 2 && (!signatureRequired || !!signature);

  const terms = customer && settings
    ? renderCreditTerms(settings.creditTerms, {
        businessName: settings.name,
        customerName: customer.name,
        creditLimit: limitValue,
        creditTermDays: termValid ? term : null,
      })
    : "";

  let submitLabel = signature ? "Firmar y abrir cuenta" : "Abrir cuenta sin firma";
  if (sign.isPending) submitLabel = "Guardando...";

  return (
    <Modal
      onClose={onClose}
      overlayClassName="fixed inset-0 z-50 flex items-stretch justify-center bg-black/50 sm:items-center sm:p-4"
      aria-label="Abrir cuenta de fiado"
      className="flex h-[100dvh] w-full flex-col bg-white shadow-2xl sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:max-w-2xl sm:rounded-2xl dark:bg-slate-900"
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5 dark:border-white/10">
        <h2 className="font-semibold text-slate-800 dark:text-white">
          {initialCustomer ? `Acuerdo de fiado · ${initialCustomer.name}` : "Abrir cuenta de fiado"}
        </h2>
        <button onClick={onClose} aria-label="Cerrar" className="flex h-11 w-11 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-5">
        {customer ? (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 dark:border-emerald-500/40 dark:bg-emerald-900/20">
            <UserCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-300" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-emerald-800 dark:text-emerald-200">{customer.name}</span>
            {!initialCustomer && (
              <button type="button" onClick={() => setCustomer(null)} className="text-xs font-semibold text-emerald-700 underline dark:text-emerald-300">Cambiar</button>
            )}
          </div>
        ) : (
          <CustomerStep onPick={pickCustomer} />
        )}

        {customer && (
          <>
            <LimitAndTermFields
              noLimit={noLimit} setNoLimit={setNoLimit}
              limit={limit} setLimit={setLimit} limitValue={limitValue}
              termDays={termDays} setTermDays={setTermDays}
              useCustomTerm={useCustomTerm} setUseCustomTerm={setUseCustomTerm}
              customTerm={customTerm} setCustomTerm={setCustomTerm}
            />

            <section className="space-y-1.5">
              <span className={labelClass}>Condiciones que acepta el cliente</span>
              <div className="max-h-48 space-y-1.5 overflow-y-auto whitespace-pre-line rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm leading-relaxed text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200">
                {terms}
              </div>
            </section>

            <section className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1"><span className={labelClass}>Nombre de quien firma</span>
                <input value={signerName} onChange={(e) => setSignerName(e.target.value)} maxLength={120} className={inputClass} />
              </label>
              <label className="space-y-1"><span className={labelClass}>Cédula de quien firma</span>
                <input value={signerDocument} onChange={(e) => setSignerDocument(e.target.value)} maxLength={20} inputMode="numeric" className={inputClass} />
              </label>
            </section>

            <section className="space-y-1.5">
              <span className={labelClass}>
                Firma del cliente {signatureRequired ? "(obligatoria)" : "(opcional)"}
              </span>
              <SignaturePad onChange={setSignature} />
            </section>

            <label className="block space-y-1">
              <span className={labelClass}>Enviar copia en PDF al correo</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} placeholder="correo@ejemplo.com (opcional)" className={inputClass} />
            </label>
          </>
        )}
      </div>

      {customer && (
        <div className="shrink-0 space-y-2 border-t border-slate-100 px-4 py-3 sm:px-5 dark:border-white/10">
          {sign.error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{sign.error.message}</p>}
          {signatureRequired && !signature && <p className="text-xs text-slate-500">El negocio exige la firma: pídele al cliente que firme en el recuadro.</p>}
          <button
            type="button"
            disabled={!canSubmit || sign.isPending}
            aria-busy={sign.isPending}
            onClick={() =>
              sign.mutate({
                customerId: customer.id,
                creditLimit: limitValue,
                creditTermDays: term,
                signerName: signerName.trim(),
                signerDocument: signerDocument.trim() || undefined,
                signature: signature ?? undefined,
                email: email.trim() || undefined,
              })
            }
            className="min-h-12 w-full rounded-xl bg-violet-600 text-base font-bold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitLabel}
          </button>
        </div>
      )}
    </Modal>
  );
}
