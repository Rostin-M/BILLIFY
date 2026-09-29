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
};

export function FacturaPdfActions({ saleId, business, sale, fileName, onClose, logoUrl, defaultEmail }: Readonly<Props>) {
  const businessWithLogo = { ...business, logoUrl: logoUrl ?? business.logoUrl };
  const [instance] = usePDF({ document: <FacturaPDF business={businessWithLogo} sale={sale} /> });

  const [showEmailForm, setShowEmailForm] = useState(false);
  const [emailInput, setEmailInput] = useState(defaultEmail ?? "");
  const [emailSent, setEmailSent] = useState(false);

  const sendEmail = api.sale.sendInvoiceEmail.useMutation({
    onSuccess: () => {
      setEmailSent(true);
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
    return <span className="text-xs text-slate-500 dark:text-slate-500">Generando PDF…</span>;
  }

  if (instance.error) {
    return <span className="text-xs text-red-500">Error al generar PDF</span>;
  }

  return (
    <div className="space-y-2">
      <div className="inline-flex items-center gap-1 flex-wrap">
        <button
          onClick={handleDownload}
          className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-2 py-1 text-xs font-medium text-violet-700 transition hover:bg-violet-100 dark:border-violet-500/30 dark:bg-violet-900/20 dark:text-violet-300 dark:hover:bg-violet-900/30"
        >
          <Download className="h-3.5 w-3.5" /> PDF
        </button>
        <button
          onClick={handlePrint}
          className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
        >
          Imprimir
        </button>
        {sale.invoiceNumber && (
          <button
            onClick={() => setShowEmailForm((v) => !v)}
            className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-900/20 dark:text-emerald-300 dark:hover:bg-emerald-900/30"
          >
            <Mail className="h-3.5 w-3.5" /> Correo
          </button>
        )}
        <button
          onClick={onClose}
          aria-label="Cerrar"
          className="rounded-lg p-1 text-slate-500 transition hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {emailSent && (
        <p className="text-xs text-emerald-600 dark:text-emerald-400">
          Factura enviada correctamente.
        </p>
      )}

      {showEmailForm && (
        <form
          className="flex items-center gap-1.5"
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
            className="flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs outline-none ring-emerald-400 transition focus:ring-2 dark:border-white/15 dark:bg-slate-900 dark:text-white"
          />
          <button
            type="submit"
            disabled={sendEmail.isPending}
            className="rounded-lg bg-emerald-600 px-2 py-1 text-xs font-medium text-white transition hover:bg-emerald-500 disabled:opacity-60"
          >
            {sendEmail.isPending ? "Enviando…" : "Enviar"}
          </button>
        </form>
      )}

      {sendEmail.error && (
        <p className="text-xs text-red-500 dark:text-red-400">{sendEmail.error.message}</p>
      )}
    </div>
  );
}
