"use client";

import { useState } from "react";
import { toast } from "sonner";

import { formatDate } from "~/lib/subscription/notices";
import { api, type RouterOutputs } from "~/trpc/react";

type Status = RouterOutputs["billing"]["status"];

/**
 * Cancelar (con confirmación en la misma tarjeta) o reactivar la renovación.
 * Solo tiene sentido con un período pagado vigente: en la prueba no hay nada que
 * cancelar, y en gracia cancelar dejaría la cuenta en solo lectura al instante.
 */
export function CancelControl({ status }: Readonly<{ status: Status }>) {
  const [confirming, setConfirming] = useState(false);
  const utils = api.useUtils();

  const onDone = (data: { message: string }) => {
    toast.success(data.message);
    setConfirming(false);
    void utils.billing.status.invalidate();
  };
  const cancel = api.billing.cancel.useMutation({ onSuccess: onDone, onError: (e) => toast.error(e.message) });
  const resume = api.billing.resume.useMutation({ onSuccess: onDone, onError: (e) => toast.error(e.message) });

  if (status.phase === "CANCELED") {
    return (
      <div className="mt-5 border-t border-slate-100 pt-4 dark:border-white/10">
        <button
          type="button"
          onClick={() => resume.mutate()}
          disabled={resume.isPending}
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:opacity-50"
        >
          {resume.isPending ? "Reactivando..." : "Reactivar la renovación"}
        </button>
      </div>
    );
  }

  if (status.phase !== "ACTIVE") return null;

  const endDate = status.endsAt ? formatDate(status.endsAt) : "la fecha de vencimiento";

  return (
    <div className="mt-5 border-t border-slate-100 pt-4 dark:border-white/10">
      {confirming ? (
        <div role="alertdialog" aria-labelledby="cancel-title" className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-500/30 dark:bg-red-900/20">
          <p id="cancel-title" className="text-sm font-semibold text-red-800 dark:text-red-200">
            ¿Cancelar la renovación?
          </p>
          <p className="mt-1 text-sm text-red-700 dark:text-red-300">
            No te volveremos a cobrar. Sigues con acceso completo hasta el {endDate}; después la cuenta pasa directo a
            solo lectura, sin días de gracia. Tus datos no se borran.
          </p>
          <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={cancel.isPending}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/15 dark:bg-transparent dark:text-slate-200 dark:hover:bg-white/10"
            >
              No, mantener mi plan
            </button>
            <button
              type="button"
              onClick={() => cancel.mutate()}
              disabled={cancel.isPending}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
            >
              {cancel.isPending ? "Cancelando..." : "Sí, cancelar la renovación"}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="text-sm font-medium text-slate-500 underline underline-offset-2 transition hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400"
        >
          Cancelar la renovación
        </button>
      )}
    </div>
  );
}
