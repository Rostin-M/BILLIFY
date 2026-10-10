"use client";

import { ScrollText } from "lucide-react";

import { AuditList } from "../_components/AuditList";
import { cardClass, EmptyBlock, ErrorState, ListSkeleton, LoadMore, PageHeader } from "../_components/ui";
import { useAudit } from "../_data/platform";

const NO_FILTERS = {};

export function AuditScreen() {
  const list = useAudit(NO_FILTERS);

  return (
    <>
      <PageHeader
        title="Bitácora"
        subtitle="Cada acción hecha desde este panel, con fecha, quién la hizo y desde dónde."
      />

      <section aria-label="Acciones registradas" aria-busy={list.isPending} className={`${cardClass} overflow-hidden`}>
        {list.isPending && <ListSkeleton rows={6} />}

        {!list.isPending && list.error && list.items.length === 0 && (
          <ErrorState message={list.error} onRetry={list.refetch} />
        )}

        {!list.isPending && !list.error && list.items.length === 0 && (
          <EmptyBlock
            icon={ScrollText}
            title="La bitácora está vacía"
            description="Cuando actives un plan, extiendas una prueba o revoques una activación, quedará registrado aquí."
          />
        )}

        {!list.isPending && list.items.length > 0 && (
          <>
            <AuditList showBusiness entries={list.items} />
            <LoadMore
              hasMore={list.hasMore}
              isLoadingMore={list.isLoadingMore}
              error={list.error}
              onLoadMore={list.loadMore}
              shown={list.items.length}
              noun="acciones"
            />
          </>
        )}
      </section>
    </>
  );
}
