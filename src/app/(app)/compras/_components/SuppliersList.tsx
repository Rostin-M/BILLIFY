"use client";

import { Archive, ChevronDown, ChevronRight, Pencil, Phone, Plus, StickyNote, Truck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api, type RouterOutputs } from "~/trpc/react";
import { EmptyState } from "~/app/_components/EmptyState";
import { formatCOP } from "~/lib/format/money";
import { fmtDay, PurchaseCard } from "./PayablesList";

type Supplier = RouterOutputs["supplier"]["list"][number];
type SupplierForm = { name: string; phone: string; document: string; contactName: string; note: string };

const EMPTY_FORM: SupplierForm = { name: "", phone: "", document: "", contactName: "", note: "" };
const inputClass =
  "min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base outline-none ring-violet-400 focus:ring-2 sm:text-sm dark:border-white/15 dark:bg-slate-900 dark:text-white";

function SupplierFormFields({ form, setForm }: Readonly<{ form: SupplierForm; setForm: (f: SupplierForm) => void }>) {
  const field = (key: keyof SupplierForm, label: string, placeholder: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span>
      <input value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} placeholder={placeholder} className={inputClass} {...extra} />
    </label>
  );
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {field("name", "Nombre", "Ej: Fritos Natalia", { maxLength: 120, autoFocus: true })}
      {field("phone", "Teléfono / WhatsApp", "300 123 4567", { maxLength: 30, inputMode: "tel" })}
      {field("contactName", "Persona de contacto", "Quién trae el pedido", { maxLength: 120 })}
      {field("document", "NIT o cédula", "Opcional", { maxLength: 30 })}
      <div className="sm:col-span-2">{field("note", "Nota", "Ej: viene los martes, pedir antes de las 10", { maxLength: 500 })}</div>
    </div>
  );
}

