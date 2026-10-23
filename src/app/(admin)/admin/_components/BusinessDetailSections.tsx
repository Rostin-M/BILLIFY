import { CalendarClock, Mail, MessageCircle, Phone, UserX } from "lucide-react";
import { type ReactNode } from "react";

import { type PlatformBusinessDetail, type PlatformUsage } from "~/lib/platform/contract";
import { CYCLE_LABELS, formatBytes, getPlan, GRACE_DAYS } from "~/lib/subscription/catalog";

import { accessLine, days, formatAgo, formatDate, formatNumber } from "../_lib/format";
import { Callout, Fact, linkClass, mutedText, PhaseChip, Tag } from "./ui";

/** Qué sigue para el negocio si nadie hace nada (ayuda a decidir si urge). */
function whatHappensNext(business: PlatformBusinessDetail): string | null {
  const { phase, graceDaysLeft } = business.subscription;
  switch (phase) {
    case "TRIAL":
      return "Si no paga antes de que termine la prueba, pasa directo a solo lectura (la prueba no tiene días de gracia).";
    case "ACTIVE":
      return `Al vencer tiene ${days(GRACE_DAYS)} de gracia con acceso completo; después, solo lectura.`;
    case "PAST_DUE":
      return `Le quedan ${days(graceDaysLeft)} de gracia con acceso completo. Después pasa a solo lectura.`;
    case "CANCELED":
      return "El dueño canceló la renovación: al terminar pasa directo a solo lectura, sin días de gracia.";
    case "READ_ONLY":
      return "Puede consultar su historial y exportar, pero no vender ni crear. Activarle un plan le devuelve el acceso de inmediato.";
  }
}

export function SubscriptionSection({ business }: Readonly<{ business: PlatformBusinessDetail }>) {
  const sub = business.subscription;
  const dates = business.subscriptionDates;
  const next = whatHappensNext(business);
  const neverPaid = dates.currentPeriodEnd === null;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <p className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{getPlan(sub.plan).name}</p>
        {!neverPaid && <span className={`text-sm font-medium ${mutedText}`}>{CYCLE_LABELS[sub.billingCycle]}</span>}
        <PhaseChip phase={sub.phase} />
      </div>
      <p className="mt-1.5 text-sm font-medium text-slate-800 dark:text-slate-200">{accessLine(sub)}</p>
      {next && <p className={`mt-1 text-sm ${mutedText}`}>{next}</p>}

      {dates.scheduledPlan && dates.scheduledFrom && (
        <div className="mt-3">
          <Callout tone="info" icon={CalendarClock}>
            Cambio programado: desde el {formatDate(dates.scheduledFrom)} pasa a {getPlan(dates.scheduledPlan).name}.
          </Callout>
        </div>
      )}

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-slate-100 pt-4 dark:border-white/10">
        <Fact label={neverPaid ? "Fin de la prueba" : "La prueba terminó el"}>
          {dates.trialEndsAt ? formatDate(dates.trialEndsAt) : "Sin fecha"}
        </Fact>
        <Fact label="Período pagado">
          {dates.currentPeriodStart && dates.currentPeriodEnd
            ? `${formatDate(dates.currentPeriodStart)} al ${formatDate(dates.currentPeriodEnd)}`
            : "Nunca ha tenido uno"}
        </Fact>
        {dates.canceledAt && <Fact label="Canceló la renovación el">{formatDate(dates.canceledAt)}</Fact>}
      </dl>
    </div>
  );
}

function ContactLink({ href, icon, children }: Readonly<{ href: string; icon: ReactNode; children: ReactNode }>) {
  return (
    <a href={href} className={`${linkClass} inline-flex min-h-9 items-center gap-1.5 break-all text-sm`}>
      {icon}
      {children}
    </a>
  );
}

/** Enlace a WhatsApp para un celular colombiano (10 dígitos); null si no lo parece. */
function whatsappHref(phone: string | null): string | null {
  const digits = phone?.replace(/\D/g, "") ?? "";
  return digits.length === 10 && digits.startsWith("3") ? `https://wa.me/57${digits}` : null;
}

