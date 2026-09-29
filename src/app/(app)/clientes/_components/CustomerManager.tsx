"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Users } from "lucide-react";
import { api } from "~/trpc/react";
import { parseZodError } from "~/lib/parseZodError";
import { EmptyState } from "~/app/_components/EmptyState";
import { SkeletonListRows } from "~/app/_components/Skeletons";

type Customer = {
  id: string;
  name: string;
  alias: string | null;
  document: string | null;
  email: string | null;
  phone: string | null;
  isActive: boolean;
  createdAt: Date;
  _count: { sales: number };
  debt: number;
};

type EditForm = {
  name: string;
  alias: string;
  document: string;
  email: string;
  phone: string;
};

const PAYMENT_LABELS: Record<string, string> = {
  CASH: "Efectivo",
  CARD: "Tarjeta",
  TRANSFER: "Transferencia",
  CREDIT: "Crédito",
};

function emptyForm(c?: Customer): EditForm {
  return {
    name: c?.name ?? "",
    alias: c?.alias ?? "",
    document: c?.document ?? "",
    email: c?.email ?? "",
    phone: c?.phone ?? "",
  };
}

export function CustomerManager() {
  const utils = api.useUtils();
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [form, setForm] = useState<EditForm>(emptyForm());

  const { data: customers = [], isPending } = api.customer.list.useQuery();
  const { data: historyData, isPending: historyLoading } = api.customer.history.useQuery(
    { customerId: historyId! },
    { enabled: !!historyId },
  );

  const createCustomer = api.customer.create.useMutation({
    onSuccess: async (data) => {
      toast.success(data.message);
      setShowCreate(false);
      setForm(emptyForm());
      await utils.customer.list.invalidate();
    },
  });

  const updateCustomer = api.customer.update.useMutation({
    onSuccess: async (data) => {
      toast.success(data.message);
      setEditingId(null);
      await utils.customer.list.invalidate();
    },
  });

  const setActive = api.customer.setActive.useMutation({
    onSuccess: () => utils.customer.list.invalidate(),
  });

  function startEdit(c: Customer) {
    setEditingId(c.id);
    setForm(emptyForm(c));
    setShowCreate(false);
    setHistoryId(null);
  }

  function handleField(field: keyof EditForm) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
  }

  const formatCOP = (v: number) =>
    v.toLocaleString("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0 });

  const formatDate = (d: Date) =>
    new Date(d).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-slate-800 dark:text-slate-100">Clientes registrados</h2>
          <button
            onClick={() => { setShowCreate((v) => !v); setEditingId(null); setHistoryId(null); setForm(emptyForm()); }}
            className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-violet-500"
          >
            {showCreate ? "Cancelar" : "+ Nuevo cliente"}
          </button>
        </div>

        {/* Formulario crear */}
        {showCreate && (
          <form
            onSubmit={(e) => { e.preventDefault(); createCustomer.mutate(form); }}
            className="mb-5 space-y-3 border-b border-slate-100 pb-5 dark:border-white/10"
          >
            <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300">Nuevo cliente</h3>
            <CustomerFields form={form} handleField={handleField} />
            {createCustomer.error && (() => {
              const { fieldErrors, formError } = parseZodError(createCustomer.error.message);
              return (
                <>
                  {Object.entries(fieldErrors).map(([field, msg]) => (
                    <p key={field} className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
                      {msg}
                    </p>
                  ))}
                  {formError && (
                    <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
                      {formError}
                    </p>
                  )}
                </>
              );
            })()}
            <button
              type="submit"
              disabled={createCustomer.isPending}
              className="w-full rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:opacity-60"
            >
              {createCustomer.isPending ? "Guardando..." : "Crear cliente"}
            </button>
          </form>
        )}

        {/* Lista */}
        {isPending && <SkeletonListRows count={4} />}
        {!isPending && customers.length === 0 && (
          <EmptyState
            icon={Users}
            title="Sin clientes registrados"
            description="Agrega tu primer cliente para registrar historial de compras."
            onAction={{ label: "+ Nuevo cliente", onClick: () => setShowCreate(true) }}
          />
        )}
        {!isPending && customers.length > 0 && (
          <ul className="divide-y divide-slate-100 dark:divide-white/5">
            {customers.map((c) => (
              <li key={c.id} className="py-3">
                {/* Fila principal */}
                {editingId === c.id ? (
                  <form
                    onSubmit={(e) => { e.preventDefault(); updateCustomer.mutate({ id: c.id, ...form }); }}
                    className="space-y-2"
                  >
                    <CustomerFields form={form} handleField={handleField} />
                    {updateCustomer.error && (() => {
                      const { fieldErrors, formError } = parseZodError(updateCustomer.error.message);
                      return (
                        <>
                          {Object.entries(fieldErrors).map(([field, msg]) => (
                            <p key={field} className="text-xs text-red-500">{msg}</p>
                          ))}
                          {formError && <p className="text-xs text-red-500">{formError}</p>}
                        </>
                      );
                    })()}
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={updateCustomer.isPending}
                        className="min-h-11 flex-1 rounded-lg bg-violet-600 text-sm font-semibold text-white disabled:opacity-60"
                      >
                        {updateCustomer.isPending ? "Guardando..." : "Guardar"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="min-h-11 rounded-lg border border-slate-200 px-3 text-sm text-slate-500 dark:border-white/10"
                      >
                        Cancelar
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className={`break-words text-sm font-medium ${c.isActive ? "text-slate-800 dark:text-slate-100" : "text-slate-500 line-through dark:text-slate-500"}`}>
                          {c.name}
                        </p>
                        {c.alias && (
                          <span className="text-xs text-slate-500 dark:text-slate-500">
                            &quot;{c.alias}&quot;
                          </span>
                        )}
                        <span className="text-xs text-slate-500 dark:text-slate-500">
                          {c._count.sales} {c._count.sales === 1 ? "venta" : "ventas"}
                        </span>
                        {c.debt > 0.01 && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                            Debe {formatCOP(c.debt)}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-500">
                        {[c.document, c.phone, c.email].filter(Boolean).join(" · ") || "Sin datos de contacto"}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 sm:shrink-0 sm:justify-end">
                      {c._count.sales > 0 && (
                        <button
                          onClick={() => setHistoryId(historyId === c.id ? null : c.id)}
                          className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                            historyId === c.id
                              ? "border-violet-300 bg-violet-100 text-violet-700 dark:border-violet-500/40 dark:bg-violet-900/20 dark:text-violet-300"
                              : "border-slate-200 text-slate-500 hover:border-violet-200 hover:text-violet-600 dark:border-white/10 dark:text-slate-400"
                          }`}
                        >
                          Historial
                        </button>
                      )}
                      <button
                        onClick={() => startEdit(c)}
                        className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-500 hover:border-violet-200 hover:text-violet-600 dark:border-white/10 dark:text-slate-400"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => setActive.mutate({ customerId: c.id, isActive: !c.isActive })}
                        disabled={setActive.isPending}
                        className={`rounded-full px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
                          c.isActive
                            ? "bg-emerald-100 text-emerald-700 hover:bg-red-100 hover:text-red-700 dark:bg-emerald-500/20 dark:text-emerald-300 dark:hover:bg-red-500/20 dark:hover:text-red-300"
                            : "bg-red-100 text-red-700 hover:bg-emerald-100 hover:text-emerald-700 dark:bg-red-500/20 dark:text-red-300 dark:hover:bg-emerald-500/20 dark:hover:text-emerald-300"
                        }`}
                      >
                        {c.isActive ? "Activo" : "Inactivo"}
                      </button>
                    </div>
                  </div>
                )}

                {/* Historial expandible — solo compras, sin detalle de productos ni abonos (ver Fiados) */}
                {historyId === c.id && (
                  <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-white/5 dark:bg-white/5">
                    {historyLoading && (
                      <p className="text-xs text-slate-500">Cargando historial...</p>
                    )}
                    {!historyLoading && (!historyData || historyData.sales.length === 0) && (
                      <p className="text-xs text-slate-500">Sin ventas registradas.</p>
                    )}
                    {!historyLoading && historyData && historyData.sales.length > 0 && (
                      <>
                        <p className="mb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                          Total comprado: {formatCOP(historyData.totalSpent)}
                        </p>
                        <ul className="space-y-1.5">
                          {historyData.sales.map((s) => (
                            <li key={s.id} className="flex items-center justify-between text-xs">
                              <div>
                                <span className="font-medium text-slate-700 dark:text-slate-200">
                                  {s.invoiceNumber ?? "Venta rápida"}
                                </span>
                                <span className="ml-2 text-slate-500 dark:text-slate-500">
                                  {formatDate(s.createdAt)} · {PAYMENT_LABELS[s.paymentMethod] ?? s.paymentMethod}
                                </span>
                              </div>
                              <span className="font-semibold text-slate-700 dark:text-slate-200">
                                {formatCOP(s.total)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function CustomerFields({
  form,
  handleField,
}: Readonly<{
  form: EditForm;
  handleField: (f: keyof EditForm) => (e: React.ChangeEvent<HTMLInputElement>) => void;
}>) {
  return (
    <>
      <label className="block space-y-1 text-sm">
        <span className="text-slate-700 dark:text-slate-300">
          Nombre <span className="text-red-500">*</span>
        </span>
        <input
          required
          value={form.name}
          onChange={handleField("name")}
          placeholder="Nombre completo"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-violet-400 transition focus:ring-2 dark:border-white/15 dark:bg-slate-900 dark:text-white"
        />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="text-slate-700 dark:text-slate-300">Alias</span>
        <input
          value={form.alias}
          onChange={handleField("alias")}
          placeholder="Ej: Don Pedro, el de la tienda"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-violet-400 transition focus:ring-2 dark:border-white/15 dark:bg-slate-900 dark:text-white"
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block space-y-1 text-sm">
          <span className="text-slate-700 dark:text-slate-300">Documento</span>
          <input
            value={form.document}
            onChange={handleField("document")}
            placeholder="CC / NIT"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-violet-400 transition focus:ring-2 dark:border-white/15 dark:bg-slate-900 dark:text-white"
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="text-slate-700 dark:text-slate-300">Teléfono</span>
          <input
            value={form.phone}
            onChange={handleField("phone")}
            placeholder="300 000 0000"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-violet-400 transition focus:ring-2 dark:border-white/15 dark:bg-slate-900 dark:text-white"
          />
        </label>
      </div>
      <label className="block space-y-1 text-sm">
        <span className="text-slate-700 dark:text-slate-300">Correo electrónico</span>
        <input
          type="email"
          value={form.email}
          onChange={handleField("email")}
          placeholder="cliente@correo.com"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-violet-400 transition focus:ring-2 dark:border-white/15 dark:bg-slate-900 dark:text-white"
        />
      </label>
    </>
  );
}
