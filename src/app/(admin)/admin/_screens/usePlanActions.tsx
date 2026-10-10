"use client";

import { type ReactNode, useState } from "react";
import { toast } from "sonner";

import {
  type GrantPlanInput,
  type PlatformBusinessRow,
  type PlatformPaymentRow,
} from "~/lib/platform/contract";
import { getPlan } from "~/lib/subscription/catalog";

import { Dialog } from "../_components/Dialog";
import { ExtendTrialDialog } from "../_components/ExtendTrialDialog";
import { GrantPlanSheet } from "../_components/GrantPlanSheet";
import { ResolveReviewDialog } from "../_components/ResolveReviewDialog";
import { RevokeGrantDialog } from "../_components/RevokeGrantDialog";
import { buttonClass, ErrorState } from "../_components/ui";
import {
  useBusiness,
  useExtendTrial,
  useGrantPlan,
  useResolvePaymentReview,
  useRevokeGrant,
} from "../_data/platform";
import { formatDate } from "../_lib/format";

type OpenDialog =
  | { kind: "grant"; business: PlatformBusinessRow }
  | { kind: "trial"; business: PlatformBusinessRow; trialEndsAt: Date | null }
  | { kind: "revoke"; payment: PlatformPaymentRow; ownerEmail: string | null }
  | { kind: "review"; payment: PlatformPaymentRow };

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Ocurrió un error inesperado. Inténtalo de nuevo.";
}

/**
 * "Activar plan" abierto desde cualquier fila: la vista previa necesita las
 * fechas de la suscripción, que solo trae el detalle del negocio. Se pide aquí
 * (sale de la caché si ya se estaba viendo ese negocio) y mientras llega el
 * panel se muestra cargando.
 */
function GrantPlanFlow({
  business,
  onSubmit,
  onClose,
  isSubmitting,
  submitError,
}: Readonly<{
  business: PlatformBusinessRow;
  onSubmit: (input: GrantPlanInput) => void;
  onClose: () => void;
  isSubmitting: boolean;
  submitError: string | null;
}>) {
  const detail = useBusiness(business.id);

  if (detail.data) {
    return (
      <GrantPlanSheet
        business={detail.data}
        onSubmit={onSubmit}
        onClose={onClose}
        isSubmitting={isSubmitting}
        submitError={submitError}
      />
    );
  }

  return (
    <Dialog
      variant="sheet"
      title="Activar plan"
      subtitle={<span className="line-clamp-2 font-medium text-slate-800 dark:text-slate-200">{business.name}</span>}
      onClose={onClose}
      onSubmit={() => undefined}
      footer={
        <div className="flex justify-end">
          <button type="button" onClick={onClose} className={buttonClass.secondary}>
            Cancelar
          </button>
        </div>
      }
    >
      {detail.error ? (
        <ErrorState compact message={detail.error} onRetry={detail.refetch} />
      ) : (
        <div role="status" aria-label="Cargando los datos del negocio" className="animate-pulse space-y-6 motion-reduce:animate-none">
          <div className="h-16 rounded-xl bg-slate-200 dark:bg-white/10" />
          <div className="grid grid-cols-3 gap-2">
            <div className="h-20 rounded-xl bg-slate-200 dark:bg-white/10" />
            <div className="h-20 rounded-xl bg-slate-200 dark:bg-white/10" />
            <div className="h-20 rounded-xl bg-slate-200 dark:bg-white/10" />
          </div>
          <div className="h-10 rounded-lg bg-slate-200 dark:bg-white/10" />
          <div className="h-28 rounded-xl bg-slate-200 dark:bg-white/10" />
        </div>
      )}
    </Dialog>
  );
}

/**
 * Las acciones del administrador sobre un negocio, listas para cualquier
 * pantalla: abre el diálogo, ejecuta la acción, muestra el toast y cierra.
 * La pantalla solo llama `activate(...)` y pinta `dialogs`.
 *
 * Si la acción falla, el diálogo queda abierto con el error y lo escrito intacto.
 */
