"use client";

import { usePDF } from "@react-pdf/renderer";
import { Download, X } from "lucide-react";
import { CierreCajaPDF, type RegisterForPdf } from "./CierreCajaPDF";

type Props = {
  business: { name: string; document: string; logoUrl?: string | null };
  register: RegisterForPdf;
  fileName: string;
  onClose?: () => void;
};

export function CajaPdfActions({ business, register, fileName, onClose }: Readonly<Props>) {
  const [instance] = usePDF({
    document: <CierreCajaPDF business={business} register={register} />,
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
    <div className="inline-flex items-center gap-1">
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
      {onClose ? (
        <button
          onClick={onClose}
          aria-label="Cerrar"
          className="rounded-lg p-1 text-slate-500 transition hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}
