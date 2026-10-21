"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, CircleDot } from "lucide-react";
import { toast } from "sonner";
import { api } from "~/trpc/react";
import { formatCOP } from "~/lib/format/money";
import { CashCloseForm } from "./CashCloseForm";

const CashHistoryPdfButton = dynamic(
  () => import("~/lib/pdf/CashHistoryPdfButton").then((m) => m.CashHistoryPdfButton),
  { ssr: false, loading: () => <span className="text-xs text-slate-500">Generando…</span> },
);

type Movement = {
  id: string;
  type: string;
  amount: number;
  description: string;
  createdAt: Date;
  user: { name: string | null } | null;
};

type NonCashEntry = { paymentMethod: string; total: number; count: number };

type Register = {
  id: string;
  openingBalance: number;
  openedAt: Date;
  /** null en cierre ciego (el cajero no ve el efectivo esperado hasta contar). */
  cashSalesTotal: number | null;
  cashSalesCount: number;
  nonCashSales: NonCashEntry[];
  /** Abonos de fiado en efectivo de esta caja; null en cierre ciego. */
  cashPaymentsTotal: number | null;
  cashPaymentsCount: number;
  nonCashPayments: NonCashEntry[];
  manualIncome: number;
  manualExpense: number;
  manualBalance: number;
  currentBalance: number | null;
  user: { name: string | null } | null;
  movements: Movement[];
  closeSettings: { blind: boolean; byDenomination: boolean };
};

type Props = { register: Register; canClose: boolean; business: { name: string; document: string; logoUrl?: string | null } };

const TYPE_LABELS: Record<string, string> = {
  OPENING: "Fondo inicial",
  INCOME: "Entrada",
  EXPENSE: "Salida",
};

const PAYMENT_LABELS: Record<string, string> = {
  CARD: "Tarjeta",
  CREDIT: "Fiado",
  TRANSFER: "Transferencia",
};

const TYPE_ACTIVE_CLASSES: Record<"INCOME" | "EXPENSE", string> = {
  INCOME: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-900/20 dark:text-emerald-300",
  EXPENSE: "border-red-300 bg-red-50 text-red-700 dark:border-red-500/40 dark:bg-red-900/20 dark:text-red-300",
};

