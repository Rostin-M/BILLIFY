"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { firstErrorMessage } from "~/lib/parseZodError";
import { api } from "~/trpc/react";
import { CajaSection } from "./settings/CajaSection";
import { FacturacionSection } from "./settings/FacturacionSection";
import { LogoCard } from "./settings/LogoCard";
import { NegocioSection } from "./settings/NegocioSection";
import { PermisosSection } from "./settings/PermisosSection";
import { PlanSection } from "./settings/PlanSection";
import { ProductosSection } from "./settings/ProductosSection";
import {
  type BusinessData,
  DEFAULT_SECTION,
  formFromData,
  isSectionDirty,
  isSectionId,
  pickSection,
  SECTIONS,
  type SectionId,
  type SectionMeta,
  type SettingsForm,
} from "./settings/types";
import { SectionCard } from "./settings/ui";

// Convierte el formulario al input de business.updateSettings
function toInput(form: SettingsForm, maxCashRegisters: number) {
  const taxes = form.taxes
    .map((t) => ({ name: t.name.trim(), rate: Number.parseFloat(t.rate) || 0, enabled: t.enabled }))
    .filter((t) => t.name.length > 0);

  return {
    name: form.name,
    address: form.address || undefined,
    phone: form.phone || undefined,
    email: form.email || undefined,
    ownerPhone: form.ownerPhone || undefined,
    invoicePhoneSource: form.invoicePhoneSource,
    invoiceEmailSource: form.invoiceEmailSource,
    invoiceTaxDetail: form.invoiceTaxDetail,
    taxes,
    autoTax: form.autoTax,
    maxCashRegisters,
    categories: form.categories,
    produceModuleEnabled: form.produceModuleEnabled,
    cashiersCanEditPrices: form.cashiersCanEditPrices,
  };
}

function SettingsNav({
  active,
  dirtyIds,
  onSelect,
}: Readonly<{
  active: SectionId;
  dirtyIds: ReadonlySet<SectionId>;
  onSelect: (id: SectionId) => void;
}>) {
  return (
    <nav
      aria-label="Secciones de configuración"
      className="-mx-4 overflow-x-auto px-4 md:sticky md:top-6 md:mx-0 md:self-start md:overflow-visible md:px-0"
    >
      <ul className="flex gap-2 pb-1 md:flex-col md:gap-1 md:pb-0">
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          const isActive = s.id === active;
          const isDirty = dirtyIds.has(s.id);
          return (
            <li key={s.id} className="shrink-0">
              <button
                type="button"
                onClick={() => onSelect(s.id)}
                aria-current={isActive ? "page" : undefined}
                className={`flex w-full items-center gap-2 whitespace-nowrap rounded-lg border px-3 py-2 text-sm font-medium transition md:border-transparent ${
                  isActive
                    ? "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/30 dark:bg-violet-900/20 dark:text-violet-300 md:border-violet-200 md:dark:border-violet-500/30"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10 md:bg-transparent md:dark:bg-transparent"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                <span className="md:flex-1 md:text-left">{s.label}</span>
                {isDirty && (
                  <span
                    className="h-2 w-2 shrink-0 rounded-full bg-amber-500"
                    title="Cambios sin guardar"
                    aria-label="Cambios sin guardar"
                  />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function BusinessSettingsForm({ initial }: Readonly<{ initial: BusinessData }>) {
  const utils = api.useUtils();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const rawSection = searchParams.get("seccion");
  const active: SectionId = isSectionId(rawSection) ? rawSection : DEFAULT_SECTION;
  const activeMeta = SECTIONS.find((s) => s.id === active) ?? SECTIONS[0]!;

  const [logoUrl, setLogoUrl] = useState<string | null>(initial.logoUrl);
  // `saved` = último estado confirmado por el servidor; `form` = borrador en edición
  const [saved, setSaved] = useState<SettingsForm>(() => formFromData(initial));
  const [form, setForm] = useState<SettingsForm>(() => formFromData(initial));
  const [savingSection, setSavingSection] = useState<SectionId | null>(null);
  const [error, setError] = useState<{ section: SectionId; message: string } | null>(null);

  const updateSettings = api.business.updateSettings.useMutation();

  const dirtyIds = new Set(
    SECTIONS.filter((s) => isSectionDirty(s, form, saved)).map((s) => s.id),
  );
  const hasDirty = dirtyIds.size > 0;

  // Avisa antes de cerrar/recargar si hay cambios sin guardar
  useEffect(() => {
    if (!hasDirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasDirty]);

  function selectSection(id: SectionId) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("seccion", id);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function update(patch: Partial<SettingsForm>) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  function discard(meta: SectionMeta) {
    setForm((prev) => pickSection(meta, prev, saved));
    setError(null);
  }

  // Guarda solo los campos de la sección; el resto se envía con su valor ya guardado
  function save(meta: SectionMeta) {
    const candidate = pickSection(meta, saved, form);
    const maxReg = Number.parseInt(candidate.maxCashRegisters, 10);
    if (Number.isNaN(maxReg)) {
      setError({ section: meta.id, message: "Ingresa un número de cajas válido." });
      return;
    }

    setError(null);
    setSavingSection(meta.id);
    updateSettings.mutate(toInput(candidate, maxReg), {
      onSuccess: (data) => {
        setSaved(candidate);
        toast.success(data.message);
        void utils.business.getSettings.invalidate();
      },
      onError: (err) => {
        setError({ section: meta.id, message: firstErrorMessage(err.message) });
      },
      onSettled: () => setSavingSection(null),
    });
  }

  const sectionProps = { form, saved, update };

  function renderFields() {
    switch (active) {
      case "negocio":
        return <NegocioSection {...sectionProps} document={initial.document} />;
      case "facturacion":
        return <FacturacionSection {...sectionProps} ownerEmail={initial.ownerEmail} />;
      case "productos":
        return <ProductosSection {...sectionProps} />;
      case "permisos":
        return <PermisosSection {...sectionProps} />;
      case "caja":
        return <CajaSection {...sectionProps} />;
      default:
        return null;
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-[15rem_minmax(0,1fr)]">
      <SettingsNav active={active} dirtyIds={dirtyIds} onSelect={selectSection} />

      <div className="min-w-0 space-y-6">
        {active === "negocio" && (
          <LogoCard
            logoUrl={logoUrl}
            onLogoChange={async () => {
              await utils.business.getSettings.invalidate();
              const fresh = await utils.business.getSettings.fetch();
              setLogoUrl(fresh?.logoUrl ?? null);
            }}
          />
        )}

        {active === "plan" ? (
          <PlanSection />
        ) : (
          <SectionCard
            key={active}
            title={activeMeta.label}
            description={activeMeta.description}
            dirty={dirtyIds.has(active)}
            saving={savingSection !== null}
            error={error?.section === active ? error.message : null}
            onSave={() => save(activeMeta)}
            onDiscard={() => discard(activeMeta)}
          >
            {renderFields()}
          </SectionCard>
        )}
      </div>
    </div>
  );
}

function BusinessSettingsLoader() {
  const { data: settings, isPending: loadingSettings } =
    api.business.getSettings.useQuery();

  if (loadingSettings) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Cargando configuración...
      </p>
    );
  }

  if (!settings) return null;

  return <BusinessSettingsForm initial={settings} />;
}

export function BusinessSettings() {
  // useSearchParams requiere un límite de Suspense
  return (
    <Suspense>
      <BusinessSettingsLoader />
    </Suspense>
  );
}
