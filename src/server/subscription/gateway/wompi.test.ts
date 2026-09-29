import { describe, expect, it, vi } from "vitest";

import { signedWompiEvent, WOMPI_TEST_CONFIG as config } from "../../../../tests/wompiEvents";
import { integritySignature, sha256Hex, WompiGateway } from "./wompi";

describe("WompiGateway", () => {
  const gateway = new WompiGateway(config);
  const tx = { id: "1234-1610641025-49201", status: "APPROVED", reference: "BLF-ABC-123456", amount_in_cents: 2_990_000 };

  it("firma de integridad = SHA256(referencia + monto + moneda + secreto)", () => {
    expect(integritySignature("BLF-1", 2_990_000, "COP", "s")).toBe(sha256Hex("BLF-12990000COPs"));
  });

  it("arma la URL del checkout con la firma y la URL de retorno", () => {
    const url = new URL(
      gateway.createCheckoutUrl({
        reference: "BLF-1",
        amountInCents: 2_990_000,
        currency: "COP",
        customerEmail: "dueno@cafe.co",
        redirectUrl: "https://app.billify.co/suscripcion/resultado",
      }),
    );
    expect(url.origin + url.pathname).toBe("https://checkout.wompi.co/p/");
    expect(url.searchParams.get("signature:integrity")).toBe(integritySignature("BLF-1", 2_990_000, "COP", config.integritySecret));
    expect(url.searchParams.get("redirect-url")).toBe("https://app.billify.co/suscripcion/resultado");
    expect(url.searchParams.get("customer-data:email")).toBe("dueno@cafe.co");
  });

  it("acepta un evento con firma válida y lo normaliza", () => {
    const result = gateway.parseWebhook(signedWompiEvent(tx), new Headers());
    expect(result).toEqual({
      ok: true,
      eventKey: `${tx.id}:APPROVED`,
      transaction: {
        provider: "wompi",
        transactionId: tx.id,
        reference: tx.reference,
        status: "APPROVED",
        amountInCents: tx.amount_in_cents,
        currency: "COP",
        statusMessage: null,
      },
    });
  });

  it("rechaza un evento firmado con otro secreto", () => {
    expect(gateway.parseWebhook(signedWompiEvent(tx, "otro"), new Headers())).toEqual({ ok: false, reason: "invalid_signature" });
  });

  it("rechaza un evento alterado (monto cambiado después de firmar)", () => {
    const tampered = signedWompiEvent(tx).replace("2990000", "100");
    expect(gateway.parseWebhook(tampered, new Headers())).toEqual({ ok: false, reason: "invalid_signature" });
  });

  it("rechaza si la cabecera X-Event-Checksum no coincide", () => {
    const headers = new Headers({ "x-event-checksum": "f".repeat(64) });
    expect(gateway.parseWebhook(signedWompiEvent(tx), headers)).toEqual({ ok: false, reason: "invalid_signature" });
  });

  it("JSON inválido → malformed", () => {
    expect(gateway.parseWebhook("{no-json", new Headers())).toEqual({ ok: false, reason: "malformed" });
  });

  it("consulta la transacción en sandbox con la llave pública de prueba", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ data: { ...tx, currency: "COP", status_message: null } }), { status: 200 }),
    );
    const gw = new WompiGateway({ ...config, fetchImpl });
    await expect(gw.getTransaction(tx.id)).resolves.toMatchObject({ status: "APPROVED", reference: tx.reference });
    expect(fetchImpl).toHaveBeenCalledWith(`https://sandbox.wompi.co/v1/transactions/${tx.id}`, expect.anything());
  });

  it("no consulta ids con caracteres raros", async () => {
    const fetchImpl = vi.fn();
    const gw = new WompiGateway({ ...config, fetchImpl });
    await expect(gw.getTransaction("../admin")).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
