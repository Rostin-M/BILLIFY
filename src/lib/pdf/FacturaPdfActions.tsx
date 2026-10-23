"use client";

import { usePDF } from "@react-pdf/renderer";
import { Download, Mail, X } from "lucide-react";
import { useState } from "react";

import { api } from "~/trpc/react";
import { FacturaPDF, type BusinessInfoForPdf, type SaleForPdf } from "./FacturaPDF";

type Props = {
  saleId: string;
  business: BusinessInfoForPdf;
  sale: SaleForPdf;
  fileName: string;
  onClose: () => void;
  logoUrl?: string | null;
  defaultEmail?: string | null;
  /** En el modal posterior a la venta el cierre lo da el botón "Listo": sin X duplicada. */
  hideClose?: boolean;
};

export function FacturaPdfActions({ saleId, business, sale, fileName, onClose, logoUrl, defaultEmail, hideClose = false }: Readonly<Props>) {
  const businessWithLogo = { ...business, logoUrl: logoUrl ?? business.logoUrl };
  const [instance] = usePDF({ document: <FacturaPDF business={businessWithLogo} sale={sale} /> });

  const [showEmailForm, setShowEmailForm] = useState(false);
  const [emailInput, setEmailInput] = useState(defaultEmail ?? "");
  const [emailSent, setEmailSent] = useState<string | null>(null);

  const sendEmail = api.sale.sendInvoiceEmail.useMutation({
    onSuccess: (_data, variables) => {
      setEmailSent(variables.customerEmail);
      setShowEmailForm(false);
    },
  });

  const handleDownload = () => {
    if (!instance.url) return;
    const a = window.document.createElement("a");
    a.href = instance.url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handlePrint = () => {
    if (instance.url) window.open(instance.url, "_blank");
  };

  if (instance.loading) {
    return (
      <output className="inline-flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
        <span aria-hidden className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" />
        <span>Preparando el PDF…</span>
      </output>
    );
  }

  if (instance.error) {
    return <span role="alert" className="text-sm text-red-500">No se pudo generar el PDF. Cierra y vuelve a intentarlo.</span>;
  }

  return (
    <div className="space-y-2">
      {/* Si el cliente tiene correo, enviarlo es la acción principal: un toque. */}
      {sale.invoiceNumber && defaultEmail && !emailSent && !showEmailForm && (
        <button
          onClick={() => sendEmail.mutate({ saleId, customerEmail: defaultEmail })}
          disabled={sendEmail.isPending}
          aria-busy={sendEmail.isPending}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed"
        >
          <Mail className="h-4 w-4" aria-hidden />
          {sendEmail.isPending ? "Enviando…" : `Enviar a ${defaultEmail}`}
        </button>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={handleDownload}
          className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-3 text-sm font-medium text-violet-700 transition hover:bg-violet-100 sm:min-h-8 sm:text-xs dark:border-violet-500/30 dark:bg-violet-900/20 dark:text-violet-300 dark:hover:bg-violet-900/30"
        >
          <Download className="h-3.5 w-3.5" aria-hidden /> Descargar PDF
        </button>
        <button
          onClick={handlePrint}
          className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50 sm:min-h-8 sm:text-xs dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
        >
          Imprimir
        </button>
        {sale.invoiceNumber && (
          <button
            onClick={() => setShowEmailForm((v) => !v)}
            aria-expanded={showEmailForm}
            className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100 sm:min-h-8 sm:text-xs dark:border-emerald-500/30 dark:bg-emerald-900/20 dark:text-emerald-300 dark:hover:bg-emerald-900/30"
          >
            <Mail className="h-3.5 w-3.5" aria-hidden /> {defaultEmail ? "Otro correo" : "Enviar por correo"}
          </button>
        )}
        {!hideClose && (
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 sm:h-8 sm:w-8 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {emailSent && (
        <output className="block text-sm text-emerald-600 dark:text-emerald-400">
          Factura enviada a {emailSent}.
        </output>
      )}

      {showEmailForm && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            sendEmail.mutate({ saleId, customerEmail: emailInput });
          }}
        >
          <input
            required
            type="email"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            placeholder="cliente@correo.com"
            aria-label="Correo del cliente"
            className="min-h-10 min-w-0 flex-1 basis-48 rounded-lg border border-slate-300 bg-white px-3 text-base outline-none sm:text-sm ring-emerald-400 transition focus:ring-2 dark:border-white/15 dark:bg-slate-900 dark:text-white"
          />
          <button
            type="submit"
            disabled={sendEmail.isPending}
            aria-busy={sendEmail.isPending}
            className="rounded-lg bg-emerald-600 min-h-10 px-3 text-sm font-medium sm:min-h-8 sm:text-xs text-white transition hover:bg-emerald-500 disabled:opacity-60"
          >
            {sendEmail.isPending ? "Enviando…" : "Enviar"}
          </button>
        </form>
      )}

      {sendEmail.error && (
        <p role="alert" className="text-xs text-red-500 dark:text-red-400">{sendEmail.error.message}</p>
      )}
    </div>
  );
}
