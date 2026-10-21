"use client";

import { AlertTriangle, CalendarClock, Info } from "lucide-react";
import { type ReactNode, useId, useState } from "react";

import {
  GRANT_DEFAULT_DAYS,
  GRANT_MAX_DAYS,
  GRANT_REASON_LABELS,
  GRANT_REASONS,
  type GrantPlanInput,
  type GrantReason,
  type GrantStart,
  type PlatformBusinessDetail,
} from "~/lib/platform/contract";
import { daysUntil } from "~/lib/subscription/access";
import { formatBytes, formatCop, getPlan, PLAN_CODES, type PlanCode } from "~/lib/subscription/catalog";

import { accessLine, days, formatCompactDate, formatDate, formatNumber, parseDigits } from "../_lib/format";
import { type GrantPreview, grantContextOf, listPriceForDays, previewGrant } from "../_lib/grant-preview";
import { Dialog } from "./Dialog";
import { PeriodTrack } from "./PeriodTrack";
import { buttonClass, Callout, inputClass, mutedText, PhaseChip, Spinner } from "./ui";

const DAY_SHORTCUTS = [7, 15, 30, 90, 365] as const;

const REASON_SHORT: Record<GrantReason, string> = {
  MANUAL_PAYMENT: "Pago manual",
  COURTESY: "Cortesía",
  COMPENSATION: "Compensación",
};

const REASON_HELP: Record<GrantReason, string> = {
  MANUAL_PAYMENT: "El cliente pagó por Nequi o transferencia.",
  COURTESY: "Regalo: no hubo pago.",
  COMPENSATION: "Reponer días por una falla o un error.",
};

const choiceBase =
  "admin-choice relative flex cursor-pointer rounded-xl border px-3 py-2.5 text-sm transition";
const choiceOn = "border-blue-700 bg-blue-50 dark:border-blue-400 dark:bg-blue-500/15";
const choiceOff =
  "border-slate-300 bg-white hover:border-slate-400 dark:border-white/15 dark:bg-transparent dark:hover:border-white/30";

