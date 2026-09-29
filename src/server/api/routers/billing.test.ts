import { afterEach, describe, expect, it, vi } from "vitest";

import { sendSubscriptionEmail } from "~/server/lib/email";
import { processGatewayTransaction } from "~/server/subscription/payments";
import { runSubscriptionJob } from "~/server/subscription/jobs";
import { READ_ONLY_MESSAGE } from "~/server/subscription/service";
import {
  callerFor,
  createProduct,
  createShop,
  createUser,
  db,
  setSubscription,
} from "../../../../tests/integration/helpers";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const daysFromNow = (d: number) => new Date(Date.now() + d * DAY_MS);

afterEach(() => vi.mocked(sendSubscriptionEmail).mockClear());

/** Negocio cuya prueba gratis ya terminó (solo lectura). */
async function expiredTrialShop() {
  const shop = await createShop();
  await setSubscription(shop.business.id, {
    plan: "BUSINESS",
    status: "TRIAL",
    trialEndsAt: new Date(Date.now() - HOUR_MS),
    currentPeriodStart: null,
    currentPeriodEnd: null,
  });
  const product = await createProduct(shop.business.id, { price: 3000, stock: 50 });
  return { ...shop, product };
}

async function payWithSimulator(owner: { id: string }, plan: "BASIC" | "BUSINESS" | "PRO", outcome: "APPROVED" | "DECLINED") {
  const caller = callerFor(owner);
  const checkout = await caller.billing.checkout({ plan, cycle: "MONTHLY" });
  const payment = await caller.billing.simulatePayment({ reference: checkout.reference, outcome });
  return { checkout, payment };
}

