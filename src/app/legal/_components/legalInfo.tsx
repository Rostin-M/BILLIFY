import { LEGAL_INFO, LEGAL_UPDATED_AT } from "~/lib/legal";
import { Placeholder } from "./Placeholder";

/** Campos que todo documento necesita: si están vacíos se muestra el marcador amarillo. */
const REQUIRED = {
  ownerName: "nombre del servicio",
  contactEmail: "correo de contacto",
  privacyEmail: "correo para datos personales",
  retentionAfterCancel: "plazo de conservación tras cancelar",
} as const;

type RequiredField = keyof typeof REQUIRED;

/** Valor de un campo obligatorio (ver ~/lib/legal), o el marcador si falta. */
export function Info({ field }: Readonly<{ field: RequiredField | "updatedAt" }>) {
  if (field === "updatedAt") return <>{LEGAL_UPDATED_AT}</>;
  const value = LEGAL_INFO[field];
  return value ? <>{value}</> : <Placeholder>[{REQUIRED[field]}]</Placeholder>;
}

/** "BILLIFY Business" y, si existe, su NIT: "BILLIFY Business, NIT 901…". */
export function Provider() {
  return (
    <>
      <Info field="ownerName" />
      {LEGAL_INFO.ownerId && `, identificado con ${String(LEGAL_INFO.ownerId)}`}
    </>
  );
}

/** Domicilio con lo que haya: "Calle 1, Medellín, Colombia" o solo "Colombia". */
export function domicile(): string {
  return [LEGAL_INFO.address, LEGAL_INFO.city, "Colombia"].filter(Boolean).join(", ");
}

/** Jueces competentes: los de la ciudad de domicilio si está definida. */
export function courts(): string {
  return LEGAL_INFO.city ? `los jueces de ${String(LEGAL_INFO.city)}` : "los jueces competentes de Colombia";
}

/** Bloque de identificación que cierra cada documento. */
export function ContactBlock() {
  return (
    <ul className="space-y-1 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
      <li>
        <span className="font-medium text-slate-800 dark:text-slate-100">Responsable:</span> <Provider />
      </li>
      <li>
        <span className="font-medium text-slate-800 dark:text-slate-100">Domicilio:</span> {domicile()}
      </li>
      <li>
        <span className="font-medium text-slate-800 dark:text-slate-100">Correo:</span> <Info field="contactEmail" />
      </li>
    </ul>
  );
}
