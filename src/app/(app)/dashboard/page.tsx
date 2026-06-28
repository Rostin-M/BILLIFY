import { redirect } from "next/navigation";

import { auth } from "~/server/auth";
import { HydrateClient } from "~/trpc/server";
import { api } from "~/trpc/server";
import { DashboardClient } from "./_components/DashboardClient";
import { PageLayout } from "~/app/_components/PageLayout";

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user) redirect("/auth/login");
  if (!session.user.businessId) redirect("/");
  if (session.user.role !== "OWNER") redirect("/");

  void api.dashboard.summary.prefetch({ period: "today" });

  return (
    <HydrateClient>
      <main className="min-h-screen bg-slate-50 dark:bg-slate-950">
        <div className="mx-auto max-w-4xl space-y-6 px-4 py-6">
          <PageLayout title="Dashboard" subtitle="Resumen de ventas e indicadores del negocio" />
          <DashboardClient />
        </div>
      </main>
    </HydrateClient>
  );
}
