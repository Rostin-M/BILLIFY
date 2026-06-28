import { redirect } from "next/navigation";

import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { HydrateClient } from "~/trpc/server";
import { api } from "~/trpc/server";
import { MesasClient } from "./_components/MesasClient";
import { PageLayout } from "~/app/_components/PageLayout";

export default async function MesasPage() {
  const session = await auth();

  if (!session?.user) redirect("/auth/login");
  if (!session.user.businessId) redirect("/");

  const business = await db.business.findUnique({
    where: { id: session.user.businessId },
    select: { name: true, document: true, logoUrl: true },
  });

  void api.tableSession.listActive.prefetch();

  return (
    <HydrateClient>
      <main className="min-h-screen bg-slate-50 dark:bg-slate-950">
        <div className="mx-auto max-w-6xl px-4 py-6">
          <PageLayout title="Mesas" subtitle="Gestión de consumo en sitio por mesa" />
          <MesasClient business={{ name: business?.name ?? "", document: business?.document ?? "", logoUrl: business?.logoUrl ?? null }} />
        </div>
      </main>
    </HydrateClient>
  );
}
