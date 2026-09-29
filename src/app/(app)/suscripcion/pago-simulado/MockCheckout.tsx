"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FlaskConical } from "lucide-react";
import { toast } from "sonner";

import { CYCLE_LABELS, getPlan } from "~/lib/subscription/catalog";
import { formatCents } from "~/app/_components/subscription/labels";
import { api } from "~/trpc/react";

const REFERENCE_RE = /^BLF-[A-Z0-9-]{6,60}$/;

const cardClass =
  "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5";

function Message({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className={cardClass}>
      <p className="text-sm text-slate-600 dark:text-slate-300">{children}</p>
      <Link href="/suscripcion" className="mt-4 inline-block text-sm font-semibold text-violet-600 dark:text-violet-400">
        Volver a Suscripción
      </Link>
    </div>
  );
}

export function MockCheckout({ reference }: Readonly<{ reference: string | null }>) {
  const router = useRouter();
  const utils = api.useUtils();
  const validRef = reference !== null && REFERENCE_RE.test(reference);

  const { data: status, isPending: loadingStatus } = api.billing.status.useQuery();
  const enabled = validRef && status?.mockPayments === true;
  const payment = api.billing.paymentByReference.useQuery(
    { reference: reference ?? "" },
    { enabled, retry: false },
  );

  const simulate = api.billing.simulatePayment.useMutation({
    onSuccess: async (data) => {
      await utils.billing.invalidate();
      router.push(`/suscripcion/resultado?ref=${encodeURIComponent(data.reference)}`);
    },
    onError: (e) => toast.error(e.message),
  });

  if (!validRef) return <Message>Falta la referencia del pago o no es válida.</Message>;
  if (loadingStatus) return <p className="text-sm text-slate-500">Cargando...</p>;
  if (!status?.mockPayments) {
    return <Message>Los pagos simulados no están disponibles. Paga desde la pantalla de Suscripción.</Message>;
  }
  if (payment.isPending) return <p className="text-sm text-slate-500">Cargando el pago...</p>;
  if (!payment.data) return <Message>{payment.error?.message ?? "No encontramos ese pago."}</Message>;

  const p = payment.data;
  const busy = simulate.isPending || simulate.isSuccess;

  if (p.status !== "PENDING") {
    return (
      <Message>
        Este pago ya no está pendiente.{" "}
        <Link
          href={`/suscripcion/resultado?ref=${encodeURIComponent(p.reference)}`}
          className="font-semibold text-violet-600 underline underline-offset-2 dark:text-violet-400"
        >
          Ver el resultado
        </Link>
      </Message>
    );
  }

  return (
    <div className={cardClass}>
      <p className="flex items-center gap-2 text-xs font-medium text-amber-700 dark:text-amber-300">
        <FlaskConical className="h-4 w-4" aria-hidden /> Modo de pruebas
      </p>
      <dl className="mt-4 space-y-3 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500 dark:text-slate-400">Plan</dt>
          <dd className="text-right font-medium text-slate-800 dark:text-slate-100">
            {getPlan(p.plan).name} {CYCLE_LABELS[p.billingCycle].toLowerCase()}
            {p.kind === "UPGRADE" && " (resto del período)"}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500 dark:text-slate-400">Referencia</dt>
          <dd className="break-all text-right font-mono text-xs text-slate-700 dark:text-slate-300">{p.reference}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 border-t border-slate-100 pt-3 dark:border-white/10">
          <dt className="text-slate-500 dark:text-slate-400">Total</dt>
          <dd className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{formatCents(p.amountInCents)}</dd>
        </div>
      </dl>

      <div className="mt-6 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => simulate.mutate({ reference: p.reference, outcome: "DECLINED" })}
          className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/10"
        >
          Rechazar
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => simulate.mutate({ reference: p.reference, outcome: "APPROVED" })}
          className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
        >
          {busy ? "Procesando..." : "Aprobar pago"}
        </button>
      </div>
    </div>
  );
}
