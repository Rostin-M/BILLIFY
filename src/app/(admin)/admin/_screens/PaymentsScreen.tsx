"use client";

import { Receipt, SearchX } from "lucide-react";

import { type ListPaymentsInput, type PlatformPaymentRow } from "~/lib/platform/contract";
import { PAYMENT_STATUS_LABELS } from "~/app/_components/subscription/labels";

import { PaymentList } from "../_components/PaymentList";
import {
  buttonClass,
  cardClass,
  EmptyBlock,
  ErrorState,
  FilterChips,
  type FilterOption,
  ListSkeleton,
  LoadMore,
  mutedText,
  PageHeader,
} from "../_components/ui";
import { useOverview, usePayments } from "../_data/platform";
import { useUrlFilters } from "../_lib/hooks";
import { usePlanActions } from "./usePlanActions";

type Status = PlatformPaymentRow["status"];
type StatusFilter = "todos" | Status;

const STATUSES: Status[] = ["APPROVED", "PENDING", "DECLINED", "VOIDED", "ERROR", "EXPIRED"];

const STATUS_OPTIONS: FilterOption<StatusFilter>[] = [
  { value: "todos", label: "Todos" },
  ...STATUSES.map((status) => ({ value: status, label: PAYMENT_STATUS_LABELS[status] })),
];

function Toggle({
  checked,
  onChange,
  label,
  count,
}: Readonly<{ checked: boolean; onChange: (checked: boolean) => void; label: string; count?: number }>) {
  return (
    <label
      className={`admin-choice inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm font-medium transition ${
        checked
          ? "border-blue-700 bg-blue-50 text-blue-900 dark:border-blue-400 dark:bg-blue-500/15 dark:text-blue-100"
          : "border-slate-300 bg-white text-slate-700 dark:border-white/15 dark:bg-transparent dark:text-slate-300"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded accent-blue-700"
      />
      {label}
      {count !== undefined && count > 0 && (
        <span className="rounded-full bg-amber-400 px-1.5 py-0.5 text-[11px] font-bold leading-none text-amber-950">
          {count}
        </span>
      )}
    </label>
  );
}

export function PaymentsScreen() {
  const url = useUrlFilters();
  const actions = usePlanActions();
  const overview = useOverview().data;

  const statusParam = url.get("estado");
  const status: StatusFilter = STATUSES.find((s) => s === statusParam) ?? "todos";
  const onlyManual = url.get("manuales") === "1";
  const needsReview = url.get("revisar") === "1";

  const input: Omit<ListPaymentsInput, "cursor"> = {
    status: status === "todos" ? undefined : status,
    onlyManual: onlyManual ? true : undefined,
    needsReview: needsReview ? true : undefined,
  };
  const list = usePayments(input);
  const filtered = status !== "todos" || onlyManual || needsReview;

  return (
    <>
      <PageHeader
        title="Pagos"
        subtitle="Todos los pagos de suscripción: los de la pasarela y los que registras a mano."
      />

      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Toggle
            checked={needsReview}
            onChange={(on) => url.set({ revisar: on ? "1" : null })}
            label="Por revisar"
            count={overview?.paymentsToReview}
          />
          <Toggle
            checked={onlyManual}
            onChange={(on) => url.set({ manuales: on ? "1" : null })}
            label="Solo manuales"
          />
        </div>
        <FilterChips
          label="Filtrar por estado del pago"
          options={STATUS_OPTIONS}
          value={status}
          onChange={(value) => url.set({ estado: value === "todos" ? null : value })}
        />
      </div>

      <section aria-label="Pagos" aria-busy={list.isPending} className={`${cardClass} mt-4 overflow-hidden`}>
        {list.isPending && <ListSkeleton rows={6} />}

        {!list.isPending && list.error && list.items.length === 0 && (
          <ErrorState message={list.error} onRetry={list.refetch} />
        )}

        {!list.isPending && !list.error && list.items.length === 0 && (
          filtered ? (
            <EmptyBlock
              icon={SearchX}
              title={needsReview && status === "todos" && !onlyManual ? "No hay pagos por revisar" : "Ningún pago coincide con estos filtros"}
              action={
                <button
                  type="button"
                  onClick={() => url.set({ estado: null, manuales: null, revisar: null })}
                  className={buttonClass.secondary}
                >
                  Ver todos los pagos
                </button>
              }
            />
          ) : (
            <EmptyBlock
              icon={Receipt}
              title="Todavía no hay pagos"
              description="Aparecerán aquí cuando un negocio pague su plan o cuando le actives uno."
            />
          )
        )}

        {!list.isPending && list.items.length > 0 && (
          <>
            <PaymentList showBusiness payments={list.items} onResolveReview={actions.resolveReview} />
            <LoadMore
              hasMore={list.hasMore}
              isLoadingMore={list.isLoadingMore}
              error={list.error}
              onLoadMore={list.loadMore}
              shown={list.items.length}
              noun="pagos"
            />
          </>
        )}
      </section>

      <p className={`mt-3 text-xs ${mutedText}`}>
        Para revocar una activación manual, entra al negocio: ahí ves cómo queda su acceso antes de confirmar.
      </p>

      {actions.dialogs}
    </>
  );
}
