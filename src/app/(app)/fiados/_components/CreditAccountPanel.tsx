"use client";

import { Download, FileSignature, Mail } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "~/trpc/react";
import { creditLimitLabel } from "~/lib/creditTerms";
import { formatCOP } from "~/lib/format/money";
import { OpenCreditAccountModal } from "./OpenCreditAccountModal";

const fmtDay = (d: Date | string) =>
  new Date(d).toLocaleDateString("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short", year: "numeric" });

function downloadBase64Pdf(base64: string, fileName: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.codePointAt(0) ?? 0);
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const smallButton =
  "inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5";

export function CreditAccountPanel({ customerId }: Readonly<{ customerId: string }>) {
  const { data: account } = api.customer.creditAccount.useQuery({ customerId });
  const [editing, setEditing] = useState(false);
  const [resendTo, setResendTo] = useState<string | null>(null);

  const pdf = api.customer.creditAgreementPdf.useMutation({
    onSuccess: (d) => downloadBase64Pdf(d.base64, d.fileName),
    onError: (e) => toast.error(e.message),
  });
  const resend = api.customer.resendCreditAgreement.useMutation({
    onSuccess: (d) => { toast.success(d.message); setResendTo(null); },
    onError: (e) => toast.error(e.message),
  });

  if (!account) return null;
  const latest = account.agreements[0];
  const available = account.creditLimit != null ? Math.max(account.creditLimit - Math.max(account.debt, 0), 0) : null;

  return (
    <div className="space-y-2 rounded-xl border border-violet-200 bg-violet-50/60 p-3 text-xs dark:border-violet-500/30 dark:bg-violet-900/10">
      {editing && (
        <OpenCreditAccountModal
          customer={{ id: account.id, name: account.name, document: account.document, email: account.email, creditLimit: account.creditLimit, creditTermDays: account.creditTermDays }}
          onClose={() => setEditing(false)}
        />
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-violet-900 dark:text-violet-200">
        <span>Máximo: <strong>{creditLimitLabel(account.creditLimit)}</strong></span>
        {available !== null && <span>Le puedes fiar: <strong>{formatCOP(available)}</strong></span>}
        <span>Plazo: <strong>{account.creditTermDays ? `${account.creditTermDays} días` : "sin fecha"}</strong></span>
      </div>
      {latest ? (
        <p className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
          <FileSignature className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Acuerdo {latest.signed ? "firmado" : "aceptado sin firma"} el {fmtDay(latest.createdAt)}
          {latest.emailedTo && ` · enviado a ${latest.emailedTo}`}
        </p>
      ) : (
        <p className="text-slate-600 dark:text-slate-300">Sin acuerdo firmado.</p>
      )}

      {resendTo !== null && latest ? (
        <form
          onSubmit={(e) => { e.preventDefault(); resend.mutate({ agreementId: latest.id, email: resendTo.trim() }); }}
          className="flex flex-wrap gap-2"
        >
          <input
            type="email"
            autoFocus
            aria-label="Correo para enviar el acuerdo"
            value={resendTo}
            onChange={(e) => setResendTo(e.target.value)}
            placeholder="correo@ejemplo.com"
            className="min-h-9 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 text-sm dark:border-white/15 dark:bg-slate-900 dark:text-white"
          />
          <button type="submit" disabled={!resendTo.trim() || resend.isPending} className="min-h-9 rounded-lg bg-violet-600 px-3 text-xs font-bold text-white disabled:opacity-50">
            {resend.isPending ? "Enviando..." : "Enviar"}
          </button>
          <button type="button" onClick={() => setResendTo(null)} className={smallButton}>Cancelar</button>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setEditing(true)} className={smallButton}>
            <FileSignature className="h-3.5 w-3.5" aria-hidden />
            {latest ? "Cambiar condiciones y firmar" : "Firmar acuerdo"}
          </button>
          {latest && (
            <>
              <button type="button" disabled={pdf.isPending} onClick={() => pdf.mutate({ agreementId: latest.id })} className={smallButton}>
                <Download className="h-3.5 w-3.5" aria-hidden /> {pdf.isPending ? "Generando..." : "PDF"}
              </button>
              <button type="button" onClick={() => setResendTo(latest.emailedTo ?? account.email ?? "")} className={smallButton}>
                <Mail className="h-3.5 w-3.5" aria-hidden /> Enviar por correo
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
