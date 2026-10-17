"use client";

import { Armchair, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { api, type RouterOutputs } from "~/trpc/react";
import type { BusinessInfoForPdf } from "~/lib/pdf/FacturaPDF";
import { MesaInvoicesModal } from "./MesaInvoicesModal";
import { TableCard } from "./TableCard";

type SessionData = RouterOutputs["tableSession"]["listActive"][number];

type Business = { name: string; document: string; logoUrl?: string | null };
type Props = { business: Business; invoiceBusiness: BusinessInfoForPdf };

export function MesasClient({ business, invoiceBusiness }: Readonly<Props>) {
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  // Accordion: only one table expanded at a time, to keep the mobile view compact.
  const [expandedTableId, setExpandedTableId] = useState<string | null>(null);
  const [guestSearch, setGuestSearch] = useState("");
  const [invoiceSaleIds, setInvoiceSaleIds] = useState<string[] | null>(null);

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

  const utils = api.useUtils();
  const createSession = api.tableSession.create.useMutation({
    onSuccess: async () => {
      await utils.tableSession.listActive.invalidate();
      await utils.tableSession.suggestName.invalidate();
      setShowCreate(false);
      setNewName("");
    },
  });

  function handleCreate(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = newName.trim() || suggestedName;
    createSession.mutate({ name });
  }

  function openCreate() {
    setNewName(suggestedName);
    setShowCreate(true);
  }

  if (isLoading) {
    return <p className="text-center text-sm text-slate-500 dark:text-slate-400 py-10">Cargando mesas...</p>;
  }

  const tablePlural = sessions.length !== 1 ? "s" : "";
  const sessionsLabel = sessions.length === 0
    ? "No hay mesas abiertas"
    : `${sessions.length} mesa${tablePlural} abierta${tablePlural}`;

  return (
    <div className="space-y-4">
      {invoiceSaleIds && (
        <MesaInvoicesModal
          saleIds={invoiceSaleIds}
          business={invoiceBusiness}
          onClose={() => setInvoiceSaleIds(null)}
        />
      )}
      {/* Nueva mesa */}
      {showCreate ? (
        <form onSubmit={handleCreate} className="flex flex-col gap-2 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 dark:border-violet-500/30 dark:bg-violet-900/10 sm:flex-row sm:items-center">
          <input
            aria-label="Nombre de la mesa"
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nombre de la mesa..."
            className="min-h-11 flex-1 rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none ring-violet-400 focus:ring-2 dark:border-white/15 dark:bg-slate-800 dark:text-white"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={createSession.isPending}
              aria-busy={createSession.isPending}
              className="min-h-11 flex-1 rounded-xl bg-violet-600 px-4 text-sm font-bold text-white transition hover:bg-violet-700 disabled:opacity-50 sm:flex-none"
            >
              {createSession.isPending ? "Abriendo..." : "Abrir mesa"}
            </button>
            <button type="button" onClick={() => setShowCreate(false)} className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm text-slate-500 hover:bg-white dark:border-white/10">
              Cancelar
            </button>
          </div>
          {createSession.error && (
            <p className="text-xs text-red-500">{createSession.error.message}</p>
          )}
        </form>
      ) : (
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {sessionsLabel}
          </p>
          <button
            onClick={openCreate}
            className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-violet-700"
          >
            + Nueva mesa
          </button>
        </div>
      )}

      {/* Buscar cliente por nombre/apodo */}
      {sessions.length > 0 && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            aria-label="Buscar cliente por nombre o apodo"
            type="search"
            value={guestSearch}
            onChange={(e) => setGuestSearch(e.target.value)}
            placeholder="Buscar cliente por nombre o apodo..."
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500 dark:border-white/10 dark:bg-white/5 dark:text-white dark:focus:border-violet-500 dark:focus:ring-violet-400"
          />
        </div>
      )}

      {/* El listado se refresca cada 5 s: si falla, se dice (antes quedaba desactualizado sin aviso). */}
      {refreshFailed && (
        <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-900/20 dark:text-amber-200">
          No se pudieron actualizar las mesas. Revisa la conexión; se reintentará solo.
        </p>
      )}

      {/* Lista de mesas */}
      <div className="grid gap-4 xl:grid-cols-2">
        {filteredSessions.map((session: SessionData) => (
          <TableCard
            key={session.id}
            session={session}
            business={business}
            expanded={expandedTableId === session.id}
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