function SupplierHistory({ supplierId }: Readonly<{ supplierId: string }>) {
  const { data: purchases, isPending } = api.purchase.list.useQuery({ supplierId });
  const { data: history } = api.supplier.history.useQuery({ supplierId });

  if (isPending) return <p className="px-4 py-3 text-sm text-slate-500">Cargando historial...</p>;
  const movements = history?.movements ?? [];
  if ((purchases?.length ?? 0) === 0 && movements.length === 0) {
    return <p className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">Todavía no hay compras ni salidas a este proveedor.</p>;
  }

  return (
    <div className="space-y-3 px-4 py-3">
      {purchases && purchases.length > 0 && (
        <ul className="space-y-2">
          {purchases.map((p) => <PurchaseCard key={p.id} purchase={p} showSupplier={false} />)}
        </ul>
      )}
      {movements.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Salidas de caja</p>
          <ul className="space-y-1">
            {movements.map((m) => (
              <li key={m.id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-white/5">
                <span className="flex justify-between gap-3">
                  <span className="text-slate-700 dark:text-slate-200">{m.description}</span>
                  <span className="shrink-0 font-semibold tabular-nums text-red-600 dark:text-red-400">−{formatCOP(m.amount)}</span>
                </span>
                <span className="block text-xs text-slate-500">{fmtDay(m.createdAt)}{m.user?.name && ` · ${m.user.name}`}</span>
                {m.note && (
                  <span className="mt-0.5 flex items-start gap-1 text-xs text-amber-800 dark:text-amber-300">
                    <StickyNote className="mt-0.5 h-3 w-3 shrink-0" aria-hidden /> {m.note}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function purchasesSummary(supplier: Supplier): string {
  if (supplier.purchaseCount === 0) return "Sin compras registradas";
  const noun = supplier.purchaseCount === 1 ? "compra" : "compras";
  return `${supplier.purchaseCount} ${noun} · última ${fmtDay(supplier.lastPurchaseAt!)}`;
}

function SupplierRow({ supplier, isOwner }: Readonly<{ supplier: Supplier; isOwner: boolean }>) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<SupplierForm>(EMPTY_FORM);
  const utils = api.useUtils();

  const update = api.supplier.update.useMutation({
    onSuccess: async (d) => { toast.success(d.message); setEditing(false); await utils.supplier.invalidate(); await utils.purchase.invalidate(); },
  });
  const archive = api.supplier.setActive.useMutation({
    onSuccess: async (d) => { toast.success(d.message); await utils.supplier.invalidate(); },
  });

  if (editing) {
    return (
      <li className="space-y-3 rounded-2xl border border-violet-200 bg-white p-4 dark:border-violet-500/30 dark:bg-white/5">
        <SupplierFormFields form={form} setForm={setForm} />
        {update.error && <p role="alert" className="text-sm text-red-600">{update.error.message}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={() => setEditing(false)} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm dark:border-white/10 dark:text-slate-300">Cancelar</button>
          <button
            type="button"
            disabled={form.name.trim().length < 2 || update.isPending}
            onClick={() => update.mutate({ id: supplier.id, ...form })}
            className="min-h-11 flex-1 rounded-xl bg-violet-600 px-4 text-sm font-bold text-white disabled:opacity-50"
          >
            {update.isPending ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-white/5">
      <div className="flex items-center gap-2 px-4 py-3">
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex min-w-0 flex-1 items-start gap-2 text-left">
          {open ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />}
          <span className="min-w-0">
            <span className="block truncate font-semibold text-slate-800 dark:text-slate-100">{supplier.name}</span>
            <span className="block text-xs text-slate-500 dark:text-slate-400">
              {purchasesSummary(supplier)}
              {supplier.contactName && ` · ${supplier.contactName}`}
            </span>
          </span>
        </button>
        {supplier.balance > 0 && (
          <span className="shrink-0 text-right">
            <span className="block text-sm font-bold tabular-nums text-amber-700 dark:text-amber-300">{formatCOP(supplier.balance)}</span>
            <span className="block text-xs text-slate-500">le debes</span>
          </span>
        )}
        {supplier.phone && (
          <a href={`tel:${supplier.phone.replace(/\s/g, "")}`} aria-label={`Llamar a ${supplier.name}`} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10">
            <Phone className="h-4 w-4" />
          </a>
        )}
      </div>
      {open && (
        <div className="border-t border-slate-100 dark:border-white/10">
          {supplier.note && (
            <p className="mx-4 mt-3 flex items-start gap-1.5 rounded-lg bg-amber-100 px-2.5 py-1.5 text-sm text-amber-900 dark:bg-amber-500/15 dark:text-amber-200">
              <StickyNote className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {supplier.note}
            </p>
          )}
          <SupplierHistory supplierId={supplier.id} />
          {isOwner && (
            <div className="flex flex-wrap gap-2 border-t border-slate-100 px-4 py-3 dark:border-white/10">
              <button
                type="button"
                onClick={() => {
                  setForm({ name: supplier.name, phone: supplier.phone ?? "", document: supplier.document ?? "", contactName: supplier.contactName ?? "", note: supplier.note ?? "" });
                  setEditing(true);
                }}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300"
              >
                <Pencil className="h-4 w-4" aria-hidden /> Editar
              </button>
              <button
                type="button"
                disabled={archive.isPending}
                onClick={() => archive.mutate({ id: supplier.id, isActive: false })}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:text-slate-300"
              >
                <Archive className="h-4 w-4" aria-hidden /> Archivar
              </button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

export function SuppliersList({ isOwner }: Readonly<{ isOwner: boolean }>) {
  const { data: suppliers = [] } = api.supplier.list.useQuery();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<SupplierForm>(EMPTY_FORM);
  const [query, setQuery] = useState("");
  const utils = api.useUtils();

  const create = api.supplier.create.useMutation({
    onSuccess: async (d) => {
      toast.success(d.message);
      setAdding(false);
      setForm(EMPTY_FORM);
      await utils.supplier.list.invalidate();
    },
  });

  const q = query.trim().toLowerCase();
  const shown = suppliers
    .filter((s) => !q || s.name.toLowerCase().includes(q) || (s.contactName?.toLowerCase().includes(q) ?? false))
    .sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name, "es"));

  return (
    <div className="space-y-3">
      {adding ? (
        <form
          onSubmit={(e) => { e.preventDefault(); create.mutate(form); }}
          className="space-y-3 rounded-2xl border border-violet-200 bg-white p-4 dark:border-violet-500/30 dark:bg-white/5"
        >
          <SupplierFormFields form={form} setForm={setForm} />
          {create.error && <p role="alert" className="text-sm text-red-600">{create.error.message}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => setAdding(false)} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm dark:border-white/10 dark:text-slate-300">Cancelar</button>
            <button type="submit" disabled={form.name.trim().length < 2 || create.isPending} className="min-h-11 flex-1 rounded-xl bg-violet-600 px-4 text-sm font-bold text-white disabled:opacity-50">
              {create.isPending ? "Guardando..." : "Guardar proveedor"}
            </button>
          </div>
        </form>
      ) : (
        <div className="flex gap-2">
          {suppliers.length > 5 && (
            <input
              type="search"
              aria-label="Buscar proveedor"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar proveedor..."
              className={inputClass}
            />
          )}
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-violet-600 px-4 text-sm font-bold text-white hover:bg-violet-700"
          >
            <Plus className="h-4 w-4" aria-hidden /> Nuevo proveedor
          </button>
        </div>
      )}

      {suppliers.length === 0 && !adding ? (
        <EmptyState icon={Truck} title="Aún no tienes proveedores" description="Guárdalos aquí o al registrar una compra o una salida de caja." />
      ) : (
        <ul className="space-y-3">
          {shown.map((s) => <SupplierRow key={s.id} supplier={s} isOwner={isOwner} />)}
        </ul>
      )}
    </div>
  );
}