/** Punto de radio dibujado: la selección no depende solo del color del borde. */
function RadioDot({ on }: Readonly<{ on: boolean }>) {
  return (
    <span
      aria-hidden
      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
        on ? "border-blue-700 dark:border-blue-300" : "border-slate-400 dark:border-slate-500"
      }`}
    >
      {on && <span className="h-2 w-2 rounded-full bg-blue-700 dark:bg-blue-300" />}
    </span>
  );
}

function Group({ legend, hint, children }: Readonly<{ legend: string; hint?: ReactNode; children: ReactNode }>) {
  return (
    <fieldset className="min-w-0">
      <legend className="text-sm font-semibold text-slate-900 dark:text-white">{legend}</legend>
      {hint && <p className={`mt-0.5 text-xs ${mutedText}`}>{hint}</p>}
      <div className="mt-2">{children}</div>
    </fieldset>
  );
}

function FieldError({ id, children }: Readonly<{ id: string; children: ReactNode }>) {
  return (
    <p id={id} role="alert" className="mt-1 text-xs font-medium text-red-700 dark:text-red-300">
      {children}
    </p>
  );
}

/** Texto de la opción "al final de lo vigente" (o "desde que venció", si está en gracia). */
function describeAfterCurrent(preview: GrantPreview, exact: boolean): string {
  if (!preview.ok) return preview.reason;
  if (preview.startsAt === "sinceExpiry") {
    return `Cuentan desde el ${formatCompactDate(preview.start)}: los días que lleva en gracia se descuentan.${
      exact ? ` Queda hasta el ${formatCompactDate(preview.end)}.` : ""
    }`;
  }
  return `Conserva sus ${days(preview.currentDaysLeft)}; los nuevos empiezan el ${formatCompactDate(preview.start)}.`;
}

function describeFromNow(preview: GrantPreview, inGrace: boolean, exact: boolean): string {
  if (!preview.ok) return preview.reason;
  const until = exact ? ` Queda hasta el ${formatCompactDate(preview.end)}.` : "";
  if (preview.lostDays > 0) return `Reemplaza lo vigente: pierde ${days(preview.lostDays)} que ya tenía.${until}`;
  if (inGrace) return `No se le descuentan los días que lleva en gracia.${until}`;
  return `Los días empiezan hoy.${until}`;
}

/**
 * Activar un plan a un negocio por N días. Panel lateral (pantalla completa en
 * el celular) con el resultado calculado en vivo y fijo al pie, junto al botón:
 * siempre se ve "Plan X hasta el …" antes de confirmar.
 *
 * No carga ni guarda nada por sí mismo: recibe el negocio y entrega un
 * `GrantPlanInput` validado a `onSubmit`.
 */
export function GrantPlanSheet({
  business,
  onSubmit,
  onClose,
  isSubmitting,
  submitError,
}: Readonly<{
  /** Detalle completo: la vista previa necesita las fechas de la suscripción. */
  business: PlatformBusinessDetail;
  onSubmit: (input: GrantPlanInput) => void;
  onClose: () => void;
  isSubmitting: boolean;
  /** Mensaje del último intento fallido, si lo hubo. */
  submitError: string | null;
}>) {
  const uid = useId();
  // La hora de referencia se fija al abrir: la vista previa no salta mientras se escribe.
  const [now] = useState(() => new Date());
  const sub = business.subscription;
  const ownerEmail = business.owner?.email ?? null;

  const [plan, setPlan] = useState<PlanCode>(sub.plan);
  const [daysText, setDaysText] = useState(String(GRANT_DEFAULT_DAYS));
  const [reason, setReason] = useState<GrantReason>("MANUAL_PAYMENT");
  const [amountText, setAmountText] = useState("");
  const [reference, setReference] = useState("");
  const [start, setStart] = useState<GrantStart>("AFTER_CURRENT");
  const [note, setNote] = useState("");
  const [notifyOwner, setNotifyOwner] = useState(ownerEmail !== null);
  const [acceptLoss, setAcceptLoss] = useState(false);
  const [triedSubmit, setTriedSubmit] = useState(false);

  const typedDays = parseDigits(daysText);
  /** Días ya validados (1..GRANT_MAX_DAYS), o null si lo escrito no sirve. */
  const dayCount = typedDays !== null && typedDays >= 1 && typedDays <= GRANT_MAX_DAYS ? typedDays : null;
  const daysValid = dayCount !== null;
  const amount = parseDigits(amountText);
  const isManual = reason === "MANUAL_PAYMENT";
  const amountValid = !isManual || (amount !== null && amount > 0);

  const newPlan = getPlan(plan);
  const currentPlan = getPlan(sub.plan);
  const context = grantContextOf(business, now);
  // Las dos opciones se calculan siempre (con los días por defecto si aún no hay un
  // número válido) para saber si hay algo que elegir y qué decir en cada una.
  const shapeDays = dayCount ?? GRANT_DEFAULT_DAYS;
  const afterCurrent = previewGrant(context, { plan, days: shapeDays, start: "AFTER_CURRENT" }, now);
  const fromNow = previewGrant(context, { plan, days: shapeDays, start: "NOW" }, now);
  /** "Al final de lo vigente" no se puede (p. ej. ya hay un cambio de plan programado). */
  const afterBlockedReason = afterCurrent.ok ? null : afterCurrent.reason;
  // Hay elección solo si las dos opciones dan fechas distintas.
  const hasChoice = afterCurrent.ok && afterCurrent.startsAt !== "today";
  let effectiveStart: GrantStart = "AFTER_CURRENT";
  if (afterBlockedReason !== null) effectiveStart = "NOW";
  else if (hasChoice) effectiveStart = start;
  const chosen = effectiveStart === "NOW" ? fromNow : afterCurrent;
  const preview = dayCount !== null && chosen.ok ? chosen : null;

  const lossNeedsOk = (preview?.lostDays ?? 0) > 0;
  const listPrice = dayCount !== null ? listPriceForDays(plan, dayCount) : null;
  const usersOverLimit = business.activeUsers > newPlan.limits.users;
  const inGrace = sub.phase === "PAST_DUE";

  const daysErrorId = `${uid}-days-error`;
  const amountErrorId = `${uid}-amount-error`;
  const lossErrorId = `${uid}-loss-error`;
  const showDaysError = !daysValid && (daysText !== "" || triedSubmit);
  const showAmountError = triedSubmit && !amountValid;
  const showLossError = triedSubmit && lossNeedsOk && !acceptLoss;

  function handleSubmit() {
    setTriedSubmit(true);
    if (dayCount === null || !amountValid || (lossNeedsOk && !acceptLoss)) return;
    onSubmit({
      businessId: business.id,
      plan,
      days: dayCount,
      reason,
      start: effectiveStart,
      amountCop: isManual && amount !== null ? amount : undefined,
      externalReference: isManual && reference.trim() ? reference.trim() : undefined,
      note: note.trim() || undefined,
      notifyOwner: notifyOwner && ownerEmail !== null,
    });
  }

  const footer = (
    <div className="space-y-3">
      <div aria-live="polite" aria-atomic="true">
        {preview ? (
          <>
            <p className={`text-xs ${mutedText}`}>Al confirmar, {business.name} queda con</p>
            <p className="mt-0.5 text-base font-bold leading-snug text-slate-900 dark:text-white">
              {preview.scheduled
                ? `${currentPlan.name} hasta el ${formatDate(preview.start)}; luego ${newPlan.name} hasta el ${formatDate(preview.end)}`
                : `Plan ${newPlan.name} hasta el ${formatDate(preview.end)}`}
            </p>
          </>
        ) : (
          <p className={`text-sm ${mutedText}`}>
            Escribe cuántos días (de 1 a {GRANT_MAX_DAYS}) para ver hasta cuándo queda activo.
          </p>
        )}
      </div>
      {submitError && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-900/20 dark:text-red-100">
          {submitError}
        </p>
      )}
      <div className="flex gap-2 sm:justify-end">
        <button type="button" onClick={onClose} disabled={isSubmitting} className={buttonClass.secondary}>
          Cancelar
        </button>
        <button type="submit" disabled={isSubmitting} className={`${buttonClass.primary} flex-1 sm:min-w-40 sm:flex-none`}>
          {isSubmitting && <Spinner />}
          {isSubmitting ? "Activando..." : "Activar plan"}
        </button>
      </div>
    </div>
  );

  return (
    <Dialog
      variant="sheet"
      title="Activar plan"
      subtitle={<span className="line-clamp-2 font-medium text-slate-800 dark:text-slate-200">{business.name}</span>}
      onClose={onClose}
      busy={isSubmitting}
      onSubmit={handleSubmit}
      footer={footer}
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 rounded-xl bg-slate-100 px-3 py-2.5 text-sm dark:bg-white/5">
          <span className={mutedText}>Hoy tiene</span>
          <span className="font-semibold text-slate-900 dark:text-white">{currentPlan.name}</span>
          <PhaseChip phase={sub.phase} />
          <span className={`basis-full text-xs ${mutedText}`}>{accessLine(sub)}</span>
        </div>

        <Group legend="Plan">
          <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-3">
            {PLAN_CODES.map((code) => {
              const option = getPlan(code);
              const on = code === plan;
              return (
                <label key={code} className={`${choiceBase} flex-col gap-0.5 ${on ? choiceOn : choiceOff}`}>
                  <input
                    type="radio"
                    name={`${uid}-plan`}
                    value={code}
                    checked={on}
                    onChange={() => setPlan(code)}
                    className="sr-only"
                  />
                  <span className="flex items-start justify-between gap-1">
                    <span className="font-semibold text-slate-900 dark:text-white">{option.name}</span>
                    <RadioDot on={on} />
                  </span>
                  <span className={`text-xs tabular-nums ${mutedText}`}>{formatCop(option.prices.MONTHLY)} al mes</span>
                  {code === sub.plan && (
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300">El que tiene</span>
                  )}
                </label>
              );
            })}
          </div>
          <p className={`mt-2 text-xs ${mutedText}`}>
            {newPlan.name} incluye {newPlan.limits.users} usuarios,{" "}
            {newPlan.limits.products === null
              ? "productos ilimitados"
              : `${formatNumber(newPlan.limits.products)} productos`}{" "}
            y {formatBytes(newPlan.limits.storageBytes)} para comprobantes.
          </p>
        </Group>

        <Group legend="Días de acceso">
          <div className="flex flex-wrap items-center gap-2">
            {DAY_SHORTCUTS.map((n) => {
              const on = typedDays === n;
              return (
                <button
                  key={n}
                  type="button"
                  aria-pressed={on}
                  aria-label={days(n)}
                  onClick={() => setDaysText(String(n))}
                  className={`inline-flex h-10 min-w-12 items-center justify-center rounded-lg border px-3 text-sm font-semibold tabular-nums transition ${
                    on
                      ? "border-blue-700 bg-blue-700 text-white dark:border-blue-500 dark:bg-blue-600"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:bg-transparent dark:text-slate-200 dark:hover:bg-white/10"
                  }`}
                >
                  {n}
                </button>
              );
            })}
            <label className="flex items-center gap-2 text-sm">
              <span className={mutedText}>u otro valor</span>
              <input
                inputMode="numeric"
                autoComplete="off"
                value={daysText}
                onChange={(e) => setDaysText(e.target.value.replace(/\D/g, "").slice(0, 3))}
                aria-label="Días de acceso"
                aria-invalid={showDaysError}
                aria-describedby={showDaysError ? daysErrorId : undefined}
                className={`${inputClass} w-20 text-center tabular-nums ${showDaysError ? "border-red-500 dark:border-red-400" : ""}`}
              />
            </label>
          </div>
          {showDaysError && (
            <FieldError id={daysErrorId}>Escribe un número de días entre 1 y {GRANT_MAX_DAYS}.</FieldError>
          )}
        </Group>

        <Group legend="Motivo">
          <div className="grid gap-2 sm:grid-cols-3">
            {GRANT_REASONS.map((value) => {
              const on = value === reason;
              return (
                <label
                  key={value}
                  title={GRANT_REASON_LABELS[value]}
                  className={`${choiceBase} items-start gap-2 ${on ? choiceOn : choiceOff}`}
                >
                  <input
                    type="radio"
                    name={`${uid}-reason`}
                    value={value}
                    checked={on}
                    onChange={() => setReason(value)}
                    className="sr-only"
                  />
                  <RadioDot on={on} />
                  <span>
                    <span className="block font-semibold text-slate-900 dark:text-white">{REASON_SHORT[value]}</span>
                    <span className={`block text-xs ${mutedText}`}>{REASON_HELP[value]}</span>
                  </span>
                </label>
              );
            })}
          </div>

          {isManual && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor={`${uid}-amount`} className="text-sm font-medium text-slate-800 dark:text-slate-200">
                  Monto que pagó (COP)
                </label>
                <div className="relative mt-1">
                  <span aria-hidden className={`pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm ${mutedText}`}>
                    $
                  </span>
                  <input
                    id={`${uid}-amount`}
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="0"
                    value={amount === null ? "" : formatNumber(amount)}
                    onChange={(e) => setAmountText(e.target.value.replace(/\D/g, "").slice(0, 9))}
                    aria-invalid={showAmountError}
                    aria-describedby={showAmountError ? amountErrorId : undefined}
                    className={`${inputClass} pl-7 tabular-nums ${showAmountError ? "border-red-500 dark:border-red-400" : ""}`}
                  />
                </div>
                {showAmountError && <FieldError id={amountErrorId}>Escribe el monto que pagó el cliente.</FieldError>}
                {listPrice !== null && dayCount !== null && amount !== listPrice && (
                  <p className={`mt-1 text-xs ${mutedText}`}>
                    Precio de lista por {days(dayCount)}: {formatCop(listPrice)}.{" "}
                    <button
                      type="button"
                      onClick={() => setAmountText(String(listPrice))}
                      className="font-semibold text-blue-700 underline underline-offset-2 dark:text-blue-300"
                    >
                      Usar este monto
                    </button>
                  </p>
                )}
              </div>
              <div>
                <label htmlFor={`${uid}-reference`} className="text-sm font-medium text-slate-800 dark:text-slate-200">
                  Número de comprobante <span className={`font-normal ${mutedText}`}>(opcional)</span>
                </label>
                <input
                  id={`${uid}-reference`}
                  autoComplete="off"
                  placeholder="El de Nequi o del banco"
                  value={reference}
                  maxLength={60}
                  onChange={(e) => setReference(e.target.value)}
                  className={`${inputClass} mt-1`}
                />
              </div>
            </div>
          )}
        </Group>

        <Group legend="Desde cuándo cuentan los días">
          {hasChoice || afterBlockedReason !== null ? (
            <div className="grid gap-2">
              {(
                [
                  {
                    value: "AFTER_CURRENT",
                    disabled: afterBlockedReason !== null,
                    title: inGrace ? "Desde la fecha en que venció" : "Sumar al final de lo vigente",
                    detail: describeAfterCurrent(afterCurrent, dayCount !== null),
                  },
                  {
                    value: "NOW",
                    disabled: false,
                    title: "Desde hoy",
                    detail: describeFromNow(fromNow, inGrace, dayCount !== null),
                  },
                ] as const
              ).map((option) => {
                const on = option.value === effectiveStart;
                return (
                  <label
                    key={option.value}
                    className={`${choiceBase} items-start gap-2 ${on ? choiceOn : choiceOff} ${
                      option.disabled ? "cursor-not-allowed opacity-60" : ""
                    }`}
                  >
                    <input
                      type="radio"
                      name={`${uid}-start`}
                      value={option.value}
                      checked={on}
                      disabled={option.disabled}
                      onChange={() => {
                        setStart(option.value);
                        setAcceptLoss(false);
                      }}
                      className="sr-only"
                    />
                    <RadioDot on={on} />
                    <span>
                      <span className="block font-semibold text-slate-900 dark:text-white">{option.title}</span>
                      <span className={`block text-xs ${mutedText}`}>{option.detail}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          ) : (
            <p className={`text-sm ${mutedText}`}>
              {inGrace
                ? "Empiezan hoy: contados desde la fecha en que venció, estos días ya se habrían acabado."
                : "Empiezan hoy: este negocio no tiene días vigentes que conservar."}
            </p>
          )}
        </Group>

        <div>
          <label htmlFor={`${uid}-note`} className="text-sm font-semibold text-slate-900 dark:text-white">
            Nota <span className={`font-normal ${mutedText}`}>(opcional)</span>
          </label>
          <p className={`mt-0.5 text-xs ${mutedText}`}>Solo la ves tú, en la bitácora y en el pago.</p>
          <textarea
            id={`${uid}-note`}
            rows={2}
            maxLength={300}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={`${inputClass} mt-2 resize-y`}
          />
        </div>

        <label
          className={`admin-choice flex items-start gap-3 rounded-xl border border-slate-300 px-3 py-2.5 dark:border-white/15 ${
            ownerEmail ? "cursor-pointer" : "opacity-70"
          }`}
        >
          <input
            type="checkbox"
            checked={notifyOwner && ownerEmail !== null}
            disabled={ownerEmail === null}
            onChange={(e) => setNotifyOwner(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded accent-blue-700"
          />
          <span className="min-w-0 text-sm">
            <span className="block font-semibold text-slate-900 dark:text-white">Avisar al dueño por correo</span>
            <span className={`block break-words text-xs ${mutedText}`}>
              {ownerEmail
                ? `Se envía la confirmación a ${ownerEmail}.`
                : "No se puede: este negocio no tiene un dueño activo con correo."}
            </span>
          </span>
        </label>

        {preview && dayCount !== null && (
          <section
            aria-label="Revisa antes de activar"
            className="space-y-3 rounded-xl border border-slate-200 p-3.5 dark:border-white/10"
          >
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Revisa antes de activar</h3>
            <PeriodTrack
              keptDays={preview.startsAt === "afterCurrent" ? preview.currentDaysLeft : 0}
              keptLabel={`Ya tiene ${days(preview.currentDaysLeft)}`}
              addedDays={dayCount}
              addedLabel={
                preview.startsAt === "today"
                  ? `${newPlan.name}, ${days(dayCount)} desde hoy`
                  : `${newPlan.name}, ${days(dayCount)} desde el ${formatCompactDate(preview.start)}`
              }
              startLabel={preview.startsAt === "sinceExpiry" ? formatCompactDate(preview.start) : "Hoy"}
              end={preview.end}
            />
            <p className="text-sm text-slate-800 dark:text-slate-200">
              {preview.startsAt === "afterCurrent" &&
                `Los ${days(dayCount)} van del ${formatDate(preview.start)} al ${formatDate(preview.end)}.`}
              {preview.startsAt === "today" && `Los ${days(dayCount)} van de hoy al ${formatDate(preview.end)}.`}
              {preview.startsAt === "sinceExpiry" &&
                `Los ${days(dayCount)} cuentan desde el ${formatDate(preview.start)}, cuando venció, y van hasta el ${formatDate(preview.end)}. De hoy en adelante le quedan ${days(daysUntil(preview.end, now))}.`}
            </p>

            {preview.scheduled && (
              <Callout tone="info" icon={CalendarClock}>
                El cambio queda programado: sigue en {currentPlan.name} hasta el {formatDate(preview.start)} y ese día
                pasa a {newPlan.name}. Si debe tener {newPlan.name} ya mismo, elige “Desde hoy”.
              </Callout>
            )}
            {preview.planChange === "downgrade" && (
              <Callout tone="warn" icon={AlertTriangle}>
                {newPlan.name} es un plan menor que {currentPlan.name}, el que tiene ahora.
                {usersOverLimit &&
                  ` Tiene ${business.activeUsers} usuarios activos y ${newPlan.name} permite ${newPlan.limits.users}.`}
              </Callout>
            )}
            {isManual && amount !== null && amount > 0 && listPrice !== null && amount < listPrice && (
              <Callout tone="info" icon={Info}>
                El monto es {formatCop(listPrice - amount)} menor que el precio de lista por {days(dayCount)}.
              </Callout>
            )}
            {lossNeedsOk && (
              <div className="space-y-2">
                <Callout tone="warn" icon={AlertTriangle}>
                  Al empezar desde hoy, el negocio pierde {days(preview.lostDays)} que ya tenía vigentes.
                </Callout>
                <label className="admin-choice flex cursor-pointer items-start gap-3 rounded-xl border border-amber-300 px-3 py-2.5 dark:border-amber-500/40">
                  <input
                    type="checkbox"
                    checked={acceptLoss}
                    onChange={(e) => setAcceptLoss(e.target.checked)}
                    aria-invalid={showLossError}
                    aria-describedby={showLossError ? lossErrorId : undefined}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded accent-blue-700"
                  />
                  <span className="text-sm font-medium text-slate-900 dark:text-white">
                    Sí, quiero reemplazar lo vigente y que pierda esos {days(preview.lostDays)}.
                  </span>
                </label>
                {showLossError && <FieldError id={lossErrorId}>Marca la casilla para confirmar, o elige sumar al final de lo vigente.</FieldError>}
              </div>
            )}
          </section>
        )}
      </div>
    </Dialog>
  );
}
