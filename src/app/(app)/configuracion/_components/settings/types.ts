import type { LucideIcon } from "lucide-react";
import { BadgeCheck, Package, Receipt, ShieldCheck, Store, Wallet } from "lucide-react";

export type TaxFormItem = { name: string; rate: string; enabled: boolean };
export type TaxSlots = [TaxFormItem, TaxFormItem, TaxFormItem];

export type ContactSource = "NONE" | "OWNER" | "BUSINESS";
export type TaxDetail = "SUMMARY" | "PER_ITEM";

export type SettingsForm = {
  name: string;
  address: string;
  phone: string;
  email: string;
  ownerPhone: string;
  invoicePhoneSource: ContactSource;
  invoiceEmailSource: ContactSource;
  invoiceTaxDetail: TaxDetail;
  taxes: TaxSlots;
  autoTax: boolean;
  maxCashRegisters: string;
  categories: string[];
  produceModuleEnabled: boolean;
  cashiersCanEditPrices: boolean;
};

export type BusinessData = {
  id: string;
  name: string;
  document: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  invoicePhoneSource: ContactSource;
  invoiceEmailSource: ContactSource;
  invoiceTaxDetail: TaxDetail;
  ownerPhone: string | null;
  ownerEmail: string | null;
  taxes: unknown;
  autoTax: boolean;
  plan: string;
  maxCashRegisters: number;
  logoUrl: string | null;
  categories: string[];
  produceModuleEnabled: boolean;
  cashiersCanEditPrices: boolean;
};

// Props comunes de cada sección editable
export type SectionProps = Readonly<{
  form: SettingsForm;
  saved: SettingsForm;
  update: (patch: Partial<SettingsForm>) => void;
}>;

export type SectionId =
  | "negocio"
  | "facturacion"
  | "productos"
  | "permisos"
  | "caja"
  | "plan";

export type SectionMeta = {
  id: SectionId;
  label: string;
  description: string;
  icon: LucideIcon;
  // Campos del formulario que guarda esta sección (vacío = solo lectura)
  fields: ReadonlyArray<keyof SettingsForm>;
};

export const SECTIONS: readonly SectionMeta[] = [
  {
    id: "negocio",
    label: "Negocio",
    description: "Nombre, datos de contacto y logo del negocio.",
    icon: Store,
    fields: ["name", "address", "phone", "email"],
  },
  {
    id: "facturacion",
    label: "Facturación e impuestos",
    description: "Qué contacto aparece en las facturas y cómo se calculan los impuestos.",
    icon: Receipt,
    fields: [
      "ownerPhone",
      "invoicePhoneSource",
      "invoiceEmailSource",
      "autoTax",
      "taxes",
      "invoiceTaxDetail",
    ],
  },
  {
    id: "productos",
    label: "Productos e inventario",
    description: "Categorías sugeridas y venta por peso.",
    icon: Package,
    fields: ["categories", "produceModuleEnabled"],
  },
  {
    id: "permisos",
    label: "Permisos de cajeros",
    description: "Qué pueden hacer los cajeros con los productos.",
    icon: ShieldCheck,
    fields: ["cashiersCanEditPrices"],
  },
  {
    id: "caja",
    label: "Caja",
    description: "Cajas registradoras simultáneas.",
    icon: Wallet,
    fields: ["maxCashRegisters"],
  },
  {
    id: "plan",
    label: "Plan",
    description: "Tu plan actual de BILLIFY.",
    icon: BadgeCheck,
    fields: [],
  },
];

export const DEFAULT_SECTION: SectionId = "negocio";

export function isSectionId(value: string | null): value is SectionId {
  return SECTIONS.some((s) => s.id === value);
}

const DEFAULT_NAMES = ["IVA", "INC", ""] as const;

type TaxConfig = { name: string; rate: number; enabled: boolean };

export function parseTaxes(raw: unknown): TaxSlots {
  const arr = Array.isArray(raw) ? (raw as TaxConfig[]) : [];
  const get = (i: number): TaxFormItem => {
    const t = arr[i];
    return {
      name: t?.name ?? DEFAULT_NAMES[i] ?? "",
      rate: t != null ? String(t.rate) : "0",
      enabled: t?.enabled ?? false,
    };
  };
  return [get(0), get(1), get(2)];
}

export function formFromData(data: BusinessData): SettingsForm {
  return {
    name: data.name,
    address: data.address ?? "",
    phone: data.phone ?? "",
    email: data.email ?? "",
    ownerPhone: data.ownerPhone ?? "",
    invoicePhoneSource: data.invoicePhoneSource,
    invoiceEmailSource: data.invoiceEmailSource,
    invoiceTaxDetail: data.invoiceTaxDetail,
    taxes: parseTaxes(data.taxes),
    autoTax: data.autoTax,
    maxCashRegisters: String(data.maxCashRegisters),
    categories: data.categories,
    produceModuleEnabled: data.produceModuleEnabled,
    cashiersCanEditPrices: data.cashiersCanEditPrices,
  };
}

// ¿La sección tiene cambios sin guardar respecto a lo último guardado?
export function isSectionDirty(
  meta: SectionMeta,
  form: SettingsForm,
  saved: SettingsForm,
): boolean {
  return meta.fields.some(
    (field) => JSON.stringify(form[field]) !== JSON.stringify(saved[field]),
  );
}

// Copia en `base` solo los campos de la sección indicada
export function pickSection(
  meta: SectionMeta,
  base: SettingsForm,
  source: SettingsForm,
): SettingsForm {
  const next = { ...base };
  for (const field of meta.fields) {
    (next as Record<keyof SettingsForm, unknown>)[field] = source[field];
  }
  return next;
}

export function parseErrorMessage(rawMessage: string): string {
  try {
    const parsed = JSON.parse(rawMessage) as Array<{ message?: string }>;
    if (Array.isArray(parsed)) {
      const first = parsed.find((e) => e.message)?.message;
      if (first) return first;
    }
  } catch {
    // mensaje plano
  }
  return rawMessage;
}
