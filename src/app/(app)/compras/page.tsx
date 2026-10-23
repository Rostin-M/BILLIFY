import { requirePageUser } from "~/server/auth/requirePageUser";
import { api, HydrateClient } from "~/trpc/server";
import { PageLayout } from "~/app/_components/PageLayout";
import { ComprasClient } from "./_components/ComprasClient";

export default async function ComprasPage() {
  const user = await requirePageUser({ roles: ["OWNER", "CASHIER"] });

  // Con `await` (no `void`) el HTML del servidor ya trae los datos y no hay error de hidratación.
  await Promise.all([api.supplier.list.prefetch(), api.purchase.payablesSummary.prefetch()]);

  return (
    <HydrateClient>
      <main className="min-h-screen bg-slate-50 dark:bg-slate-950">
        <div className="mx-auto max-w-3xl px-4 py-6">
          <PageLayout title="Compras" subtitle="Pedidos que llegan de tus proveedores y lo que les debes" />
          <ComprasClient isOwner={user.role === "OWNER"} />
        </div>
      </main>
    </HydrateClient>
  );
}