export function CashDashboard({ register, canClose, business }: Readonly<Props>) {
  const [form, setForm] = useState({ type: "INCOME" as "INCOME" | "EXPENSE", amount: "", description: "" });
  const [isClosing, setIsClosing] = useState(false);
  const blind = register.currentBalance === null;

  const utils = api.useUtils();

  // Clave de idempotencia del movimiento en curso: se reutiliza si el usuario reintenta el
  // mismo movimiento y se descarta al editar el formulario.
  const movementKeyRef = useRef<string | null>(null);
  useEffect(() => {
    movementKeyRef.current = null;
  }, [form]);

  const addMovement = api.cashRegister.addMovement.useMutation({
    onSuccess: async (data) => {
      movementKeyRef.current = null;
      setForm({ type: "INCOME", amount: "", description: "" });
      toast.success(data.message);
      await utils.cashRegister.getActive.invalidate();
    },
  });

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const amount = Number.parseFloat(form.amount);
    if (Number.isNaN(amount) || amount <= 0 || addMovement.isPending) return;
    movementKeyRef.current ??= crypto.randomUUID();
    addMovement.mutate({ type: form.type, amount, description: form.description, idempotencyKey: movementKeyRef.current });
  }

  const formatTime = (d: Date) =>
    new Date(d).toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit" });

  const openedTime = new Date(register.openedAt).toLocaleTimeString("es-CO", {
    timeZone: "America/Bogota",
    hour: "2-digit",
    minute: "2-digit",
  });

  const bogotaDateKey = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
  const isStale = bogotaDateKey(new Date(register.openedAt)) !== bogotaDateKey(new Date());

  // Mostrar movimientos + ventas en efectivo juntos ordenados por hora
  // Los movimientos de caja están en register.movements
  // Las ventas en efectivo se reflejan solo en el saldo agregado (cashSalesTotal)
  const movements = register.movements;

  return (
    <div className="space-y-4">
      {isStale && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 dark:border-red-500/30 dark:bg-red-900/10">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
          <div>
            <p className="font-semibold text-red-800 dark:text-red-300">
              Esta caja sigue abierta desde un día anterior
            </p>
            <p className="text-sm text-red-600 dark:text-red-400">
              Ciérrala y cuenta el efectivo antes de seguir registrando ventas o movimientos de hoy.
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 dark:border-emerald-500/30 dark:bg-emerald-900/10">
        <CircleDot className="h-6 w-6 shrink-0 text-emerald-500" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-emerald-800 dark:text-emerald-300">Caja abierta</p>
          <p className="text-sm text-emerald-600 dark:text-emerald-400">
            Desde {openedTime}
            {register.user?.name ? ` · ${register.user.name}` : ""}
          </p>
        </div>
        <div className="flex w-full shrink-0 items-center gap-2 sm:w-auto">
          {/* En cierre ciego el reporte (con el esperado) solo se ve después de cerrar. */}
          {canClose && !blind && (
            <CashHistoryPdfButton registerId={register.id} business={business} openedAt={register.openedAt} />
          )}
          {canClose && !isClosing && (
            <button
              onClick={() => setIsClosing(true)}
              className="min-h-11 shrink-0 rounded-xl border border-red-200 bg-white px-4 text-sm font-semibold text-red-600 transition hover:bg-red-50 dark:border-red-500/30 dark:bg-transparent dark:text-red-400 dark:hover:bg-red-900/20"
            >
              Cerrar caja
            </button>
          )}
        </div>
      </div>

      {isClosing && (
        <CashCloseForm
          expected={register.currentBalance}
          byDenomination={register.closeSettings.byDenomination}
          onClosed={() => setIsClosing(false)}
          onCancel={() => setIsClosing(false)}
        />
      )}

      <div className="space-y-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6 lg:space-y-0">
      <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5">
        <h2 className="mb-4 font-semibold text-slate-700 dark:text-slate-200">Saldo actual</h2>
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-slate-500 dark:text-slate-400">
            <span>Fondo inicial</span>
            <span>{formatCOP(register.openingBalance)}</span>
          </div>
          <div className="flex justify-between text-sm text-slate-500 dark:text-slate-400">
            <span>
              Ventas en efectivo
              {register.cashSalesCount > 0 && (
                <span className="ml-1 text-xs">({register.cashSalesCount})</span>
              )}
            </span>
            {register.cashSalesTotal === null ? (
              <span className="text-slate-500 dark:text-slate-400">Se ve al cerrar</span>
            ) : (
              <span className="text-emerald-600 dark:text-emerald-400">
                +{formatCOP(register.cashSalesTotal)}
              </span>
            )}
          </div>
          {register.cashPaymentsCount > 0 && (
            <div className="flex justify-between text-sm text-slate-500 dark:text-slate-400">
              <span>
                Abonos de fiado
                <span className="ml-1 text-xs">({register.cashPaymentsCount})</span>
              </span>
              {register.cashPaymentsTotal === null ? (
                <span className="text-slate-500 dark:text-slate-400">Se ve al cerrar</span>
              ) : (
                <span className="text-emerald-600 dark:text-emerald-400">+{formatCOP(register.cashPaymentsTotal)}</span>
              )}
            </div>
          )}
          {register.manualIncome > 0 && (
            <div className="flex justify-between text-sm text-slate-500 dark:text-slate-400">
              <span>Entradas manuales</span>
              <span className="text-emerald-600 dark:text-emerald-400">
                +{formatCOP(register.manualIncome)}
              </span>
            </div>
          )}
          {register.manualExpense > 0 && (
            <div className="flex justify-between text-sm text-slate-500 dark:text-slate-400">
              <span>Salidas manuales</span>
              <span className="text-red-500 dark:text-red-400">
                −{formatCOP(register.manualExpense)}
              </span>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-x-3 border-t border-slate-100 pt-3 dark:border-white/10">
            <span className="font-bold text-slate-700 dark:text-slate-200">Total en caja</span>
            {register.currentBalance === null ? (
              <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">Se ve al cerrar la caja</span>
            ) : (
              <span className="text-xl font-bold tabular-nums text-slate-900 sm:text-2xl dark:text-white">
                {formatCOP(register.currentBalance)}
              </span>
            )}
          </div>
          {blind && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Cierre ciego: al cerrar cuentas el efectivo y ahí ves si cuadra con lo registrado.
            </p>
          )}
        </div>
      </div>

      {/* Registrar movimiento — solo en la caja propia (el owner puede operar cualquiera) */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5">
        <h2 className="mb-4 font-semibold text-slate-700 dark:text-slate-200">
          Registrar movimiento
        </h2>

        {!canClose ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Esta caja es de otro usuario. Para registrar entradas o salidas abre tu propia caja.
          </p>
        ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {(["INCOME", "EXPENSE"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setForm((prev) => ({ ...prev, type: t }))}
                className={`inline-flex items-center justify-center gap-1.5 rounded-xl border py-2.5 text-sm font-semibold transition ${
                  form.type === t
                    ? TYPE_ACTIVE_CLASSES[t]
                    : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 dark:border-white/10 dark:bg-transparent dark:text-slate-400"
                }`}
              >
                {t === "INCOME" ? (
                  <ArrowUpCircle className="h-4 w-4" />
                ) : (
                  <ArrowDownCircle className="h-4 w-4" />
                )}
                {t === "INCOME" ? "Entrada" : "Salida"}
              </button>
            ))}
          </div>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Monto</span>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">$</span>
              <input
                type="number"
                min="1"
                step="1"
                value={form.amount}
                onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))}
                placeholder="0"
                className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-7 pr-4 text-sm outline-none ring-violet-400 focus:ring-2 dark:border-white/15 dark:bg-slate-900 dark:text-white"
              />
            </div>
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Descripción</span>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              placeholder={form.type === "INCOME" ? "Ej: Préstamo, cambio..." : "Ej: Pago proveedor, gastos..."}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none ring-violet-400 focus:ring-2 dark:border-white/15 dark:bg-slate-900 dark:text-white"
            />
          </label>

          {form.type === "EXPENSE" && register.currentBalance !== null && Number.parseFloat(form.amount) > register.currentBalance && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-500/30 dark:bg-amber-900/10 dark:text-amber-300">
              Saldo insuficiente. Registra primero una entrada con el dinero que vas a usar.
            </p>
          )}

          {addMovement.error && (
            <p className="text-xs text-red-500">{addMovement.error.message}</p>
          )}

          <button
            type="submit"
            disabled={!form.amount || !form.description.trim() || addMovement.isPending}
            aria-busy={addMovement.isPending}
            className="w-full rounded-xl bg-violet-600 py-2.5 text-sm font-bold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {addMovement.isPending ? "Guardando..." : "Registrar movimiento"}
          </button>
        </form>
        )}
      </div>

      </div>
      <div className="space-y-4">
      {movements.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/5">
          <h2 className="px-5 pt-5 font-semibold text-slate-700 dark:text-slate-200">
            Movimientos de la jornada
          </h2>
          <ul className="mt-3 divide-y divide-slate-100 dark:divide-white/5">
            {movements.map((m) => {
              const isIncome = m.type === "INCOME" || m.type === "OPENING";
              return (
                <li key={m.id} className="flex items-center justify-between px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">
                      {m.description}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {formatTime(m.createdAt)}
                      {m.user?.name ? ` · ${m.user.name}` : ""}
                      {" · "}
                      <span className={`font-medium ${m.type === "EXPENSE" ? "text-red-500" : "text-slate-500"}`}>
                        {TYPE_LABELS[m.type] ?? m.type}
                      </span>
                    </p>
                  </div>
                  <span className={`ml-3 shrink-0 text-sm font-bold ${isIncome ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}>
                    {isIncome ? "+" : "−"}{formatCOP(m.amount)}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="px-5 py-3 text-xs text-slate-500 dark:text-slate-400">
            * Las ventas y los abonos de fiado en efectivo se suman al saldo pero no aparecen aquí como movimientos individuales.
          </p>
        </div>
      )}

      {/* Ventas por otros medios de pago — informativo, no afectan el saldo */}
      {(register.nonCashSales.length > 0 || register.nonCashPayments.length > 0) && (
        <div className="rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/5">
          <h2 className="px-5 pt-5 font-semibold text-slate-700 dark:text-slate-200">
            Otros medios de pago
          </h2>
          <p className="px-5 pb-2 text-xs text-slate-500 dark:text-slate-400">
            Informativo — no se suman al saldo de caja.
          </p>
          <ul className="divide-y divide-slate-100 dark:divide-white/5">
            {register.nonCashSales.map((entry) => (
              <li key={entry.paymentMethod} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    {PAYMENT_LABELS[entry.paymentMethod] ?? entry.paymentMethod}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {entry.count} {entry.count === 1 ? "venta" : "ventas"}
                  </p>
                </div>
                <span className="text-sm font-bold text-slate-500 dark:text-slate-400">
                  {formatCOP(entry.total)}
                </span>
              </li>
            ))}
            {register.nonCashPayments.map((entry) => (
              <li key={`abono-${entry.paymentMethod}`} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    Abonos de fiado · {PAYMENT_LABELS[entry.paymentMethod] ?? entry.paymentMethod}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {entry.count} {entry.count === 1 ? "abono" : "abonos"}
                  </p>
                </div>
                <span className="text-sm font-bold text-slate-500 dark:text-slate-400">
                  {formatCOP(entry.total)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      </div>
      </div>
    </div>
  );
}
