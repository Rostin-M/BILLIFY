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
    return <span className="text-xs text-slate-500 dark:text-slate-400">Generando PDF…</span>;
  }

  if (instance.error) {
    return <span className="text-xs text-red-500">Error al generar PDF</span>;
  }

  return (
    <div className="inline-flex flex-wrap items-center gap-2">
      <button
        onClick={handleDownload}
        className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 min-h-10 px-3 text-sm font-medium sm:min-h-8 sm:text-xs text-violet-700 transition hover:bg-violet-100 dark:border-violet-500/30 dark:bg-violet-900/20 dark:text-violet-300 dark:hover:bg-violet-900/30"
      >
        <Download className="h-3.5 w-3.5" /> PDF
      </button>
      <button
        onClick={handlePrint}
        className="rounded-lg border border-slate-200 min-h-10 px-3 text-sm font-medium sm:min-h-8 sm:text-xs text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
      >
        Imprimir
      </button>
      {onClose ? (
        <button
          onClick={onClose}
          aria-label="Cerrar"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 sm:h-8 sm:w-8 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-200"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}
