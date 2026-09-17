export type InvoiceContactSource = "NONE" | "OWNER" | "BUSINESS";

export function resolveInvoiceContact(
  source: InvoiceContactSource,
  ownerValue: string | null,
  businessValue: string | null,
): string | null {
  if (source === "OWNER") return ownerValue;
  if (source === "BUSINESS") return businessValue;
  return null;
}