export function usePlanActions(): {
  activate: (business: PlatformBusinessRow) => void;
  extendTrial: (business: PlatformBusinessRow, trialEndsAt: Date | null) => void;
  revoke: (payment: PlatformPaymentRow, ownerEmail: string | null) => void;
  resolveReview: (payment: PlatformPaymentRow) => void;
  dialogs: ReactNode;
} {
  const [open, setOpen] = useState<OpenDialog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const grant = useGrantPlan();
  const trial = useExtendTrial();
  const revokeGrant = useRevokeGrant();
  const review = useResolvePaymentReview();

  const show = (dialog: OpenDialog) => {
    setError(null);
    setOpen(dialog);
  };
  const close = () => setOpen(null);
  const fail = (e: unknown) => setError(messageOf(e));

  let dialogs: ReactNode = null;

  if (open?.kind === "grant") {
    const { business } = open;
    dialogs = (
      <GrantPlanFlow
        business={business}
        isSubmitting={grant.isPending}
        submitError={error}
        onClose={close}
        onSubmit={(input) => {
          setError(null);
          grant.run(input).then((result) => {
            close();
            const plan = getPlan(input.plan).name;
            const until = result.periodEnd ? ` hasta el ${formatDate(result.periodEnd)}` : "";
            // El plan mostrado es el que quedó vigente; si el cambio quedó programado, se dice.
            const current = getPlan(result.subscription.plan).name;
            const what =
              current === plan
                ? `${business.name} tiene ${plan}${until}.`
                : `${business.name} sigue en ${current} y pasa a ${plan} el ${
                    result.periodStart ? formatDate(result.periodStart) : "día programado"
                  }; queda con acceso${until}.`;
            if (input.notifyOwner && !result.ownerNotified) {
              toast.warning("Plan activado, pero el correo no salió", {
                description: `${what} Avísale tú al dueño.`,
                duration: 10_000,
              });
            } else {
              toast.success("Plan activado", {
                description: result.ownerNotified ? `${what} Se le avisó al dueño por correo.` : what,
              });
            }
          }, fail);
        }}
      />
    );
  }

  if (open?.kind === "trial") {
    const { business, trialEndsAt } = open;
    dialogs = (
      <ExtendTrialDialog
        business={business}
        trialEndsAt={trialEndsAt}
        isSubmitting={trial.isPending}
        submitError={error}
        onClose={close}
        onSubmit={(input) => {
          setError(null);
          trial.run(input).then((result) => {
            close();
            const endsAt = result.subscription.endsAt ?? result.periodEnd;
            toast.success("Prueba extendida", {
              description: endsAt ? `${business.name} sigue en prueba hasta el ${formatDate(endsAt)}.` : undefined,
            });
          }, fail);
        }}
      />
    );
  }

  if (open?.kind === "revoke") {
    const { payment, ownerEmail } = open;
    dialogs = (
      <RevokeGrantDialog
        payment={payment}
        ownerEmail={ownerEmail}
        isSubmitting={revokeGrant.isPending}
        submitError={error}
        onClose={close}
        onSubmit={(input) => {
          setError(null);
          revokeGrant.run(input).then((result) => {
            close();
            const sub = result.subscription;
            const what =
              sub.phase === "READ_ONLY" || !sub.endsAt
                ? `${payment.businessName} quedó en solo lectura.`
                : `${payment.businessName} queda en ${getPlan(sub.plan).name} hasta el ${formatDate(sub.endsAt)}.`;
            if (input.notifyOwner && !result.ownerNotified) {
              toast.warning("Activación revocada, pero el correo no salió", {
                description: `${what} Avísale tú al dueño.`,
                duration: 10_000,
              });
            } else {
              toast.success("Activación revocada", {
                description: result.ownerNotified ? `${what} Se le avisó al dueño por correo.` : what,
              });
            }
          }, fail);
        }}
      />
    );
  }

  if (open?.kind === "review") {
    const { payment } = open;
    dialogs = (
      <ResolveReviewDialog
        payment={payment}
        isSubmitting={review.isPending}
        submitError={error}
        onClose={close}
        onSubmit={(input) => {
          setError(null);
          review.run(input).then(() => {
            close();
            toast.success("Pago marcado como revisado", {
              description: `El pago de ${payment.businessName} salió de la lista de pendientes.`,
            });
          }, fail);
        }}
      />
    );
  }

  return {
    activate: (business) => show({ kind: "grant", business }),
    extendTrial: (business, trialEndsAt) => show({ kind: "trial", business, trialEndsAt }),
    revoke: (payment, ownerEmail) => show({ kind: "revoke", payment, ownerEmail }),
    resolveReview: (payment) => show({ kind: "review", payment }),
    dialogs,
  };
}
