import { requirePageUser } from "~/server/auth/requirePageUser";
import { api, HydrateClient } from "~/trpc/server";
import { CustomerManager } from "./_components/CustomerManager";
import { PageLayout } from "~/app/_components/PageLayout";

export default async function ClientesPage() {
  await requirePageUser({ roles: ["OWNER"] });

  void api.customer.list.prefetch();

  return (
    <HydrateClient>
      <main className="min-h-screen bg-slate-50 dark:bg-slate-950">
        <div className="mx-auto max-w-3xl px-4 py-6">
          <PageLayout title="Clientes" subtitle="Registros e historial de compras" />
          <CustomerManager />
        </div>
      </main>
    </HydrateClient>
  );
}
