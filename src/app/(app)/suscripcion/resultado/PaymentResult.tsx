"use client";

import Link from "next/link";
import { CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { CYCLE_LABELS, getPlan } from "~/lib/subscription/catalog";
import { formatDate } from "~/lib/subscription/notices";
import { formatCents } from "~/app/_components/subscription/labels";
import { api, type RouterOutputs } from "~/trpc/react";

type Payment = RouterOutputs["billing"]["paymentByReference"];

/** Mientras el pago siga pendiente se vuelve a consultar, hasta este tiempo. */
const POLL_MS = 5_000;
const POLL_LIMIT_MS = 60_000;

const REFERENCE_RE = /^BLF-[A-Z0-9-]{6,60}$/;

export function PaymentResult({
  transactionId,
  reference,
}: Readonly<{ transactionId: string | null; reference: string | null }>) {
  if (transactionId) return <WompiReturn transactionId={transactionId} />;
  if (reference && REFERENCE_RE.test(reference)) return <ByReference reference={reference} />;
  return (
    <Shell>
      <p className="text-sm text-slate-600 dark:text-slate-300">No encontramos a qué pago te refieres.</p>
      <BackLinks approved={false} />
    </Shell>
  );
}

/**
 * Vuelta desde Wompi (?id=<transacción>): el servidor consulta el estado real en
 * Wompi y lo aplica. Si sigue pendiente (PSE puede tardar), se reintenta.
 */
function WompiReturn({ transactionId }: Readonly<{ transactionId: string }>) {
  const utils = api.useUtils();
  const [payment, setPayment] = useState<Payment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gaveUp, setGaveUp] = useState(false);
  const startedAt = useRef<number | null>(null);
  // Una sola secuencia de consultas por transacción (también con el doble montaje
  // de React en desarrollo): `started` evita repetirla y `alive` corta los reintentos
  // si se sale de la página.
  const started = useRef<string | null>(null);
  const alive = useRef(true);
  const confirm = api.billing.confirmReturn.useMutation();

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (started.current === transactionId) return;
    started.current = transactionId;
    startedAt.current = Date.now();

    async function run() {
      try {
        const result = await confirm.mutateAsync({ transactionId });
        setPayment(result);
        if (result.status !== "PENDING") {
          void utils.billing.invalidate();
        } else if (Date.now() - startedAt.current! < POLL_LIMIT_MS) {
          setTimeout(() => {
            if (alive.current) void run();
          }, POLL_MS);
        } else {
          setGaveUp(true);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "No pudimos confirmar el pago.");
      }
    }
    void run();
    // `confirm` y `utils` no cambian entre renders en la práctica.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactionId]);

  if (error) {
    return (
      <Shell>
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        <BackLinks approved={false} />
      </Shell>
    );
  }
  if (!payment) return <Checking />;
  return <ResultView payment={payment} gaveUp={gaveUp} />;
}

/** Pasarela simulada (?ref=...): se lee el pago de la base de datos. */
function ByReference({ reference }: Readonly<{ reference: string }>) {
  const utils = api.useUtils();
  const [startedAt] = useState(() => Date.now());
  const [gaveUp, setGaveUp] = useState(false);

  const { data: payment, error } = api.billing.paymentByReference.useQuery(
    { reference },
    {
      retry: false,
      refetchInterval: (query) => {
        if (query.state.data?.status !== "PENDING") return false;
        return Date.now() - startedAt < POLL_LIMIT_MS ? POLL_MS : false;
      },
    },
  );

  const status = payment?.status;
  useEffect(() => {
    if (!status) return;
    if (status !== "PENDING") {
      void utils.billing.status.invalidate();
      void utils.billing.payments.invalidate();
      return;
    }
    const t = setTimeout(() => setGaveUp(true), Math.max(0, POLL_LIMIT_MS - (Date.now() - startedAt)));
    return () => clearTimeout(t);
  }, [status, startedAt, utils]);

  if (error) {
    return (
      <Shell>
        <p className="text-sm text-red-600 dark:text-red-400">{error.message}</p>
        <BackLinks approved={false} />
      </Shell>
    );
  }
  if (!payment) return <Checking />;
  return <ResultView payment={payment} gaveUp={gaveUp} />;
}

function ResultView({ payment, gaveUp }: Readonly<{ payment: Payment; gaveUp: boolean }>) {
  const planText = `${getPlan(payment.plan).name} ${CYCLE_LABELS[payment.billingCycle].toLowerCase()}`;

  if (payment.status === "APPROVED") {
    const startsLater = payment.periodStart && payment.periodStart.getTime() > Date.now() + 60_000;
    return (
      <Shell>
        <CheckCircle2 className="h-12 w-12 text-emerald-500" aria-hidden />
        <h2 className="mt-3 text-xl font-bold text-slate-900 dark:text-white">Pago aprobado</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Pagaste {formatCents(payment.amountInCents)} por el plan {planText}.
          {payment.kind === "UPGRADE" && " El cambio de plan ya está activo."}
          {payment.kind === "PERIOD" && payment.periodEnd && !startsLater &&
            ` Tu plan queda activo hasta el ${formatDate(payment.periodEnd)}.`}
          {payment.kind === "PERIOD" && startsLater && payment.periodStart &&
            ` El nuevo período empieza el ${formatDate(payment.periodStart)}.`}
        </p>
        <BackLinks approved />
      </Shell>
    );
  }

  if (payment.status === "PENDING") {
    return (
      <Shell>
        <Clock className="h-12 w-12 text-sky-500" aria-hidden />
        <h2 className="mt-3 text-xl font-bold text-slate-900 dark:text-white">Pago en proceso</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          {gaveUp
            ? "El banco todavía no confirma el pago. Te avisaremos por correo y tu plan se activará solo cuando se apruebe. Puedes cerrar esta página."
            : "Estamos esperando la confirmación del banco. Esto puede tardar unos segundos..."}
        </p>
        {!gaveUp && <Loader2 className="mt-3 h-5 w-5 animate-spin text-slate-400" aria-hidden />}
        <BackLinks approved={false} />
      </Shell>
    );
  }

  return (
    <Shell>
      <XCircle className="h-12 w-12 text-red-500" aria-hidden />
      <h2 className="mt-3 text-xl font-bold text-slate-900 dark:text-white">El pago no se completó</h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
        {payment.statusMessage ?? "La pasarela rechazó el pago."} No se hizo ningún cobro. Puedes intentarlo de nuevo.
      </p>
      <Link
        href="/suscripcion"
        className="mt-5 inline-block w-full rounded-xl bg-violet-600 px-6 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-violet-500"
      >
        Intentar de nuevo
      </Link>
    </Shell>
  );
}

function Checking() {
  return (
    <Shell>
      <Loader2 className="h-10 w-10 animate-spin text-violet-500" aria-hidden />
      <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">Confirmando tu pago...</p>
    </Shell>
  );
}

function Shell({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div
      aria-live="polite"
      className="flex flex-col items-center rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-white/10 dark:bg-white/5"
    >
      {children}
    </div>
  );
}

function BackLinks({ approved }: Readonly<{ approved: boolean }>) {
  return (
    <div className="mt-6 flex w-full flex-col gap-2">
      <Link
        href="/ventas"
        className={`rounded-xl px-6 py-2.5 text-center text-sm font-semibold transition ${
          approved
            ? "bg-violet-600 text-white hover:bg-violet-500"
            : "border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/10"
        }`}
      >
        Volver a vender
      </Link>
      <Link href="/suscripcion" className="text-sm font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400">
        Ver mi suscripción
      </Link>
    </div>
  );
}
