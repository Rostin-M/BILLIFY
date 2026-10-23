"use client";

import { Minus, Plus, Users } from "lucide-react";
import { useId, useState } from "react";
import { api, type RouterOutputs } from "~/trpc/react";
import { GuestNameInput, type LinkedCustomer } from "./GuestNameInput";

type OpenedTable = RouterOutputs["tableSession"]["create"];

const MAX_GUESTS = 30;

type Props = {
  suggestedName: string;
  onCancel: () => void;
  onOpened: (table: OpenedTable) => void;
};

const inputClass =
  "min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none ring-violet-400 focus:ring-2 dark:border-white/15 dark:bg-slate-800 dark:text-white";
const stepClass =
  "inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-600 transition hover:bg-slate-50 disabled:opacity-40 dark:border-white/15 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700";

export function OpenTableForm({ suggestedName, onCancel, onOpened }: Readonly<Props>) {
  const countLabelId = useId();
  const [name, setName] = useState(suggestedName);
  // Texto libre para poder borrarlo y escribir otro número; vacío equivale a 1.
  const [countText, setCountText] = useState("1");
  const [guestNames, setGuestNames] = useState<string[]>([]);
  const [guestCustomers, setGuestCustomers] = useState<(LinkedCustomer | null)[]>([]);

  const parsed = Number.parseInt(countText, 10);
  const count = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), MAX_GUESTS) : 1;

  const utils = api.useUtils();
  const createSession = api.tableSession.create.useMutation({
    onSuccess: async (table) => {
      await utils.tableSession.listActive.invalidate();
      await utils.tableSession.suggestName.invalidate();
      onOpened(table);
    },
  });

  function setCount(next: number) {
    setCountText(String(Math.min(Math.max(next, 1), MAX_GUESTS)));
  }

  function setGuestName(index: number, value: string) {
    setGuestNames((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }

  function setGuestCustomer(index: number, customer: LinkedCustomer | null) {
    setGuestCustomers((prev) => {
      const next = [...prev];
      next[index] = customer;
      return next;
    });
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    createSession.mutate({
      name: name.trim() || suggestedName,
      guests: Array.from({ length: count }, (_, i) => ({
        name: guestNames[i]?.trim() ?? "",
        customerId: guestCustomers[i]?.id,
      })),
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-4 dark:border-violet-500/30 dark:bg-violet-900/10 sm:px-5"
    >
      <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
        <label className="block space-y-1 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-200">Nombre de la mesa</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            placeholder={suggestedName}
            className={inputClass}
          />
        </label>

        <div className="space-y-1 text-sm">
          <span id={countLabelId} className="block font-medium text-slate-700 dark:text-slate-200">
            ¿Cuántos clientes?
          </span>
          <div role="group" aria-labelledby={countLabelId} className="flex items-center gap-2">
            <button type="button" onClick={() => setCount(count - 1)} disabled={count <= 1} aria-label="Un cliente menos" className={stepClass}>
              <Minus className="h-4 w-4" />
            </button>
            <input
              aria-label="Número de clientes"
              inputMode="numeric"
              value={countText}
              onChange={(e) => setCountText(e.target.value.replace(/\D/g, "").slice(0, 2))}
              onBlur={() => setCount(count)}
              placeholder="1"
              className="min-h-11 w-14 rounded-xl border border-slate-300 bg-white text-center text-base font-bold tabular-nums outline-none ring-violet-400 focus:ring-2 dark:border-white/15 dark:bg-slate-800 dark:text-white"
            />
            <button type="button" onClick={() => setCount(count + 1)} disabled={count >= MAX_GUESTS} aria-label="Un cliente más" className={stepClass}>
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">
          <Users className="h-4 w-4 text-violet-500" />
          {count === 1 ? "¿Cómo identificas al cliente?" : "¿Cómo identificas a cada cliente?"}
          <span className="font-normal text-slate-500 dark:text-slate-400">(opcional)</span>
        </legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {Array.from({ length: count }, (_, i) => (
            <div key={i} className="flex items-center gap-2">
              <span aria-hidden="true" className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">
                {i + 1}
              </span>
              <GuestNameInput
                ariaLabel={`Nombre o seña del cliente ${i + 1}`}
                value={guestNames[i] ?? ""}
                onChange={(v) => setGuestName(i, v)}
                customer={guestCustomers[i] ?? null}
                onCustomerChange={(c) => setGuestCustomer(i, c)}
                placeholder={`Cliente ${i + 1} · nombre o seña`}
                className={inputClass}
              />
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Al escribir verás los clientes guardados que coinciden: elige uno para identificarlo, o deja el nombre que
          escribiste. Si no escribes nada, quedan como Cliente 1, Cliente 2… y puedes cambiarlos después.
        </p>
      </fieldset>

      {createSession.error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-500/30 dark:bg-red-900/10 dark:text-red-300">
          {createSession.error.message}
        </p>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm text-slate-500 hover:bg-white dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={createSession.isPending}
          aria-busy={createSession.isPending}
          className="min-h-11 rounded-xl bg-violet-600 px-5 text-sm font-bold text-white transition hover:bg-violet-700 disabled:opacity-50"
        >
          {createSession.isPending ? "Abriendo..." : "Abrir y tomar pedido"}
        </button>
      </div>
    </form>
  );
}
