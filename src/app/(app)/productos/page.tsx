import { redirect } from "next/navigation";

import { auth } from "~/server/auth";
import { api, HydrateClient } from "~/trpc/server";
import { ProductManager } from "./_components/ProductManager";
import { PageLayout } from "~/app/_components/PageLayout";

export const metadata = { title: "Catálogo — BILLIFY" };

export default async function ProductosPage() {
  const session = await auth();

  if (!session?.user) redirect("/auth/login");

  void api.product.list.prefetch();

  const isOwner = session.user.role === "OWNER";

  return (
    <HydrateClient>
      <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 dark:bg-slate-950 dark:text-white">
        <div className="mx-auto max-w-3xl">
          <PageLayout
            title="Catálogo de productos"
            subtitle={
              isOwner
                ? "Administra los productos disponibles para la venta."
                : "Consulta el catálogo y actualiza precios o stock."
            }
          />
          <ProductManager userRole={session.user.role} />
        </div>
      </main>
    </HydrateClient>
  );
}