export function ContactSection({ business }: Readonly<{ business: PlatformBusinessDetail }>) {
  const owner = business.owner;
  const whatsapp = whatsappHref(owner?.phone ?? null);

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Dueño</h3>
        {owner ? (
          <div className="mt-1.5">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{owner.name ?? "Sin nombre"}</p>
            <div className="mt-1 flex flex-col items-start">
              {whatsapp && (
                <ContactLink href={whatsapp} icon={<MessageCircle aria-hidden className="h-4 w-4 shrink-0" />}>
                  Escribirle por WhatsApp
                </ContactLink>
              )}
              {owner.phone && (
                <ContactLink href={`tel:${owner.phone.replace(/\s/g, "")}`} icon={<Phone aria-hidden className="h-4 w-4 shrink-0" />}>
                  {owner.phone}
                </ContactLink>
              )}
              {owner.email ? (
                <ContactLink href={`mailto:${owner.email}`} icon={<Mail aria-hidden className="h-4 w-4 shrink-0" />}>
                  {owner.email}
                </ContactLink>
              ) : (
                <p className={`mt-1 text-sm ${mutedText}`}>Sin correo: no se le pueden enviar avisos.</p>
              )}
            </div>
          </div>
        ) : (
          <div className="mt-2">
            <Callout tone="warn" icon={UserX}>
              Este negocio no tiene un dueño activo. Nadie puede pagar ni administrar la cuenta, y no hay a quién
              avisarle por correo.
            </Callout>
          </div>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-slate-100 pt-4 dark:border-white/10">
        <Fact label="Documento">{business.document}</Fact>
        <Fact label="Cliente desde">{formatDate(business.createdAt)}</Fact>
        <div className="col-span-2">
          <Fact label="Dirección">{business.address ?? "Sin registrar"}</Fact>
        </div>
        <Fact label="Teléfono del negocio">{business.phone ?? "Sin registrar"}</Fact>
        <Fact label="Correo del negocio">{business.email ?? "Sin registrar"}</Fact>
      </dl>
    </div>
  );
}

type Meter = { label: string; used: number; limit: number | null; format?: (n: number) => string };

function MeterRow({ meter }: Readonly<{ meter: Meter }>) {
  const format = meter.format ?? formatNumber;
  const ratio = meter.limit ? meter.used / meter.limit : 0;
  const pct = Math.min(100, ratio * 100);
  let bar = "bg-blue-600 dark:bg-blue-500";
  let note: string | null = null;
  if (meter.limit !== null && ratio >= 1) {
    bar = "bg-red-500";
    note = ratio > 1 ? "Pasado del límite" : "En el límite";
  } else if (ratio >= 0.8) {
    bar = "bg-amber-500";
    note = "Cerca del límite";
  }
  return (
    <li>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium text-slate-800 dark:text-slate-200">{meter.label}</span>
        <span className={`text-right tabular-nums ${mutedText}`}>
          {format(meter.used)} {meter.limit === null ? "(sin límite)" : `de ${format(meter.limit)}`}
        </span>
      </div>
      <meter
        className="sr-only"
        aria-label={meter.label}
        aria-valuetext={`${format(meter.used)} ${meter.limit === null ? "sin límite" : "de " + format(meter.limit)}`}
        min={0}
        max={meter.limit ?? meter.used}
        value={meter.used}
      />
      <div aria-hidden className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
        {meter.limit !== null && (
          <div className={`h-full rounded-full ${bar}`} style={{ width: `${Math.max(pct, meter.used > 0 ? 2 : 0)}%` }} />
        )}
      </div>
      {note && (
        <p className={`mt-1 text-xs font-medium ${ratio >= 1 ? "text-red-700 dark:text-red-300" : "text-amber-800 dark:text-amber-300"}`}>
          {note}
        </p>
      )}
    </li>
  );
}

export function UsageSection({ usage, now }: Readonly<{ usage: PlatformUsage; now: Date }>) {
  const meters: Meter[] = [
    { label: "Usuarios activos", used: usage.activeUsers, limit: usage.usersLimit },
    { label: "Productos activos", used: usage.activeProducts, limit: usage.productsLimit },
    { label: "Facturas por correo este mes", used: usage.invoiceEmailsThisMonth, limit: usage.invoiceEmailsLimit },
    { label: "Fotos de comprobantes", used: usage.storageBytes, limit: usage.storageLimitBytes, format: formatBytes },
  ];
  return (
    <div>
      <ul className="space-y-4">
        {meters.map((meter) => (
          <MeterRow key={meter.label} meter={meter} />
        ))}
      </ul>
      <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-slate-100 pt-4 dark:border-white/10">
        <Fact label="Ventas en 30 días">{formatNumber(usage.salesLast30Days)}</Fact>
        <Fact label="Última venta">{usage.lastSaleAt ? formatAgo(usage.lastSaleAt, now) : "Ninguna todavía"}</Fact>
      </dl>
    </div>
  );
}

export function UsersSection({ users }: Readonly<{ users: PlatformBusinessDetail["users"] }>) {
  return (
    <ul className="divide-y divide-slate-100 dark:divide-white/5">
      {users.map((user) => (
        <li key={user.id} className={`flex items-center gap-3 px-4 py-3 sm:px-5 ${user.isActive ? "" : "opacity-75"}`}>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{user.name ?? "Sin nombre"}</p>
            <p className={`truncate text-xs ${mutedText}`}>{user.email ?? "Sin correo"}</p>
          </div>
          <span className="flex shrink-0 items-center gap-1.5">
            <Tag tone={user.role === "OWNER" ? "info" : "neutral"}>{user.role === "OWNER" ? "Dueño" : "Cajero"}</Tag>
            {!user.isActive && <Tag tone="warn">Inactivo</Tag>}
          </span>
        </li>
      ))}
    </ul>
  );
}