describe("vencimiento y bloqueo", () => {
  it("un negocio nuevo arranca con 7 días de prueba en el plan Negocio", async () => {
    const { owner } = await createShop();
    const status = await callerFor(owner).billing.status();
    expect(status).toMatchObject({ phase: "TRIAL", mode: "FULL", plan: "BUSINESS", daysLeft: 7 });
    await expect(db.subscription.count()).resolves.toBe(1);
  });

  it("al vencer la prueba: bloquea ventas en el backend pero deja consultar el historial", async () => {
    const { cashier, owner, product } = await expiredTrialShop();

    await expect(
      callerFor(cashier).sale.create({ items: [{ productId: product.id, quantity: 1 }] }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", message: READ_ONLY_MESSAGE });
    await expect(callerFor(owner).product.create({ name: "Tinto", price: 2000, stock: 1 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    // Consultas: nunca se bloquean.
    await expect(callerFor(cashier).sale.list({})).resolves.toEqual([]);
    await expect(callerFor(owner).cashRegister.listHistory()).resolves.toEqual([]);
    await expect(callerFor(owner).billing.status()).resolves.toMatchObject({ phase: "READ_ONLY", mode: "READ_ONLY" });
    await expect(db.sale.count()).resolves.toBe(0);
  });

  it("en período de gracia sigue vendiendo; al terminar la gracia se bloquea", async () => {
    const { business, cashier } = await createShop();
    const product = await createProduct(business.id);

    await setSubscription(business.id, { plan: "BASIC", currentPeriodEnd: daysFromNow(-1) });
    await expect(callerFor(cashier).sale.create({ items: [{ productId: product.id, quantity: 1 }] })).resolves.toBeTruthy();
    await expect(callerFor(cashier).billing.status()).resolves.toMatchObject({ phase: "PAST_DUE", graceDaysLeft: 2 });

    await setSubscription(business.id, { plan: "BASIC", currentPeriodEnd: daysFromNow(-3.1) });
    await expect(
      callerFor(cashier).sale.create({ items: [{ productId: product.id, quantity: 1 }] }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("en solo lectura deja cerrar la caja abierta del turno", async () => {
    const { business, owner } = await createShop();
    await callerFor(owner).cashRegister.open({ openingBalance: 50_000 });
    await setSubscription(business.id, { plan: "BASIC", currentPeriodEnd: daysFromNow(-10) });

    await expect(callerFor(owner).cashRegister.addMovement({ type: "INCOME", amount: 1000, description: "Base extra" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(callerFor(owner).cashRegister.close({})).resolves.toBeTruthy();
  });
});

describe("ventas offline al vencer", () => {
  it("acepta la venta hecha sin conexión antes del bloqueo y rechaza la hecha después", async () => {
    const { cashier, product } = await expiredTrialShop(); // bloqueado hace 1 hora
    const caller = callerFor(cashier);

    await expect(
      caller.sale.create({
        items: [{ productId: product.id, quantity: 1 }],
        offlineCreatedAt: new Date(Date.now() - 2 * HOUR_MS).toISOString(),
      }),
    ).resolves.toMatchObject({ total: 3000 });

    await expect(
      caller.sale.create({
        items: [{ productId: product.id, quantity: 1 }],
        offlineCreatedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(db.sale.count()).resolves.toBe(1);
  });

  it("rechaza ventas offline anteriores al bloqueo si llegan más de un día después", async () => {
    const { business, cashier, product } = await expiredTrialShop();
    await setSubscription(business.id, {
      status: "TRIAL",
      trialEndsAt: daysFromNow(-2),
      currentPeriodStart: null,
      currentPeriodEnd: null,
    });

    await expect(
      callerFor(cashier).sale.create({
        items: [{ productId: product.id, quantity: 1 }],
        offlineCreatedAt: daysFromNow(-3).toISOString(),
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("pago → reactivación inmediata", () => {
  it("al aprobarse el pago el negocio vuelve a vender en la siguiente petición, sin intervención manual", async () => {
    const { owner, cashier, product } = await expiredTrialShop();

    const { payment } = await payWithSimulator(owner, "BASIC", "APPROVED");
    expect(payment).toMatchObject({ status: "APPROVED", kind: "PERIOD", plan: "BASIC", amountInCents: 2_990_000 });

    await expect(callerFor(cashier).sale.create({ items: [{ productId: product.id, quantity: 1 }] })).resolves.toBeTruthy();

    const sub = await db.subscription.findFirstOrThrow();
    expect(sub).toMatchObject({ status: "ACTIVE", plan: "BASIC" });
    // Estaba bloqueado: el mes cuenta desde el pago.
    const days = (sub.currentPeriodEnd!.getTime() - Date.now()) / DAY_MS;
    expect(days).toBeGreaterThan(27);
    expect(days).toBeLessThanOrEqual(31);
    await expect(db.auditLog.count({ where: { action: "SUBSCRIPTION_PAYMENT_APPROVED" } })).resolves.toBe(1);
    expect(sendSubscriptionEmail).toHaveBeenCalledTimes(1);
  });

  it("pago fallido: el pago queda rechazado y el negocio sigue en solo lectura", async () => {
    const { owner, cashier, product } = await expiredTrialShop();

    const { payment } = await payWithSimulator(owner, "BASIC", "DECLINED");
    expect(payment.status).toBe("DECLINED");

    await expect(
      callerFor(cashier).sale.create({ items: [{ productId: product.id, quantity: 1 }] }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(db.subscription.findFirstOrThrow()).resolves.toMatchObject({ currentPeriodEnd: null });
    expect(sendSubscriptionEmail).not.toHaveBeenCalled();

    // Puede reintentar con otro pago y ahí sí se reactiva.
    await payWithSimulator(owner, "BASIC", "APPROVED");
    await expect(callerFor(cashier).sale.create({ items: [{ productId: product.id, quantity: 1 }] })).resolves.toBeTruthy();
  });

  it("evento duplicado (webhook reenviado): extiende el período una sola vez", async () => {
    const { business, owner } = await createShop();
    await setSubscription(business.id, { plan: "BASIC", currentPeriodEnd: daysFromNow(5) });
    const checkout = await callerFor(owner).billing.checkout({ plan: "BASIC", cycle: "MONTHLY" });

    const tx = {
      provider: "mock" as const,
      transactionId: "tx-1",
      reference: checkout.reference,
      status: "APPROVED" as const,
      amountInCents: checkout.amountInCents,
      currency: "COP",
      statusMessage: null,
    };
    const results = await Promise.all([
      processGatewayTransaction(db, tx),
      processGatewayTransaction(db, tx),
      processGatewayTransaction(db, tx),
    ]);

    expect(results.map((r) => r.outcome).sort()).toEqual(["already_approved", "already_approved", "approved"]);
    const sub = await db.subscription.findFirstOrThrow();
    const days = (sub.currentPeriodEnd!.getTime() - Date.now()) / DAY_MS;
    expect(days).toBeGreaterThan(5 + 27); // +1 mes sobre el vencimiento, no +3
    expect(days).toBeLessThan(5 + 32);
    expect(sendSubscriptionEmail).toHaveBeenCalledTimes(1);
  });

  it("no aplica una transacción con un monto distinto al del pago", async () => {
    const { owner, cashier, product } = await expiredTrialShop();
    const checkout = await callerFor(owner).billing.checkout({ plan: "PRO", cycle: "MONTHLY" });

    const result = await processGatewayTransaction(db, {
      provider: "mock",
      transactionId: "tx-barato",
      reference: checkout.reference,
      status: "APPROVED",
      amountInCents: 100,
      currency: "COP",
      statusMessage: null,
    });

    expect(result.outcome).toBe("amount_mismatch");
    await expect(
      callerFor(cashier).sale.create({ items: [{ productId: product.id, quantity: 1 }] }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("un negocio no puede aprobar (ni ver) el pago de otro", async () => {
    const a = await createShop();
    const b = await createShop();
    const checkout = await callerFor(a.owner).billing.checkout({ plan: "BASIC", cycle: "MONTHLY" });

    await expect(
      callerFor(b.owner).billing.simulatePayment({ reference: checkout.reference, outcome: "APPROVED" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(callerFor(b.owner).billing.paymentByReference({ reference: checkout.reference })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("solo el propietario paga; el cajero ve el estado", async () => {
    const { cashier } = await createShop();
    await expect(callerFor(cashier).billing.checkout({ plan: "BASIC", cycle: "MONTHLY" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(callerFor(cashier).billing.status()).resolves.toMatchObject({ isOwner: false });
  });

  it("reutiliza el checkout pendiente ante doble clic", async () => {
    const { owner } = await createShop();
    const caller = callerFor(owner);
    const first = await caller.billing.checkout({ plan: "PRO", cycle: "ANNUAL" });
    const second = await caller.billing.checkout({ plan: "PRO", cycle: "ANNUAL" });
    expect(second.reference).toBe(first.reference);
    await expect(db.subscriptionPayment.count()).resolves.toBe(1);
  });
});

describe("upgrade a mitad de mes", () => {
  it("cobra la diferencia prorrateada, cambia el plan de inmediato y conserva el vencimiento", async () => {
    const { business, owner } = await createShop();
    const periodStart = daysFromNow(-15);
    const periodEnd = daysFromNow(15);
    await setSubscription(business.id, { plan: "BASIC", currentPeriodStart: periodStart, currentPeriodEnd: periodEnd });

    // Básico permite 2 usuarios (dueño + cajero): ya está lleno.
    await expect(
      callerFor(owner).user.createEmployee({ name: "Segundo Cajero", email: "c2@cafe.test", document: "123456" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const quote = await callerFor(owner).billing.quote({ plan: "BUSINESS", cycle: "MONTHLY" });
    // (49.900 − 29.900) × 15/30 = 10.000 (± redondeo a 100 por los milisegundos de la prueba)
    expect(quote).toMatchObject({ ok: true, kind: "UPGRADE" });
    expect(quote.ok && quote.baseAmount).toBeGreaterThanOrEqual(10_000);
    expect(quote.ok && quote.baseAmount).toBeLessThanOrEqual(10_100);

    const { payment } = await payWithSimulator(owner, "BUSINESS", "APPROVED");
    expect(payment).toMatchObject({ kind: "UPGRADE", status: "APPROVED" });

    const sub = await db.subscription.findFirstOrThrow();
    expect(sub.plan).toBe("BUSINESS");
    expect(sub.currentPeriodEnd).toEqual(periodEnd);

    // El nuevo límite aplica en la siguiente petición.
    await expect(
      callerFor(owner).user.createEmployee({ name: "Segundo Cajero", email: "c2@cafe.test", document: "123456" }),
    ).resolves.toBeTruthy();
  });

  it("downgrade pagado queda programado y aplica al empezar el nuevo período", async () => {
    const { business, owner } = await createShop();
    const periodEnd = daysFromNow(10);
    await setSubscription(business.id, { plan: "PRO", currentPeriodEnd: periodEnd });

    await payWithSimulator(owner, "BASIC", "APPROVED");
    let sub = await db.subscription.findFirstOrThrow();
    expect(sub).toMatchObject({ plan: "PRO", scheduledPlan: "BASIC", scheduledFrom: periodEnd });

    // Cuando llega la fecha, el cron lo consolida.
    await runSubscriptionJob(db, new Date(periodEnd.getTime() + HOUR_MS));
    sub = await db.subscription.findFirstOrThrow();
    expect(sub).toMatchObject({ plan: "BASIC", scheduledPlan: null, currentPeriodStart: periodEnd });
  });
});

describe("límites por plan en el backend", () => {
  it("plan Básico: sin exportaciones ni trazabilidad, 1 caja, pero el historial sí", async () => {
    const { business, owner } = await createShop();
    await setSubscription(business.id, { plan: "BASIC" });
    const caller = callerFor(owner);

    await expect(caller.sale.exportForPeriod({ period: "today" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.auditLog.list({})).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.dashboard.summary({ period: "month" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.dashboard.summary({ period: "week" })).resolves.toBeTruthy();
    await expect(caller.sale.list({})).resolves.toEqual([]);

    await expect(
      caller.business.updateSettings({ name: "Café", maxCashRegisters: 2 }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("no deja reactivar un empleado si el plan ya está lleno", async () => {
    const { business, owner } = await createShop();
    const extra = await createUser({ businessId: business.id, role: "CASHIER", isActive: false });
    await setSubscription(business.id, { plan: "BASIC" });

    await expect(
      callerFor(owner).user.setActive({ employeeId: extra.id, isActive: true }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("cron diario", () => {
  it("marca la prueba vencida como solo lectura y avisa una sola vez aunque corra dos veces", async () => {
    await expiredTrialShop();

    const first = await runSubscriptionJob(db);
    const second = await runSubscriptionJob(db);

    await expect(db.subscription.findFirstOrThrow()).resolves.toMatchObject({ status: "READ_ONLY" });
    expect(first).toMatchObject({ statusUpdated: 1, noticesSent: 1 });
    expect(second).toMatchObject({ statusUpdated: 0, noticesSent: 0 });
    expect(sendSubscriptionEmail).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendSubscriptionEmail).mock.calls[0]![2].subject).toBe("Tu cuenta está en solo lectura");
  });

  it("envía el recordatorio de 7 días antes del vencimiento", async () => {
    const { business } = await createShop();
    await setSubscription(business.id, { plan: "BASIC", currentPeriodEnd: daysFromNow(6.5) });

    await runSubscriptionJob(db);

    expect(vi.mocked(sendSubscriptionEmail).mock.calls[0]![2].subject).toBe("Tu plan vence en 7 días");
    await expect(db.subscriptionNotice.findFirstOrThrow()).resolves.toMatchObject({ kind: "renewal_7d" });
  });

  it("si el correo falla, libera el aviso para reintentar al día siguiente", async () => {
    await expiredTrialShop();
    vi.mocked(sendSubscriptionEmail).mockRejectedValueOnce(new Error("Brevo caído"));

    const report = await runSubscriptionJob(db);

    expect(report.noticeErrors).toBe(1);
    await expect(db.subscriptionNotice.count()).resolves.toBe(0);
  });

  it("marca como vencidos los pagos pendientes de más de 24 h", async () => {
    const { owner } = await createShop();
    const checkout = await callerFor(owner).billing.checkout({ plan: "BASIC", cycle: "MONTHLY" });
    await db.subscriptionPayment.update({ where: { id: checkout.paymentId }, data: { createdAt: daysFromNow(-2) } });

    const report = await runSubscriptionJob(db);

    expect(report.paymentsExpired).toBe(1);
    await expect(db.subscriptionPayment.findFirstOrThrow()).resolves.toMatchObject({ status: "EXPIRED" });
  });
});
