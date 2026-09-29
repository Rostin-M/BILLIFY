import { requirePageUser } from "~/server/auth/requirePageUser";
import { PageLayout } from "~/app/_components/PageLayout";
import { MockCheckout } from "./MockCheckout";

export const metadata = { title: "Pago simulado — BILLIFY" };

export default async function PagoSimuladoPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ ref?: string | string[] }> }>) {
  await requirePageUser({ roles: ["OWNER"], fallback: "/suscripcion" });
  const { ref } = await searchParams;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 dark:bg-slate-950 dark:text-white">
      <div className="mx-auto max-w-md">
        <PageLayout title="Pago simulado" subtitle="Pasarela de pruebas: aquí no se cobra dinero real." />
        <MockCheckout reference={typeof ref === "string" ? ref : null} />
      </div>
    </main>
  );
}
