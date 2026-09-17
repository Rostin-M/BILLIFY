"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import { api } from "~/trpc/react";
import type { BusinessInfoForPdf, TaxLine } from "~/lib/pdf/FacturaPDF";

const FacturaPdfActions = dynamic(
  () => import("~/lib/pdf/FacturaPdfActions").then((m) => m.FacturaPdfActions),
  { ssr: false, loading: () => <span className="text-xs text-slate-400">Generando…</span> },
);

const PAYMENT_LABELS: Record<string, string> = {
  CASH: "Efectivo",
  CARD: "Tarjeta",
  TRANSFER: "Transferencia",
  CREDIT: "Crédito",
};

type Props = { isOwner: boolean; business: BusinessInfoForPdf };

export function SalesHistory({ isOwner, business }: Readonly<Props>) {
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pdfSaleId, setPdfSaleId] = useState<string | null>(null);

  const { data: sales = [], isPending, refetch } = api.sale.list.useQuery({});
  const utils = api.useUtils();

  const voidSale = api.sale.void.useMutation({
    onSuccess: async (data) => {
      setVoidingId(null);
      setVoidReason("");
      toast.success(data.message);
      await utils.sale.list.invalidate();
      await utils.product.search.invalidate();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const formatCOP = (v: number) =>
    v.toLocaleString("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0 });

  const formatTime = (d: Date) =>
    new Date(d).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });

  const completed = sales.filter((s) => s.status === "COMPLETED");
  const voided = sales.filter((s) => s.status === "VOIDED");
  const totalDay = completed.reduce((sum, s) => sum + s.total, 0);

  if (isPending) {
    return <p className="text-center text-sm text-slate-400 dark:text-slate-500">Cargando historial...</p>;
  }

  return (
    <div className="space-y-4">
      {/* Resumen del día */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/5">
          <p className="text-xs text-slate-500 dark:text-slate-400">Ventas hoy</p>
          <p className="mt-1 text-2xl font-bold text-slate-800 dark:text-white">{completed.length}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/5">
          <p className="text-xs text-slate-500 dark:text-slate-400">Total del día</p>
          <p className="mt-1 text-xl font-bold text-violet-600 dark:text-violet-400">{formatCOP(totalDay)}</p>
        </div>
        {voided.length > 0 && (
          <div className="rounded-xl border border-red-100 bg-red-50 p-4 dark:border-red-500/20 dark:bg-red-900/10">
            <p className="text-xs text-red-500 dark:text-red-400">Anuladas</p>
            <p className="mt-1 text-2xl font-bold text-red-600 dark:text-red-400">{voided.length}</p>
          </div>
        )}
      </div>

      {/* Lista de ventas */}
      {sales.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center dark:border-white/10 dark:bg-white/5">
          <p className="text-slate-400 dark:text-slate-500">No hay ventas registradas hoy.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/5">
          <ul className="divide-y divide-slate-100 dark:divide-white/5">
            {sales.map((sale) => {
              const isVoided = sale.status === "VOIDED";
              const isExpanded = expandedId === sale.id;
              const isVoiding = voidingId === sale.id;

              return (
                <li key={sale.id} className="p-4">
                  {/* Fila principal */}
                  <div className="flex items-start justify-between gap-3">
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : sale.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`text-sm font-semibold ${isVoided ? "text-slate-400 line-through dark:text-slate-500" : "text-slate-800 dark:text-slate-100"}`}>
                          {sale.invoiceNumber ?? "Venta rápida"}
                        </span>
                        {isVoided && (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-600 dark:bg-red-900/30 dark:text-red-400">
                            ANULADA
                          </span>
                        )}
                        {sale.saleType === "INVOICED" && !isVoided && (
                          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-600 dark:bg-violet-900/30 dark:text-violet-300">
                            Factura
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                        {formatTime(sale.createdAt)} · {PAYMENT_LABELS[sale.paymentMethod] ?? sale.paymentMethod}
                        {sale.customer && ` · ${sale.customer.name}`}
                        {sale.user?.name && ` · ${sale.user.name}`}
                      </p>
                      {isVoided && sale.voidReason && (
                        <p className="mt-0.5 text-xs text-red-400 dark:text-red-500">
                          Motivo: {sale.voidReason}
                        </p>
                      )}
                    </button>

                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <span className={`text-base font-bold ${isVoided ? "text-slate-400 line-through dark:text-slate-500" : "text-slate-800 dark:text-white"}`}>
                        {formatCOP(sale.total)}
                      </span>
                      {!isVoiding && (
                        <div className="flex items-center gap-1.5">
                          {sale.saleType === "INVOICED" && (
                            <button
                              onClick={() => {
                                setPdfSaleId(pdfSaleId === sale.id ? null : sale.id);
                                setExpandedId(null);
                                setVoidingId(null);
                              }}
                              className={`rounded-lg border px-2 py-1 text-xs font-medium transition ${
                                pdfSaleId === sale.id
                                  ? "border-violet-400 bg-violet-100 text-violet-700 dark:border-violet-500 dark:bg-violet-900/30 dark:text-violet-300"
                                  : "border-violet-200 text-violet-600 hover:bg-violet-50 dark:border-violet-500/30 dark:text-violet-400 dark:hover:bg-violet-900/20"
                              }`}
                            >
                              PDF
                            </button>
                          )}
                          {isOwner && !isVoided && (
                            <button
                              onClick={() => { setVoidingId(sale.id); setVoidReason(""); setExpandedId(null); setPdfSaleId(null); }}
                              className="rounded-lg border border-red-200 px-2 py-1 text-xs font-medium text-red-500 transition hover:bg-red-50 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-900/20"
                            >
                              Anular
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Acciones PDF — bloque expandible bajo la fila principal */}
                  {pdfSaleId === sale.id && !isVoiding && (
                    <div className="mt-3 rounded-xl border border-violet-100 bg-violet-50/50 p-3 dark:border-violet-500/20 dark:bg-violet-900/10">
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
                        onClose={() => setPdfSaleId(null)}
                      />
                    </div>
                  )}

                  {/* Confirmación de anulación */}
                  {isVoiding && (
                    <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 dark:border-red-500/30 dark:bg-red-900/10">
                      <p className="mb-2 text-sm font-semibold text-red-700 dark:text-red-300">
                        ¿Anular esta venta? Se restaurará el stock de todos los productos.
                      </p>
                      <input
                        autoFocus
                        type="text"
                        placeholder="Motivo de anulación *"
                        value={voidReason}
                        onChange={(e) => setVoidReason(e.target.value)}
                        className="w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 dark:border-red-500/30 dark:bg-slate-900 dark:text-white"
                      />
                      {voidSale.error && (
                        <p className="mt-1 text-xs text-red-600">{voidSale.error.message}</p>
                      )}
                      <div className="mt-2 flex gap-2">
                        <button
                          onClick={() => voidSale.mutate({ saleId: sale.id, reason: voidReason })}
                          disabled={voidReason.trim().length < 3 || voidSale.isPending}
                          className="flex-1 rounded-lg bg-red-600 py-1.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
                        >
                          {voidSale.isPending ? "Anulando..." : "Confirmar anulación"}
                        </button>
                        <button
                          onClick={() => { setVoidingId(null); setVoidReason(""); }}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Detalle expandible de ítems */}
                  {isExpanded && !isVoiding && (
                    <div className="mt-2 rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-white/5 dark:bg-white/5">
                      <ul className="space-y-1">
                        {sale.items.map((item, idx) => (
                          <li key={idx} className="flex justify-between text-xs text-slate-600 dark:text-slate-300">
                            <span>{item.name} × {item.quantity}</span>
                            <span>{formatCOP(item.subtotal)}</span>
                          </li>
                        ))}
                      </ul>
                      {sale.taxAmount > 0 && (
                        <div className="mt-2 border-t border-slate-200 pt-2 dark:border-white/10">
                          <div className="flex justify-between text-xs text-slate-400">
                            <span>Subtotal</span>
                            <span>{formatCOP(sale.subtotal)}</span>
                          </div>
                          <div className="flex justify-between text-xs text-slate-400">
                            <span>Impuesto</span>
                            <span>{formatCOP(sale.taxAmount)}</span>
                          </div>
                        </div>
                      )}
                      {sale.note && (
                        <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                          Nota: {sale.note}
                        </p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <button
        onClick={() => refetch()}
        className="w-full rounded-xl border border-slate-200 py-2 text-sm text-slate-400 transition hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5"
      >
        Actualizar
      </button>
    </div>
  );
}
