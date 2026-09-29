"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, CircleDot } from "lucide-react";
import { toast } from "sonner";
import { api } from "~/trpc/react";

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
  cashSalesTotal: number;
  cashSalesCount: number;
  nonCashSales: NonCashEntry[];
  manualIncome: number;
  manualExpense: number;
  manualBalance: number;
  currentBalance: number;
  user: { name: string | null } | null;
  movements: Movement[];
};

type Props = { register: Register; canClose: boolean; business: { name: string; document: string; logoUrl?: string | null } };

const TYPE_LABELS: Record<string, string> = {
  OPENING: "Fondo inicial",
  INCOME: "Entrada",
  EXPENSE: "Salida",
};

const PAYMENT_LABELS: Record<string, string> = {
  CARD: "Tarjeta",
  CREDIT: "Crédito",
  TRANSFER: "Transferencia",
};

const TYPE_ACTIVE_CLASSES: Record<"INCOME" | "EXPENSE", string> = {
  INCOME: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-900/20 dark:text-emerald-300",
  EXPENSE: "border-red-300 bg-red-50 text-red-700 dark:border-red-500/40 dark:bg-red-900/20 dark:text-red-300",
};

export function CashDashboard({ register, canClose, business }: Readonly<Props>) {
  const [form, setForm] = useState({ type: "INCOME" as "INCOME" | "EXPENSE", amount: "", description: "" });
  const [isClosing, setIsClosing] = useState(false);
  const [closingNote, setClosingNote] = useState("");

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

  const closeRegister = api.cashRegister.close.useMutation({
    onSuccess: async () => {
      await utils.cashRegister.getActive.invalidate();
      await utils.cashRegister.listHistory.invalidate();
    },
  });

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const amount = Number.parseFloat(form.amount);
    if (Number.isNaN(amount) || amount <= 0 || addMovement.isPending) return;
    movementKeyRef.current ??= crypto.randomUUID();
    addMovement.mutate({ type: form.type, amount, description: form.description, idempotencyKey: movementKeyRef.current });
  }

  const formatCOP = (v: number) =>
    v.toLocaleString("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0 });

  const formatTime = (d: Date) =>
    new Date(d).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });

  const openedTime = new Date(register.openedAt).toLocaleTimeString("es-CO", {
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
    <div className="mx-auto max-w-2xl space-y-4">
      {/* Aviso: caja abierta desde un día anterior */}
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

      {/* Header estado */}
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
          {canClose && (
            <CashHistoryPdfButton registerId={register.id} business={business} openedAt={register.openedAt} />
          )}
          {canClose && !isClosing && (
            <button
              onClick={() => setIsClosing(true)}
              className="shrink-0 rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 dark:border-red-500/30 dark:bg-transparent dark:text-red-400 dark:hover:bg-red-900/20"
            >
              Cerrar caja
            </button>
          )}
        </div>
      </div>

      {/* Panel de confirmación de cierre */}
      {isClosing && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 dark:border-red-500/30 dark:bg-red-900/10">
          <h3 className="mb-1 font-semibold text-red-800 dark:text-red-300">Confirmar cierre de caja</h3>
          <p className="mb-4 text-sm text-red-600 dark:text-red-400">
            Saldo final calculado:{" "}
            <span className="font-bold">{formatCOP(register.currentBalance)}</span>
          </p>

          <div className="mb-4 rounded-xl border border-red-100 bg-white p-3 text-sm dark:border-red-500/20 dark:bg-white/5">
            <div className="flex justify-between text-slate-500 dark:text-slate-400">
              <span>Fondo inicial</span>
              <span>{formatCOP(register.openingBalance)}</span>
            </div>
            <div className="flex justify-between text-slate-500 dark:text-slate-400">
              <span>Ventas en efectivo</span>
              <span className="text-emerald-600 dark:text-emerald-400">+{formatCOP(register.cashSalesTotal)}</span>
            </div>
            {register.manualIncome > 0 && (
              <div className="flex justify-between text-slate-500 dark:text-slate-400">
                <span>Entradas manuales</span>
                <span className="text-emerald-600 dark:text-emerald-400">+{formatCOP(register.manualIncome)}</span>
              </div>
            )}
            {register.manualExpense > 0 && (
              <div className="flex justify-between text-slate-500 dark:text-slate-400">
                <span>Salidas manuales</span>
                <span className="text-red-500">−{formatCOP(register.manualExpense)}</span>
              </div>
            )}
            <div className="mt-2 flex justify-between border-t border-red-100 pt-2 font-bold dark:border-red-500/20">
              <span className="text-slate-700 dark:text-slate-200">Total en caja</span>
              <span className="text-slate-900 dark:text-white">{formatCOP(register.currentBalance)}</span>
            </div>
          </div>

          <label className="mb-3 block space-y-1">
            <span className="text-xs font-medium text-red-700 dark:text-red-300">
              Nota de cierre (opcional)
            </span>
            <textarea
              rows={2}
              value={closingNote}
              onChange={(e) => setClosingNote(e.target.value)}
              placeholder="Ej: Todo cuadra, faltaron $5.000..."
              className="w-full resize-none rounded-xl border border-red-200 bg-white px-3 py-2 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 dark:border-red-500/30 dark:bg-slate-900 dark:text-white"
            />
          </label>

          {closeRegister.error && (
            <p className="mb-3 text-sm text-red-600">{closeRegister.error.message}</p>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => closeRegister.mutate({ closingNote: closingNote.trim() || undefined })}
              disabled={closeRegister.isPending}
              className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-bold text-white transition hover:bg-red-700 disabled:opacity-50"
            >
              {closeRegister.isPending ? "Cerrando..." : "Confirmar cierre"}
            </button>
            <button
              onClick={() => { setIsClosing(false); setClosingNote(""); closeRegister.reset(); }}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-white dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Saldo */}
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
            <span className="text-emerald-600 dark:text-emerald-400">
              +{formatCOP(register.cashSalesTotal)}
            </span>
          </div>
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
          <div className="flex items-center justify-between border-t border-slate-100 pt-3 dark:border-white/10">
            <span className="font-bold text-slate-700 dark:text-slate-200">Total en caja</span>
            <span className="text-2xl font-bold text-slate-900 dark:text-white">
              {formatCOP(register.currentBalance)}
            </span>
          </div>
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
          {/* Tipo */}
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

          {/* Monto */}
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

          {/* Descripción */}
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

          {form.type === "EXPENSE" && Number.parseFloat(form.amount) > register.currentBalance && (
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
            className="w-full rounded-xl bg-violet-600 py-2.5 text-sm font-bold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {addMovement.isPending ? "Guardando..." : "Registrar movimiento"}
          </button>
        </form>
        )}
      </div>

      {/* Movimientos del día */}
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
                    <p className="text-xs text-slate-500 dark:text-slate-500">
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
          <p className="px-5 py-3 text-xs text-slate-500 dark:text-slate-500">
            * Las ventas en efectivo se suman al saldo pero no aparecen aquí como movimientos individuales.
          </p>
        </div>
      )}

      {/* Ventas por otros medios de pago — informativo, no afectan el saldo */}
      {register.nonCashSales.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/5">
          <h2 className="px-5 pt-5 font-semibold text-slate-700 dark:text-slate-200">
            Otros medios de pago
          </h2>
          <p className="px-5 pb-2 text-xs text-slate-500 dark:text-slate-500">
            Informativo — no se suman al saldo de caja.
          </p>
          <ul className="divide-y divide-slate-100 dark:divide-white/5">
            {register.nonCashSales.map((entry) => (
              <li key={entry.paymentMethod} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    {PAYMENT_LABELS[entry.paymentMethod] ?? entry.paymentMethod}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-500">
                    {entry.count} {entry.count === 1 ? "venta" : "ventas"}
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
  );
}
