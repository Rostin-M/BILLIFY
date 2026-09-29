import { requirePageUser } from "~/server/auth/requirePageUser";
import { PageLayout } from "~/app/_components/PageLayout";
import { PaymentResult } from "./PaymentResult";

export const metadata = { title: "Resultado del pago — BILLIFY" };

export default async function ResultadoPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ id?: string | string[]; ref?: string | string[] }> }>) {
  await requirePageUser({ roles: ["OWNER"], fallback: "/suscripcion" });
  const { id, ref } = await searchParams;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 dark:bg-slate-950 dark:text-white">
      <div className="mx-auto max-w-md">
        <PageLayout title="Resultado del pago" />
        <PaymentResult
          transactionId={typeof id === "string" ? id : null}
          reference={typeof ref === "string" ? ref : null}
        />
      </div>
    </main>
  );
}
