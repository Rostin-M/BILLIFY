import { requirePageUser } from "~/server/auth/requirePageUser";
import { api, HydrateClient } from "~/trpc/server";
import { FiadosClient } from "./_components/FiadosClient";
import { PageLayout } from "~/app/_components/PageLayout";

export default async function FiadosPage() {
  await requirePageUser({ roles: ["OWNER", "CASHIER"] });

  // Con `await` (no `void`) el HTML del servidor ya trae los datos y no hay error de hidratación.
  await api.customer.listDebtors.prefetch();

  return (
    <HydrateClient>
      <main className="min-h-screen bg-slate-50 dark:bg-slate-950">
        <div className="mx-auto max-w-3xl px-4 py-6">
          <PageLayout title="Fiados" subtitle="Clientes que te deben por ventas fiadas" />
          <FiadosClient />
        </div>
      </main>
    </HydrateClient>
  );
}
