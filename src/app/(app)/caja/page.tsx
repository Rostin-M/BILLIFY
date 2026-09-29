import { redirect } from "next/navigation";

import { requirePageUser } from "~/server/auth/requirePageUser";
import { db } from "~/server/db";
import { api, HydrateClient } from "~/trpc/server";
import { CashRegisterView } from "./_components/CashRegisterView";
import { CashHistory } from "./_components/CashHistory";
import { PageLayout } from "~/app/_components/PageLayout";

export default async function CajaPage() {
  const user = await requirePageUser();
  if (!user.businessId) redirect("/");

  const isOwner = user.role === "OWNER";

  const [business] = await Promise.all([
    db.business.findUnique({
      where: { id: user.businessId },
      select: { name: true, document: true, logoUrl: true },
    }),
  ]);

  void api.cashRegister.getActive.prefetch();
  if (isOwner) void api.cashRegister.listHistory.prefetch();

  const businessInfo = {
    name: business?.name ?? "",
    document: business?.document ?? "",
    logoUrl: business?.logoUrl ?? null,
  };

  return (
    <HydrateClient>
      <main className="min-h-screen bg-slate-50 dark:bg-slate-950">
        <div className="mx-auto max-w-2xl space-y-6 px-4 py-6">
          <PageLayout title="Caja" subtitle="Apertura, cierre y movimientos de caja" />
          <CashRegisterView isOwner={isOwner} business={businessInfo} />
          {isOwner && <CashHistory business={businessInfo} />}
        </div>
      </main>
    </HydrateClient>
  );
}
