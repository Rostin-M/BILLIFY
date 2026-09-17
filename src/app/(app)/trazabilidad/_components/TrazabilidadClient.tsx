"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { api } from "~/trpc/react";

type Period = "today" | "week" | "month";

const PERIOD_LABELS: Record<Period, string> = { today: "Hoy", week: "Semana", month: "Mes" };

const ACTION_META: Record<string, { label: string; color: string }> = {
  CREATE_SALE: { label: "Venta", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  VOID_SALE: { label: "Anulación", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  OPEN_CASH_REGISTER: { label: "Apertura caja", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  CLOSE_CASH_REGISTER: { label: "Cierre caja", color: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
};

const MOVEMENT_TYPE_LABELS: Record<string, string> = { OPENING: "Fondo inicial", INCOME: "Entrada", EXPENSE: "Salida" };
const PAYMENT_LABELS: Record<string, string> = { CASH: "Efectivo", CARD: "Tarjeta", TRANSFER: "Transferencia", CREDIT: "Crédito" };

type Tab = "registro" | "exportar";

export function TrazabilidadClient() {
  const [tab, setTab] = useState<Tab>("registro");
  const [actionFilter, setActionFilter] = useState("");
  const [exportPeriod, setExportPeriod] = useState<Period>("today");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: logs, isPending } = api.auditLog.list.useQuery({ limit: 100, action: actionFilter || undefined });

  const { isFetching: isExportingSales, refetch: refetchSalesExport } =
    api.sale.exportForPeriod.useQuery(
      { period: exportPeriod },
      { enabled: false, refetchOnWindowFocus: false },
    );

  const { isFetching: isExportingCash, refetch: refetchCashExport } =
    api.auditLog.exportCashPeriod.useQuery(
      { period: exportPeriod },
      { enabled: false, refetchOnWindowFocus: false },
    );

  function formatBogota(utcDate: Date | string): string {
    return new Date(utcDate).toLocaleString("es-CO", {
      timeZone: "America/Bogota",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function escapeCSV(v: string | null | undefined): string {
    if (v === null || v === undefined || v === "") return "";
    return `"${String(v).replace(/"/g, '""')}"`;
  }

  function downloadBlob(content: string, filename: string) {
    const blob = new Blob(["﻿" + content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleExportSales() {
    const result = await refetchSalesExport();
    if (!result.data) return;
    const sales = result.data;

    const PERIOD_LABEL = PERIOD_LABELS[exportPeriod];
    const header = [
      "Fecha/Hora", "N° Factura", "Tipo", "Estado", "Método Pago",
      "Cliente", "Doc. Cliente", "Cajero",
      "Nombre Producto", "Unidad", "Cantidad", "Precio Unitario", "Subtotal Ítem",
      "Subtotal Venta", "IVA Venta", "Total Venta", "Nota", "Motivo Anulación",
    ].join(";");

    const rows: string[] = [];
    for (const s of sales) {
      const salePrefix = [
        escapeCSV(formatBogota(s.createdAt)),
        escapeCSV(s.invoiceNumber),
        escapeCSV(s.saleType === "INVOICED" ? "Factura" : "Rápida"),
        escapeCSV(s.status === "COMPLETED" ? "Completada" : s.status === "VOIDED" ? "Anulada" : s.status),
        escapeCSV(PAYMENT_LABELS[s.paymentMethod] ?? s.paymentMethod),
        escapeCSV(s.customer?.name),
        escapeCSV(s.customer?.document),
        escapeCSV(s.user?.name),
      ];
      const saleSuffix = [
        s.subtotal.toFixed(2),
        s.taxAmount.toFixed(2),
        s.total.toFixed(2),
        escapeCSV(s.note),
        escapeCSV(s.voidReason),
      ];
      if (s.items.length === 0) {
        rows.push([...salePrefix, "", "", "", "", "", ...saleSuffix].join(";"));
      } else {
        for (const item of s.items) {
          rows.push([
            ...salePrefix,
            escapeCSV(item.name),
            escapeCSV(item.unit ?? "und"),
            item.quantity,
            item.price.toFixed(2),
            item.subtotal.toFixed(2),
            ...saleSuffix,
          ].join(";"));
        }
      }
    }

    downloadBlob([header, ...rows].join("\n"), `ventas_${PERIOD_LABEL}_${new Date().toISOString().slice(0, 10)}.csv`);
  }

  async function handleExportCash() {
    const result = await refetchCashExport();
    if (!result.data) return;
    const movements = result.data;

    const PERIOD_LABEL = PERIOD_LABELS[exportPeriod];
    const header = ["Fecha/Hora", "Tipo", "Descripción", "Monto", "Usuario"].join(";");

    const rows = movements.map((m) => [
      escapeCSV(formatBogota(m.createdAt)),
      escapeCSV(MOVEMENT_TYPE_LABELS[m.type] ?? m.type),
      escapeCSV(m.description),
      m.amount.toFixed(2),
      escapeCSV(m.user?.name),
    ].join(";"));

    downloadBlob([header, ...rows].join("\n"), `movimientos_caja_${PERIOD_LABEL}_${new Date().toISOString().slice(0, 10)}.csv`);
  }

  function getDetailSummary(action: string, detail: unknown): string {
    if (!detail || typeof detail !== "object") return "";
    const d = detail as Record<string, unknown>;
    const cop = (v: unknown) =>
      Number(v).toLocaleString("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0 });
    const str = (v: unknown): string => {
      if (v === null || v === undefined) return "";
      if (typeof v === "object") return JSON.stringify(v);
      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      return String(v);
    };

    switch (action) {
      case "CREATE_SALE":
        return `Total: ${cop(d.total)} · ${str(d.itemCount)} ítem(s) · ${PAYMENT_LABELS[str(d.paymentMethod)] ?? str(d.paymentMethod)}${d.invoiceNumber ? ` · ${str(d.invoiceNumber)}` : ""}`;
      case "VOID_SALE":
        return `Motivo: ${str(d.reason)}${d.invoiceNumber ? ` · ${str(d.invoiceNumber)}` : ""}`;
      case "OPEN_CASH_REGISTER":
        return `Fondo inicial: ${cop(d.openingBalance)}`;
      case "CLOSE_CASH_REGISTER":
        return `Saldo final: ${cop(d.closingBalance)} · Ventas efectivo: ${cop(d.cashSalesTotal)}`;
      default:
        return JSON.stringify(d);
    }
  }

  const ACTIONS = [
    { value: "", label: "Todas las acciones" },
    { value: "CREATE_SALE", label: "Ventas" },
    { value: "VOID_SALE", label: "Anulaciones" },
    { value: "OPEN_CASH_REGISTER", label: "Apertura de caja" },
    { value: "CLOSE_CASH_REGISTER", label: "Cierre de caja" },
  ];

  return (
    <div className="space-y-5">
      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm dark:border-white/10 dark:bg-white/5">
        {(["registro", "exportar"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold capitalize transition ${
              tab === t
                ? "bg-violet-600 text-white shadow"
                : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            {t === "registro" ? "Registro de acciones" : "Exportar datos"}
          </button>
        ))}
      </div>

      {/* Tab: Registro */}
      {tab === "registro" && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-white/5">
          {/* Filtro */}
          <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-3 dark:border-white/10">
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 dark:border-white/10 dark:bg-slate-900 dark:text-white"
            >
              {ACTIONS.map((a) => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
            </select>
            <span className="text-xs text-slate-400 dark:text-slate-500">
              Últimas {logs?.length ?? 0} acciones
            </span>
          </div>

          {isPending && (
            <p className="px-5 py-8 text-center text-slate-400 dark:text-slate-500">Cargando...</p>
          )}

          {!isPending && logs?.length === 0 && (
            <p className="px-5 py-8 text-center text-slate-400 dark:text-slate-500">Sin registros</p>
          )}

          {logs && logs.length > 0 && (
            <ul className="divide-y divide-slate-100 dark:divide-white/5">
              {logs.map((log) => {
                const meta = ACTION_META[log.action];
                const isExpanded = expandedId === log.id;
                return (
                  <li key={log.id} className="px-5 py-3">
                    <button
                      className="flex w-full items-start gap-3 text-left"
                      onClick={() => setExpandedId(isExpanded ? null : log.id)}
                    >
                      <span
                        className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${meta?.color ?? "bg-slate-100 text-slate-500"}`}
                      >
                        {meta?.label ?? log.action}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-slate-600 dark:text-slate-300">
                          {getDetailSummary(log.action, log.detail)}
                        </p>
                        <p className="text-xs text-slate-400 dark:text-slate-500">
                          {formatBogota(log.createdAt)}
                          {log.user?.name ? ` · ${log.user.name}` : ""}
                        </p>
                      </div>
                      <span className="mt-1 shrink-0 text-slate-300 dark:text-slate-600">
                        {isExpanded ? (
                          <ChevronUp className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" />
                        )}
                      </span>
                    </button>
                    {isExpanded && (
                      <div className="mt-2 rounded-lg bg-slate-50 p-3 dark:bg-white/5">
                        <p className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                          ID: <span className="font-mono">{log.entityId}</span>
                        </p>
                        <pre className="overflow-x-auto whitespace-pre-wrap break-all text-xs text-slate-600 dark:text-slate-300">
                          {JSON.stringify(log.detail, null, 2)}
                        </pre>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* Tab: Exportar */}
      {tab === "exportar" && (
        <div className="space-y-4">
          {/* Selector de período */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5">
            <h2 className="mb-3 font-semibold text-slate-700 dark:text-slate-200">Período</h2>
            <div className="flex gap-2">
              {(["today", "week", "month"] as Period[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setExportPeriod(p)}
                  className={`rounded-xl border px-4 py-2 text-sm font-semibold transition ${
                    exportPeriod === p
                      ? "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-500/40 dark:bg-violet-900/20 dark:text-violet-300"
                      : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 dark:border-white/10 dark:bg-transparent dark:text-slate-400"
                  }`}
                >
                  {PERIOD_LABELS[p]}
                </button>
              ))}
            </div>
          </div>

          {/* Botones de exportación */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5">
              <h3 className="mb-1 font-semibold text-slate-700 dark:text-slate-200">Ventas</h3>
              <p className="mb-4 text-sm text-slate-400 dark:text-slate-500">
                Exporta todas las ventas del período con detalle de productos, cliente, método de pago e IVA.
              </p>
              <button
                onClick={() => void handleExportSales()}
                disabled={isExportingSales}
                className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-500 disabled:opacity-50"
              >
                {isExportingSales ? "Generando..." : "Descargar CSV de ventas"}
              </button>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5">
              <h3 className="mb-1 font-semibold text-slate-700 dark:text-slate-200">Movimientos de caja</h3>
              <p className="mb-4 text-sm text-slate-400 dark:text-slate-500">
                Exporta todas las entradas y salidas manuales de caja del período con fecha, descripción y responsable.
              </p>
              <button
                onClick={() => void handleExportCash()}
                disabled={isExportingCash}
                className="w-full rounded-xl bg-violet-600 py-2.5 text-sm font-bold text-white transition hover:bg-violet-500 disabled:opacity-50"
              >
                {isExportingCash ? "Generando..." : "Descargar CSV de caja"}
              </button>
            </div>
          </div>

          <p className="text-xs text-slate-400 dark:text-slate-500">
            Los archivos CSV se generan con codificación UTF-8 (compatible con Excel en español). Las fechas y horas están en zona horaria de Colombia (Bogotá).
          </p>
        </div>
      )}
    </div>
  );
}
