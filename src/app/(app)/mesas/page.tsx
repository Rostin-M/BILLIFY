import Link from "next/link";
import { redirect } from "next/navigation";

import { requirePageUser } from "~/server/auth/requirePageUser";
import { db } from "~/server/db";
import { api, HydrateClient } from "~/trpc/server";
import { MesasClient } from "./_components/MesasClient";
import { MesasReadOnly } from "./_components/MesasReadOnly";
import { requireSubscription } from "~/server/subscription/service";
import { PageLayout } from "~/app/_components/PageLayout";
import { resolveInvoiceContact } from "~/lib/invoiceContact";

export default async function MesasPage() {
  const user = await requirePageUser();
  if (!user.businessId) redirect("/");

  const [business, owner, subscription, activeRegister] = await Promise.all([
    db.business.findUnique({
      where: { id: user.businessId },
      select: {
        name: true,
        document: true,
        logoUrl: true,
        address: true,
        phone: true,
        email: true,
        invoicePhoneSource: true,
        invoiceEmailSource: true,
        invoiceTaxDetail: true,
      },
    }),
    // Contacto de la factura: igual que en Ventas, según la fuente configurada.
    db.user.findFirst({
      where: { businessId: user.businessId, role: "OWNER" },
      select: { phone: true, email: true },
    }),
    requireSubscription(db, user.businessId),
    db.cashRegister.findFirst({
      where: { businessId: user.businessId, status: "OPEN" },
      select: { id: true },
    }),
  ]);
  const businessInfo = {
    name: business?.name ?? "",
    document: business?.document ?? "",
    logoUrl: business?.logoUrl ?? null,
  };
  const invoiceBusiness = {
    ...businessInfo,
    address: business?.address ?? null,
    phone: resolveInvoiceContact(business?.invoicePhoneSource ?? "NONE", owner?.phone ?? null, business?.phone ?? null),
    email: resolveInvoiceContact(business?.invoiceEmailSource ?? "NONE", owner?.email ?? null, business?.email ?? null),
    invoiceTaxDetail: business?.invoiceTaxDetail ?? "SUMMARY",
  };

  // Se espera la precarga: así el HTML del servidor ya trae los datos y coincide con el del
  // cliente (con `void`, a veces llegaban antes de hidratar y React marcaba error de hidratación).
  await api.tableSession.listActive.prefetch();

  return (
    <HydrateClient>
      <main className="min-h-screen bg-slate-50 dark:bg-slate-950">
        <div className="mx-auto max-w-6xl px-4 py-6">
          <PageLayout title="Mesas" subtitle="Gestión de consumo en sitio por mesa" />
          {subscription.access.mode === "READ_ONLY" ? (
            <MesasReadOnly
              business={businessInfo}
              invoiceBusiness={invoiceBusiness}
              isOwner={user.role === "OWNER"}
              plan={subscription.billing.plan}
            />
          ) : (
            <>
              {/* Aviso antes de intentar (antes el error salía solo al tocar "Abrir mesa"). */}
              {!activeRegister && (
                <div
                  role="status"
                  className="mb-4 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 sm:flex-row sm:items-center sm:justify-between dark:border-amber-500/30 dark:bg-amber-900/20 dark:text-amber-200"
                >
                  <p>
                    <strong className="font-semibold">La caja está cerrada.</strong> Ábrela para poder abrir mesas y
                    cobrar.
                  </p>
                  <Link
                    href="/caja"
                    className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl bg-amber-600 px-4 text-sm font-semibold text-white hover:bg-amber-700"
                  >
                    Ir a caja y abrir
                  </Link>
                </div>
              )}
              <MesasClient business={businessInfo} invoiceBusiness={invoiceBusiness} />
            </>
          )}
        </div>
      </main>
    </HydrateClient>
  );
}
