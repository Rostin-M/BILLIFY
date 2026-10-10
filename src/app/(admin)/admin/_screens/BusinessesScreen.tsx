"use client";

import { SearchX, Store } from "lucide-react";
import { useEffect, useState } from "react";

import { type ListBusinessesInput } from "~/lib/platform/contract";
import { type SubscriptionPhase } from "~/lib/subscription/access";

import { BusinessList } from "../_components/BusinessList";
import { SearchField } from "../_components/SearchField";
import {
  buttonClass,
  cardClass,
  EmptyBlock,
  ErrorState,
  FilterChips,
  type FilterOption,
  ListSkeleton,
  LoadMore,
  PageHeader,
} from "../_components/ui";
import { useBusinesses, useOverview } from "../_data/platform";
import { useDebounced, useUrlFilters } from "../_lib/hooks";
import { usePlanActions } from "./usePlanActions";

type StateFilter = "todos" | "por-vencer" | SubscriptionPhase;

const PHASES: SubscriptionPhase[] = ["TRIAL", "ACTIVE", "PAST_DUE", "CANCELED", "READ_ONLY"];

function parseFilter(value: string | null): StateFilter {
  if (value === "por-vencer") return value;
  return PHASES.find((p) => p === value) ?? "todos";
}

export function BusinessesScreen() {
  const url = useUrlFilters();
  const actions = usePlanActions();
  const overview = useOverview().data;

  const filter = parseFilter(url.get("estado"));
  const urlQuery = url.get("q") ?? "";

  // El texto vive aquí mientras se escribe; a la URL llega con un pequeño retraso.
  const [text, setText] = useState(urlQuery);
  const [syncedQuery, setSyncedQuery] = useState(urlQuery);
  if (urlQuery !== syncedQuery) {
    // La URL cambió por fuera (enlace del menú, botón Atrás): el campo la sigue.
    setSyncedQuery(urlQuery);
    if (urlQuery !== text.trim()) setText(urlQuery);
  }
  const debounced = useDebounced(text.trim(), 300);
  const setUrl = url.set;
  useEffect(() => {
    setUrl({ q: debounced.length >= 2 ? debounced : null });
  }, [debounced, setUrl]);

  const input: Omit<ListBusinessesInput, "cursor"> = {
    search: urlQuery || undefined,
    phase: filter === "todos" || filter === "por-vencer" ? undefined : filter,
    expiringSoon: filter === "por-vencer" ? true : undefined,
  };
  const list = useBusinesses(input);
  const filtered = urlQuery !== "" || filter !== "todos";

  const options: FilterOption<StateFilter>[] = [
    { value: "todos", label: "Todos", count: overview?.total },
    { value: "por-vencer", label: "Por vencer", count: overview?.expiringSoon },
    { value: "TRIAL", label: "En prueba", count: overview?.trial },
    { value: "ACTIVE", label: "Activos", count: overview?.active },
    { value: "PAST_DUE", label: "En gracia", count: overview?.pastDue },
    { value: "CANCELED", label: "Cancelados", count: overview?.canceled },
    { value: "READ_ONLY", label: "Solo lectura", count: overview?.readOnly },
  ];

  const clearFilters = () => {
    setText("");
    url.set({ q: null, estado: null });
  };

  return (
    <>
      <PageHeader title="Negocios" subtitle="Todos los negocios que usan BILLIFY." />

      <div className="space-y-3">
        <SearchField
          id="negocios-buscar"
          label="Buscar negocios"
          placeholder="Buscar por nombre, documento o correo del dueño"
          value={text}
          onChange={setText}
        />
        <FilterChips
          label="Filtrar por estado"
          options={options}
          value={filter}
          onChange={(value) => url.set({ estado: value === "todos" ? null : value })}
        />
      </div>

      <section aria-label="Resultados" aria-busy={list.isPending} className={`${cardClass} mt-4 overflow-hidden`}>
        {list.isPending && <ListSkeleton rows={6} />}

        {!list.isPending && list.error && list.items.length === 0 && (
          <ErrorState message={list.error} onRetry={list.refetch} />
        )}

        {!list.isPending && !list.error && list.items.length === 0 && (
          filtered ? (
            <EmptyBlock
              icon={SearchX}
              title="Ningún negocio coincide"
              description="Prueba con otra palabra, con el número del documento o quitando el filtro de estado."
              action={
                <button type="button" onClick={clearFilters} className={buttonClass.secondary}>
                  Quitar búsqueda y filtros
                </button>
              }
            />
          ) : (
            <EmptyBlock
              icon={Store}
              title="Todavía no hay negocios registrados"
              description="Cuando alguien cree su cuenta en BILLIFY aparecerá en esta lista."
            />
          )
        )}

        {!list.isPending && list.items.length > 0 && (
          <>
            <BusinessList businesses={list.items} onActivate={actions.activate} />
            <LoadMore
              hasMore={list.hasMore}
              isLoadingMore={list.isLoadingMore}
              error={list.error}
              onLoadMore={list.loadMore}
              shown={list.items.length}
              noun="negocios"
            />
          </>
        )}
      </section>

      {actions.dialogs}
    </>
  );
}
