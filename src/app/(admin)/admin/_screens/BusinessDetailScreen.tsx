"use client";

import { ArrowLeft, Receipt, ScrollText, Users, Zap } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import {
  ContactSection,
  SubscriptionSection,
  UsageSection,
  UsersSection,
} from "../_components/BusinessDetailSections";
import { AuditList } from "../_components/AuditList";
import { PaymentList } from "../_components/PaymentList";
import { buttonClass, Card, cardClass, EmptyBlock, ErrorState, linkClass, mutedText } from "../_components/ui";
import { useBusiness } from "../_data/platform";
import { usePlanActions } from "./usePlanActions";

function BackLink() {
  return (
    <Link href="/admin/negocios" className={`${linkClass} inline-flex min-h-9 items-center gap-1.5 text-sm`}>
      <ArrowLeft aria-hidden className="h-4 w-4" />
      Negocios
    </Link>
  );
}

function DetailSkeleton() {
  return (
    <div role="status" aria-label="Cargando el negocio" className="animate-pulse motion-reduce:animate-none">
      <div className="h-8 w-2/3 max-w-md rounded-md bg-slate-200 dark:bg-white/10" />
      <div className="mt-2 h-4 w-48 rounded-md bg-slate-200 dark:bg-white/10" />
      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-5">
          <div className={`${cardClass} h-52`} />
          <div className={`${cardClass} h-64`} />
        </div>
        <div className="space-y-5">
          <div className={`${cardClass} h-56`} />
          <div className={`${cardClass} h-48`} />
        </div>
      </div>
    </div>
  );
}

export function BusinessDetailScreen({ businessId }: Readonly<{ businessId: string }>) {
  const query = useBusiness(businessId);
  const actions = usePlanActions();
  const [now] = useState(() => new Date());
  const business = query.data;

  if (query.isPending) {
    return (
      <>
        <BackLink />
        <div className="mt-3">
          <DetailSkeleton />
        </div>
      </>
    );
  }

  if (!business) {
    return (
      <>
        <BackLink />
        <div className={`${cardClass} mt-3`}>
          <ErrorState
            message={query.error ?? "No se pudo cargar este negocio."}
            onRetry={query.refetch}
          />
        </div>
      </>
    );
  }

  const neverPaid = business.subscriptionDates.currentPeriodEnd === null;

  return (
    <>
      <BackLink />

      <div className="mb-6 mt-2 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            {business.name}
          </h1>
          <p className={`mt-1 text-sm ${mutedText}`}>{business.document}</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row lg:shrink-0">
          <button type="button" onClick={() => actions.activate(business)} className={buttonClass.primary}>
            <Zap aria-hidden className="h-4 w-4" />
            Activar plan
          </button>
          {neverPaid && (
            <button
              type="button"
              onClick={() => actions.extendTrial(business, business.subscriptionDates.trialEndsAt)}
              className={buttonClass.secondary}
            >
              Extender prueba
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
        <div className="space-y-5">
          <Card title="Suscripción">
            <SubscriptionSection business={business} />
          </Card>

          <Card
            flush
            title="Pagos recientes"
            description="La activación manual más reciente se puede revocar desde aquí."
          >
            {business.recentPayments.length === 0 ? (
              <EmptyBlock
                compact
                icon={Receipt}
                title="Este negocio no tiene pagos"
                description="Cuando pague por la app o le actives un plan, aparecerá aquí."
              />
            ) : (
              <PaymentList
                payments={business.recentPayments}
                onRevoke={(payment) => actions.revoke(payment, business.owner?.email ?? null)}
                onResolveReview={actions.resolveReview}
              />
            )}
          </Card>

          <Card flush title="Lo que has hecho en este negocio">
            {business.recentAudit.length === 0 ? (
              <EmptyBlock
                compact
                icon={ScrollText}
                title="Sin acciones todavía"
                description="Aquí queda cada plan que actives, prueba que extiendas o activación que revoques."
              />
            ) : (
              <AuditList entries={business.recentAudit} />
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Negocio y contacto">
            <ContactSection business={business} />
          </Card>

          <Card title="Uso frente al plan" description="Lo que lleva usado de lo que incluye su plan.">
            <UsageSection usage={business.usage} now={now} />
          </Card>

          <Card
            flush
            title="Usuarios"
            description={`${business.activeUsers} ${business.activeUsers === 1 ? "activo" : "activos"} de ${business.users.length}`}
          >
            {business.users.length === 0 ? (
              <EmptyBlock compact icon={Users} title="Este negocio no tiene usuarios" />
            ) : (
              <UsersSection users={business.users} />
            )}
          </Card>
        </div>
      </div>

      {actions.dialogs}
    </>
  );
}
