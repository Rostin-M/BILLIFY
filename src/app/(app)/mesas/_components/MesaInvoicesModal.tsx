"use client";

import dynamic from "next/dynamic";
import { CheckCircle2 } from "lucide-react";

import { api } from "~/trpc/react";
import type { BusinessInfoForPdf, TaxLine } from "~/lib/pdf/FacturaPDF";
import { useDialog } from "~/app/_components/ui/useDialog";
import { formatCOP } from "~/lib/format/money";

const FacturaPdfActions = dynamic(
  () => import("~/lib/pdf/FacturaPdfActions").then((m) => m.FacturaPdfActions),
  { ssr: false, loading: () => <span className="text-xs text-slate-500">Generando PDF…</span> },
);

type Props = {
  /** Ventas del cobro que salieron con número de factura. */
  saleIds: string[];
  business: BusinessInfoForPdf;
  onClose: () => void;
};

export function MesaInvoicesModal({ saleIds, business, onClose }: Readonly<Props>) {
  const dialogRef = useDialog(onClose);
  // Las ventas son de hoy: salen del mismo listado que usa el historial de ventas.
  const { data: sales, isPending, isError, refetch } = api.sale.list.useQuery({});
  const invoiced = (sales ?? []).filter((s) => saleIds.includes(s.id) && s.invoiceNumber);
  const many = saleIds.length > 1;

  let body: React.ReactNode;
  if (isPending) {
    body = <p role="status" className="text-sm text-slate-500 dark:text-slate-400">Preparando la factura…</p>;
  } else if (isError || invoiced.length === 0) {
    body = (
      <div className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
        <p>No se pudo cargar la factura. El cobro sí quedó registrado.</p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="min-h-10 font-medium text-violet-700 underline underline-offset-4 dark:text-violet-300"
        >
          Intentar de nuevo
        </button>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          También la encuentras en Ventas → Historial.
        </p>
      </div>
    );
  } else {
    body = (
      <ul className="space-y-4">
        {invoiced.map((sale) => (
          <li key={sale.id} className={many ? "rounded-xl border border-slate-200 p-3 dark:border-white/10" : ""}>
            <p className="text-sm font-semibold text-violet-600 dark:text-violet-400">{sale.invoiceNumber}</p>
            <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
              {sale.customer?.name ? `${sale.customer.name} · ` : ""}Total: {formatCOP(sale.total)}
            </p>
            <FacturaPdfActions
              saleId={sale.id}
              business={business}
              sale={{
                invoiceNumber: sale.invoiceNumber!,
                createdAt: sale.createdAt,
                customer: sale.customer ?? null,
                user: sale.user ?? null,
                items: sale.items.map((item) => ({
                  ...item,
                  taxLines: (item.taxLines as TaxLine[] | null) ?? null,
                })),
                subtotal: sale.subtotal,
                taxAmount: sale.taxAmount,
                taxLines: (sale.taxLines as TaxLine[] | null) ?? null,
                total: sale.total,
                paymentMethod: sale.paymentMethod,
                note: sale.note ?? null,
              }}
              fileName={`${sale.invoiceNumber}.pdf`}
              onClose={onClose}
              defaultEmail={sale.customer?.email ?? null}
              hideClose
            />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mesa-invoice-title"
        className="my-auto w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900"
      >
        <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
          <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
        </div>
        <h2 id="mesa-invoice-title" className="mt-3 text-lg font-bold text-slate-800 dark:text-white">
          {many ? "Facturas emitidas" : "Factura emitida"}
        </h2>
        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">¿Qué quieres hacer con la factura?</p>

        {body}

        <button
          type="button"
          onClick={onClose}
          className="mt-4 min-h-11 w-full rounded-xl border border-slate-200 text-center text-sm text-slate-500 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/5"
        >
          Listo
        </button>
      </div>
    </div>
  );
}
