import { requirePageUser } from "~/server/auth/requirePageUser";
import { api, HydrateClient } from "~/trpc/server";
import { ProductManager } from "./_components/ProductManager";
import { PageLayout } from "~/app/_components/PageLayout";

export const metadata = { title: "Catálogo — BILLIFY" };

export default async function ProductosPage() {
  const user = await requirePageUser();

  // Se espera la precarga: así el HTML del servidor ya trae los datos y coincide con el del
  // cliente (con `void`, a veces llegaban antes de hidratar y React marcaba error de hidratación).
  await api.product.list.prefetch();

  const isOwner = user.role === "OWNER";

  return (
    <HydrateClient>
      <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 dark:bg-slate-950 dark:text-white">
        <div className="mx-auto max-w-3xl lg:max-w-5xl">
          <PageLayout
            title="Catálogo de productos"
            subtitle={
              isOwner
                ? "Administra los productos disponibles para la venta."
                : "Consulta el catálogo y actualiza precios o stock."
            }
          />
          <ProductManager userRole={user.role} />
        </div>
      </main>
    </HydrateClient>
  );
}
