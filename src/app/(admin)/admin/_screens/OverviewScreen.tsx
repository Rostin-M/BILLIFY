"use client";

import { CalendarCheck, CircleCheck, SearchX, ShieldCheck, Store } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useState } from "react";

import { EXPIRING_SOON_DAYS, type PlatformBusinessRow } from "~/lib/platform/contract";

import { BusinessList } from "../_components/BusinessList";
import { PaymentList } from "../_components/PaymentList";
import { PhaseBreakdown } from "../_components/PhaseBreakdown";
import { SearchField } from "../_components/SearchField";
import { Card, cardClass, EmptyBlock, ErrorState, linkClass, ListSkeleton, mutedText, PageHeader } from "../_components/ui";
import { type ListState, useBusinesses, useOverview, usePayments } from "../_data/platform";
import { useDebounced } from "../_lib/hooks";
import { usePlanActions } from "./usePlanActions";

const QUEUE_LIMIT = 5;

/** Contenido de una cola del resumen: cargando, error, vacío o la lista. */
function Queue<T>({
  list,
  empty,
  children,
}: Readonly<{ list: ListState<T>; empty: ReactNode; children: (items: T[]) => ReactNode }>) {
  if (list.isPending) return <ListSkeleton rows={2} />;
  if (list.error) return <ErrorState compact message={list.error} onRetry={list.refetch} />;
  if (list.items.length === 0) return <>{empty}</>;
  return <>{children(list.items)}</>;
}

function CountPill({ count, tone }: Readonly<{ count: number | undefined; tone: "warn" | "neutral" }>) {
  if (count === undefined) return null;
  const tones = {
    warn: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100",
    neutral: "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200",
  } as const;
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-sm font-bold tabular-nums ${count > 0 ? tones[tone] : tones.neutral}`}>
      {count}
    </span>
  );
}

function SeeAll({ href, children }: Readonly<{ href: string; children: ReactNode }>) {
  return (
    <div className="border-t border-slate-100 px-4 py-3 text-sm sm:px-5 dark:border-white/10">
      <Link href={href} className={linkClass}>
        {children}
      </Link>
    </div>
  );
}

/** Buscador del resumen: encontrar al negocio que acaba de pagar y activarle el plan. */
function ActivateSearch({ onActivate }: Readonly<{ onActivate: (business: PlatformBusinessRow) => void }>) {
  const [text, setText] = useState("");
  const query = useDebounced(text.trim(), 250);
  const searching = query.length >= 2;
  const results = useBusinesses({ search: query, limit: QUEUE_LIMIT }, { enabled: searching });

  return (
    <section className={`${cardClass} overflow-hidden`}>
      <div className="p-4 sm:p-5">
        <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
          ¿A quién le vas a activar el plan?
        </h2>
        <p className={`mt-0.5 text-sm ${mutedText}`}>
          Busca el negocio que te pagó por su nombre, su documento o el correo del dueño.
        </p>
        <div className="mt-3">
          <SearchField
            id="resumen-buscar"
            size="lg"
            label="Buscar negocio para activarle un plan"
            placeholder="Café La Bastilla, 901.482.330, marcela@..."
            value={text}
            onChange={setText}
          />
        </div>
      </div>

      {searching && (
        <div aria-live="polite" className="border-t border-slate-100 dark:border-white/10">
          <Queue
            list={results}
            empty={
              <EmptyBlock
                compact
                icon={SearchX}
                title={`Ningún negocio coincide con “${query}”`}
                description="Revisa cómo está escrito o prueba con el número del documento."
              />
            }
          >
            {(items) => (
              <>
                <BusinessList businesses={items} onActivate={onActivate} />
                {results.hasMore && (
                  <SeeAll href={`/admin/negocios?q=${encodeURIComponent(query)}`}>Ver todos los resultados</SeeAll>
                )}
              </>
            )}
          </Queue>
        </div>
      )}
    </section>
  );
}

export function OverviewScreen() {
  const overview = useOverview();
  const actions = usePlanActions();
  const inGrace = useBusinesses({ phase: "PAST_DUE", limit: QUEUE_LIMIT });
  const expiring = useBusinesses({ expiringSoon: true, limit: QUEUE_LIMIT });
  const toReview = usePayments({ needsReview: true, limit: QUEUE_LIMIT });
  const data = overview.data;

  // Plataforma recién estrenada: nada que atender ni que buscar.
  if (data?.total === 0) {
    return (
      <>
        <PageHeader title="Resumen" />
        <div className={cardClass}>
          <EmptyBlock
            icon={Store}
            title="Todavía no hay negocios registrados"
            description="Cuando alguien cree su cuenta en BILLIFY aparecerá aquí, en prueba gratis, y podrás activarle un plan."
          />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Resumen" subtitle="A quién atender hoy y cómo va la plataforma." />

      <div className="space-y-5">
        <ActivateSearch onActivate={actions.activate} />

        <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
          <div className="space-y-5">
            <Card
              flush
              title="En gracia"
              description="Ya vencieron. Si no pagan, pasan a solo lectura."
              aside={<CountPill count={data?.pastDue} tone="warn" />}
            >
              <Queue
                list={inGrace}
                empty={<EmptyBlock compact icon={ShieldCheck} title="Ningún negocio está en gracia" />}
              >
                {(items) => (
                  <>
                    <BusinessList dense businesses={items} onActivate={actions.activate} />
                    {inGrace.hasMore && <SeeAll href="/admin/negocios?estado=PAST_DUE">Ver todos los que están en gracia</SeeAll>}
                  </>
                )}
              </Queue>
            </Card>

            <Card
              flush
              title={`Vencen en ${EXPIRING_SOON_DAYS} días o menos`}
              description="Pruebas y planes que están por terminar."
              aside={<CountPill count={data?.expiringSoon} tone="warn" />}
            >
              <Queue
                list={expiring}
                empty={<EmptyBlock compact icon={CalendarCheck} title="Nadie vence esta semana" />}
              >
                {(items) => (
                  <>
                    <BusinessList dense businesses={items} onActivate={actions.activate} />
                    {expiring.hasMore && <SeeAll href="/admin/negocios?estado=por-vencer">Ver todos los que están por vencer</SeeAll>}
                  </>
                )}
              </Queue>
            </Card>
          </div>

          <div className="space-y-5">
            <Card
              flush
              title="Pagos por revisar"
              description="Pagos que necesitan que los mires, como los anulados después de aprobarse."
              aside={<CountPill count={data?.paymentsToReview} tone="warn" />}
            >
              <Queue
                list={toReview}
                empty={<EmptyBlock compact icon={CircleCheck} title="No hay pagos por revisar" />}
              >
                {(items) => (
                  <>
                    <PaymentList showBusiness payments={items} onResolveReview={actions.resolveReview} />
                    <SeeAll href="/admin/pagos?revisar=1">Ir a los pagos por revisar</SeeAll>
                  </>
                )}
              </Queue>
            </Card>

            <Card title="Negocios por estado">
              {overview.isPending && (
                <div role="status" aria-label="Cargando" className="animate-pulse space-y-4 motion-reduce:animate-none">
                  <div className="h-8 w-40 rounded-md bg-slate-200 dark:bg-white/10" />
                  <div className="h-3 rounded-full bg-slate-200 dark:bg-white/10" />
                  <div className="h-16 rounded-md bg-slate-200 dark:bg-white/10" />
                </div>
              )}
              {overview.error && <ErrorState compact message={overview.error} onRetry={overview.refetch} />}
              {data && <PhaseBreakdown overview={data} />}
            </Card>
          </div>
        </div>
      </div>

      {actions.dialogs}
    </>
  );
}
