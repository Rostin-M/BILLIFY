import { redirect } from "next/navigation";

import { auth } from "~/server/auth";
import { api, HydrateClient } from "~/trpc/server";
import { FiadosClient } from "./_components/FiadosClient";
import { PageLayout } from "~/app/_components/PageLayout";

export default async function FiadosPage() {
  const session = await auth();

  if (!session?.user) redirect("/auth/login");
  if (session.user.role !== "OWNER" && session.user.role !== "CASHIER") redirect("/");

  void api.customer.listDebtors.prefetch();

  return (
    <HydrateClient>
      <main className="min-h-screen bg-slate-50 dark:bg-slate-950">
        <div className="mx-auto max-w-3xl px-4 py-6">
          <PageLayout title="Fiados" subtitle="Clientes con deudas pendientes por venta a crédito" />
          <FiadosClient />
        </div>
      </main>
    </HydrateClient>
  );
}
