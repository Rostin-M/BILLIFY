import { requirePageUser } from "~/server/auth/requirePageUser";
import { api, HydrateClient } from "~/trpc/server";
import { InventarioView } from "./_components/InventarioView";
import { PageLayout } from "~/app/_components/PageLayout";

export const metadata = { title: "Inventario — BILLIFY" };

export default async function InventarioPage() {
  await requirePageUser();

  // Se espera la precarga: así el HTML del servidor ya trae los datos y coincide con el del
  // cliente (con `void`, a veces llegaban antes de hidratar y React marcaba error de hidratación).
  await api.product.search.prefetch();

  return (
    <HydrateClient>
      <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 dark:bg-slate-950 dark:text-white">
        <div className="mx-auto max-w-3xl">
          <PageLayout
            title="Inventario disponible"
            subtitle="Consulta el stock y disponibilidad de los productos activos."
          />
          <InventarioView />
        </div>
      </main>
    </HydrateClient>
  );
}
