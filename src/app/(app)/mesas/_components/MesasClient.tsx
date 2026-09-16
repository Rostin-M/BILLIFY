"use client";

import { useState } from "react";
import { api, type RouterOutputs } from "~/trpc/react";
import { TableCard } from "./TableCard";

type SessionData = RouterOutputs["tableSession"]["listActive"][number];

type Business = { name: string; document: string; logoUrl?: string | null };
type Props = { business: Business };

export function MesasClient({ business }: Readonly<Props>) {
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");

  const { data: sessions = [], isLoading } = api.tableSession.listActive.useQuery(undefined, {
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
  });
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

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim() || suggestedName;
    createSession.mutate({ name });
  }

  function openCreate() {
    setNewName(suggestedName);
    setShowCreate(true);
  }

  if (isLoading) {
    return <p className="text-center text-sm text-slate-400 dark:text-slate-500 py-10">Cargando mesas...</p>;
  }

  return (
    <div className="space-y-4">
      {/* Nueva mesa */}
      {showCreate ? (
        <form onSubmit={handleCreate} className="flex flex-col gap-2 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 dark:border-violet-500/30 dark:bg-violet-900/10 sm:flex-row sm:items-center">
          <input
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
              className="min-h-11 flex-1 rounded-xl bg-violet-600 px-4 text-sm font-bold text-white transition hover:bg-violet-500 disabled:opacity-50 sm:flex-none"
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
            {sessions.length === 0 ? "No hay mesas abiertas" : `${sessions.length} mesa${sessions.length !== 1 ? "s" : ""} abierta${sessions.length !== 1 ? "s" : ""}`}
          </p>
          <button
            onClick={openCreate}
            className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-violet-500"
          >
            + Nueva mesa
          </button>
        </div>
      )}

      {/* Lista de mesas */}
      <div className="grid gap-4 lg:grid-cols-2">
        {sessions.map((session: SessionData) => (
          <TableCard key={session.id} session={session} business={business} />
        ))}
      </div>

      {sessions.length === 0 && !showCreate && (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center dark:border-white/10 dark:bg-white/5">
          <p className="text-4xl mb-3">🪑</p>
          <p className="text-slate-500 dark:text-slate-400">Abre una mesa para empezar a registrar pedidos en sitio.</p>
        </div>
      )}
    </div>
  );
}
