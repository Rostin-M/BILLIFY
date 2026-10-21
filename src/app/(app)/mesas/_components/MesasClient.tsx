"use client";

import { Armchair, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { api, type RouterOutputs } from "~/trpc/react";
import { formatCOP } from "~/lib/format/money";
import type { BusinessInfoForPdf } from "~/lib/pdf/FacturaPDF";
import { AddOrderModal } from "./AddOrderModal";
import { MesaInvoicesModal } from "./MesaInvoicesModal";
import { guestTotal } from "./mesaStatus";
import { OpenTableForm } from "./OpenTableForm";
import { TableCard } from "./TableCard";

type SessionData = RouterOutputs["tableSession"]["listActive"][number];

type Business = { name: string; document: string; logoUrl?: string | null };
type Props = { business: Business; invoiceBusiness: BusinessInfoForPdf };

export function MesasClient({ business, invoiceBusiness }: Readonly<Props>) {
  const [showCreate, setShowCreate] = useState(false);
  const [orderingFor, setOrderingFor] = useState<{ id: string; name: string } | null>(null);
  // Accordion: only one table expanded at a time, to keep the mobile view compact.
  const [expandedTableId, setExpandedTableId] = useState<string | null>(null);
  const [guestSearch, setGuestSearch] = useState("");
  const [invoiceSaleIds, setInvoiceSaleIds] = useState<string[] | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const { data: sessions = [], isLoading, isError: refreshFailed } = api.tableSession.listActive.useQuery(undefined, {
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
  });

  const normalizedGuestSearch = guestSearch.trim().toLowerCase();
  function guestMatches(g: SessionData["guests"][number]) {
    return (
      g.name.toLowerCase().includes(normalizedGuestSearch) ||
      (g.description?.toLowerCase().includes(normalizedGuestSearch) ?? false)
    );
  }
  const filteredSessions = normalizedGuestSearch
    ? sessions.filter((s) => s.guests.some(guestMatches))
    : sessions;

  // When the search narrows down to exactly one matching guest, jump straight to them
  // (expand their table and their row) instead of making the cashier tap through.
  const uniqueMatch = (() => {
    if (!normalizedGuestSearch) return null;
    const matches = filteredSessions.flatMap((s) =>
      s.guests.filter(guestMatches).map((g) => ({ sessionId: s.id, guestId: g.id })),
    );
    return matches.length === 1 ? matches[0]! : null;
  })();

  useEffect(() => {
    if (uniqueMatch) setExpandedTableId(uniqueMatch.sessionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uniqueMatch?.sessionId, uniqueMatch?.guestId]);
  const { data: suggestedName = "Mesa 1" } = api.tableSession.suggestName.useQuery();

  function handleOpened(table: RouterOutputs["tableSession"]["create"]) {
    setShowCreate(false);
    setGuestSearch("");
    setExpandedTableId(table.id);
    const first = table.guests[0];
    if (first) setOrderingFor(first);
  }

  if (isLoading) {
    return <p className="text-center text-sm text-slate-500 dark:text-slate-400 py-10">Cargando mesas...</p>;
  }

  const tablePlural = sessions.length !== 1 ? "s" : "";
  const sessionsLabel = sessions.length === 0
    ? "No hay mesas abiertas"
    : `${sessions.length} mesa${tablePlural} abierta${tablePlural}`;
  const pendingTotal = sessions.reduce((s, t) => s + t.guests.reduce((g, guest) => g + guestTotal(guest), 0), 0);

  return (
    <div className="space-y-4">
      {invoiceSaleIds && (
        <MesaInvoicesModal
          saleIds={invoiceSaleIds}
          business={invoiceBusiness}
          onClose={() => setInvoiceSaleIds(null)}
        />
      )}
      {orderingFor && (
        <AddOrderModal
          guestId={orderingFor.id}
          guestName={orderingFor.name}
          onClose={() => setOrderingFor(null)}
          onSuccess={() => setOrderingFor(null)}
        />
      )}
      {showCreate ? (
        <OpenTableForm suggestedName={suggestedName} onCancel={() => setShowCreate(false)} onOpened={handleOpened} />
      ) : (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            <span className="font-semibold text-slate-700 dark:text-slate-200">{sessionsLabel}</span>
            {pendingTotal > 0 && (
              <span className="block sm:inline">
                <span className="hidden sm:inline"> · </span>
                <span className="tabular-nums">{formatCOP(pendingTotal)}</span> por cobrar
              </span>
            )}
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="min-h-11 shrink-0 rounded-xl bg-violet-600 px-4 text-sm font-bold text-white transition hover:bg-violet-700"
          >
            + Nueva mesa
          </button>
        </div>
      )}

      {sessions.length > 0 && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            aria-label="Buscar cliente por nombre o apodo"
            type="search"
            value={guestSearch}
            onChange={(e) => setGuestSearch(e.target.value)}
            placeholder="Buscar cliente por nombre o apodo..."
            className="min-h-11 w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-base outline-none sm:text-sm focus:border-violet-400 focus:ring-2 focus:ring-violet-500 dark:border-white/10 dark:bg-white/5 dark:text-white dark:focus:border-violet-500 dark:focus:ring-violet-400"
          />
        </div>
      )}

      {refreshFailed && (
        <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-900/20 dark:text-amber-200">
          No se pudieron actualizar las mesas. Revisa la conexión; se reintentará solo.
        </p>
      )}

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
        {filteredSessions.map((session: SessionData) => (
          <TableCard
            key={session.id}
            session={session}
            business={business}
            expanded={expandedTableId === session.id}
            now={now}
            onToggleExpanded={() =>
              setExpandedTableId((prev) => (prev === session.id ? null : session.id))
            }
            focusGuestId={uniqueMatch?.sessionId === session.id ? uniqueMatch.guestId : null}
            onInvoices={setInvoiceSaleIds}
          />
        ))}
      </div>

      {normalizedGuestSearch && filteredSessions.length === 0 && (
        <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
          Ningún cliente coincide con &quot;{guestSearch}&quot;.
        </p>
      )}

      {sessions.length === 0 && !showCreate && (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center dark:border-white/10 dark:bg-white/5">
          <Armchair className="mx-auto mb-3 h-10 w-10 text-slate-300 dark:text-slate-400" />
          <p className="text-slate-500 dark:text-slate-400">Abre una mesa para empezar a registrar pedidos en sitio.</p>
        </div>
      )}
    </div>
  );
}
