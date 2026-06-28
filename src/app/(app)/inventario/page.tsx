import { redirect } from "next/navigation";

import { auth } from "~/server/auth";
import { api, HydrateClient } from "~/trpc/server";
import { InventarioView } from "./_components/InventarioView";
import { PageLayout } from "~/app/_components/PageLayout";

export const metadata = { title: "Inventario — BILLIFY" };

export default async function InventarioPage() {
  const session = await auth();

  if (!session?.user) redirect("/auth/login");

  void api.product.search.prefetch();

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
