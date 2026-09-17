"use client";

import { useState } from "react";
import { pdf } from "@react-pdf/renderer";
import { X } from "lucide-react";
import { MesaPDF } from "./MesaPDF";
import type { MesaForPdf } from "./MesaPDF";

type Props = {
  business: { name: string; document: string; logoUrl?: string | null };
  mesa: MesaForPdf;
  fileName: string;
  onClose?: () => void;
};

export function MesaPdfActions({ business, mesa, fileName, onClose }: Readonly<Props>) {
  const [loading, setLoading] = useState(false);

  async function generate(action: "download" | "print") {
    setLoading(true);
    try {
      const blob = await pdf(<MesaPDF business={business} mesa={mesa} />).toBlob();
      const url = URL.createObjectURL(blob);
      if (action === "download") {
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        a.click();
      } else {
        const win = window.open(url, "_blank");
        win?.addEventListener("load", () => win.print());
      }
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex gap-2">
      <button
        onClick={() => generate("download")}
        disabled={loading}
        className="flex-1 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-700 transition hover:bg-violet-100 disabled:opacity-50 dark:border-violet-500/30 dark:bg-violet-900/20 dark:text-violet-300"
      >
        {loading ? "Generando..." : "Descargar PDF"}
      </button>
      <button
        onClick={() => generate("print")}
        disabled={loading}
        className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-transparent dark:text-slate-300"
      >
        Imprimir
      </button>
      {onClose && (
        <button
          onClick={onClose}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-500 hover:bg-slate-50 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/5"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
