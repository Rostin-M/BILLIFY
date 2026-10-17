/**
 * Carga entre páginas de la app: se muestra dentro del shell (el menú sigue visible y
 * la sección tocada queda marcada) en lugar de tapar toda la pantalla.
 */
export default function AppLoading() {
  return (
    <main className="min-h-[calc(100dvh-3.5rem)] bg-slate-50 dark:bg-slate-950">
      <div role="status" aria-label="Cargando la página" className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        <div className="animate-pulse space-y-2">
          <div className="h-7 w-48 rounded-lg bg-slate-200 dark:bg-white/10" />
          <div className="h-4 w-72 max-w-full rounded-md bg-slate-200 dark:bg-white/10" />
        </div>
        <div className="grid animate-pulse gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {["a", "b", "c"].map((k) => (
            <div key={k} className="h-28 rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/5" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/5" />
        <p className="text-sm text-slate-500 dark:text-slate-400">Cargando…</p>
      </div>
    </main>
  );
}
