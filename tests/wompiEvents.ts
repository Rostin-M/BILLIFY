import { createHash } from "node:crypto";

export const WOMPI_TEST_CONFIG = {
  publicKey: "pub_test_abc",
  integritySecret: "test_integrity_xyz",
  eventsSecret: "test_events_123",
};

const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

/** Evento tal como lo firma Wompi: SHA256(valores de properties + timestamp + secreto). */
export function signedWompiEvent(
  transaction: { id: string; status: string; reference: string; amount_in_cents: number; currency?: string },
  secret = WOMPI_TEST_CONFIG.eventsSecret,
  timestamp = 1_760_000_000,
): string {
  const properties = ["transaction.id", "transaction.status", "transaction.amount_in_cents"];
  const checksum = sha256(`${transaction.id}${transaction.status}${transaction.amount_in_cents}${timestamp}${secret}`);
  return JSON.stringify({
    event: "transaction.updated",
    data: { transaction: { currency: "COP", ...transaction } },
    environment: "test",
    signature: { properties, checksum },
    timestamp,
    sent_at: "2026-10-15T15:00:00.000Z",
  });
}
