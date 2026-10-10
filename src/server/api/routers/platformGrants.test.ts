import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type GrantPlanInput } from "~/lib/platform/contract";
import { sendSubscriptionEmail } from "~/server/lib/email";
import { runSubscriptionJob } from "~/server/subscription/jobs";
import { READ_ONLY_MESSAGE, SUBSCRIPTION_SELECT } from "~/server/subscription/service";
import {
  callerFor,
  createBusiness,
  createProduct,
  createShop,
  createUser,
  db,
  setSubscription,
} from "../../../../tests/integration/helpers";

const ADMIN_EMAIL = "admin@billify.test";
const DAY_MS = 24 * 60 * 60 * 1000;
const daysFromNow = (d: number) => new Date(Date.now() + d * DAY_MS);
/** Fechas calculadas con el reloj del test y con el del servidor: se comparan con tolerancia. */
const near = (date: Date | null | undefined, expected: Date) =>
  expect(Math.abs((date?.getTime() ?? 0) - expected.getTime())).toBeLessThan(10_000);

const createAdmin = () =>
  createUser({ businessId: null, role: "SUPERADMIN", name: "Admin Plataforma", email: ADMIN_EMAIL });

const subscriptionOf = (businessId: string) =>
  db.subscription.findUniqueOrThrow({ where: { businessId }, select: { ...SUBSCRIPTION_SELECT, status: true } });

const trial = (days: number) => ({
  plan: "BUSINESS" as const,
  status: "TRIAL" as const,
  trialEndsAt: daysFromNow(days),
  currentPeriodStart: null,
  currentPeriodEnd: null,
});

/** Activación de cortesía de 30 días al final de lo vigente, sin correo. */
const courtesy = (businessId: string, overrides: Partial<GrantPlanInput> = {}): GrantPlanInput => ({
  businessId,
  plan: "BUSINESS",
  days: 30,
  reason: "COURTESY",
  start: "AFTER_CURRENT",
  notifyOwner: false,
  ...overrides,
});

async function setup(sub?: Parameters<typeof setSubscription>[1]) {
  const admin = await createAdmin();
  const shop = await createShop({ name: "Café Central" });
  if (sub) await setSubscription(shop.business.id, sub);
  return { admin, ...shop, platform: callerFor(admin, { ip: "10.0.0.9" }).platform };
}

const lastGrant = (businessId: string) =>
  db.subscriptionPayment.findFirstOrThrow({ where: { businessId, kind: "MANUAL" }, orderBy: { createdAt: "desc" } });

beforeEach(() => vi.stubEnv("PLATFORM_ADMIN_EMAILS", ADMIN_EMAIL));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.mocked(sendSubscriptionEmail).mockReset();
});

describe("permisos de las acciones de plataforma", () => {
  it("propietarios y cajeros no pueden activar, extender, revocar, resolver ni listar", async () => {
    const { owner, cashier, business } = await createShop();
    const payment = await db.subscriptionPayment.create({
      data: {
        subscriptionId: (await setSubscription(business.id)).id,
        businessId: business.id,
        reference: "BLF-TEST-000001",
        provider: "manual",
        kind: "MANUAL",
        plan: "PRO",
        billingCycle: "MONTHLY",
        amountInCents: 0,
        status: "APPROVED",
        needsReview: true,
      },
    });
    const before = await subscriptionOf(business.id);

    for (const user of [owner, cashier, null]) {
      const { platform } = callerFor(user);
      const code = user ? "FORBIDDEN" : "UNAUTHORIZED";
      await expect(platform.grantPlan(courtesy(business.id, { plan: "PRO", days: 366 }))).rejects.toMatchObject({ code });
      await expect(platform.extendTrial({ businessId: business.id, days: 30 })).rejects.toMatchObject({ code });
      await expect(
        platform.revokeGrant({ paymentId: payment.id, note: "No aplica", notifyOwner: false }),
      ).rejects.toMatchObject({ code });
      await expect(platform.resolvePaymentReview({ paymentId: payment.id, note: "Revisado" })).rejects.toMatchObject({
        code,
      });
      await expect(platform.listPayments({})).rejects.toMatchObject({ code });
      await expect(platform.listAudit({})).rejects.toMatchObject({ code });
    }

    await expect(subscriptionOf(business.id)).resolves.toEqual(before);
    await expect(db.subscriptionPayment.count()).resolves.toBe(1);
    await expect(db.subscriptionPayment.findUniqueOrThrow({ where: { id: payment.id } })).resolves.toMatchObject({
      needsReview: true,
      revokedAt: null,
    });
    await expect(db.platformAuditLog.count()).resolves.toBe(0);
  });
});

describe("platform.grantPlan", () => {
  it("en prueba: los días empiezan al terminar la prueba; registra pago, foto y bitácora", async () => {
    const { admin, business, platform } = await setup(trial(3));
    const before = await subscriptionOf(business.id);

    const result = await platform.grantPlan(
      courtesy(business.id, {
        reason: "MANUAL_PAYMENT",
        amountCop: 49_900,
        externalReference: "  M1234567 ",
        note: " Pagó por Nequi ",
      }),
    );

    expect(result).toMatchObject({
      businessId: business.id,
      ownerNotified: false,
      subscription: { plan: "BUSINESS", phase: "ACTIVE", daysLeft: 33, graceDaysLeft: 0 },
    });
    near(result.periodStart, daysFromNow(3));
    near(result.periodEnd, daysFromNow(33));

    const sub = await subscriptionOf(business.id);
    expect(sub).toMatchObject({ plan: "BUSINESS", status: "ACTIVE", canceledAt: null, scheduledPlan: null });
    expect(sub.currentPeriodEnd).toEqual(result.periodEnd);
    expect(sub.currentPeriodStart).toEqual(before.trialEndsAt);

    const payment = await lastGrant(business.id);
    expect(payment).toMatchObject({
      provider: "manual",
      kind: "MANUAL",
      status: "APPROVED",
      plan: "BUSINESS",
      amountInCents: 4_990_000,
      vatInCents: 0,
      currency: "COP",
      createdById: admin.id,
      grantReason: "MANUAL_PAYMENT",
      grantDays: 30,
      grantNote: "Pagó por Nequi",
      externalReference: "M1234567",
      periodStart: result.periodStart,
      periodEnd: result.periodEnd,
      needsReview: false,
      revokedAt: null,
    });
    expect(payment.reference).toMatch(/^BLF-[A-Z0-9-]{6,60}$/);
    expect(payment.paidAt).not.toBeNull();
    expect(payment.grantSnapshot).toMatchObject({
      plan: "BUSINESS",
      trialEndsAt: before.trialEndsAt!.toISOString(),
      currentPeriodStart: null,
      currentPeriodEnd: null,
    });

    const audit = await db.platformAuditLog.findMany();
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      adminId: admin.id,
      adminEmail: ADMIN_EMAIL,
      adminName: "Admin Plataforma",
      action: "GRANT_PLAN",
      businessId: business.id,
      businessName: "Café Central",
      entityType: "SubscriptionPayment",
      entityId: payment.id,
      ip: "10.0.0.9",
      userAgent: "vitest",
      detail: { plan: "BUSINESS", days: 30, reason: "MANUAL_PAYMENT", start: "AFTER_CURRENT", amountCop: 49_900 },
    });
    expect(audit[0]!.summary).toContain("Activó el plan Negocio por 30 días (Pago manual (Nequi / transferencia))");
    expect(sendSubscriptionEmail).not.toHaveBeenCalled();
  });

  it("activo con plan distinto: queda programado y el negocio sigue con su plan", async () => {
    const { business, owner, platform } = await setup({ plan: "BASIC", currentPeriodEnd: daysFromNow(10) });
    const before = await subscriptionOf(business.id);

    const result = await platform.grantPlan(courtesy(business.id, { plan: "PRO" }));

    expect(result.subscription).toMatchObject({ plan: "BASIC", phase: "ACTIVE", daysLeft: 40 });
    expect(result.periodStart).toEqual(before.currentPeriodEnd);
    await expect(subscriptionOf(business.id)).resolves.toMatchObject({
      plan: "BASIC",
      status: "ACTIVE",
      currentPeriodStart: before.currentPeriodStart,
      currentPeriodEnd: result.periodEnd,
      scheduledPlan: "PRO",
      scheduledCycle: "MONTHLY",
      scheduledFrom: before.currentPeriodEnd,
    });
    // Los límites siguen siendo los del plan vigente (Básico: 2 usuarios, ya ocupados).
    await expect(
      callerFor(owner).user.createEmployee({ name: "Otro Cajero", document: "1234567", email: "otro@cafe.co" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(db.platformAuditLog.findFirstOrThrow()).resolves.toMatchObject({
      summary: expect.stringContaining("programado al terminar lo vigente") as string,
    });

    // Con un cambio ya programado solo se puede activar "desde hoy".
    await expect(platform.grantPlan(courtesy(business.id, { plan: "PRO", days: 5 }))).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: 'Este negocio ya tiene un cambio de plan programado. Usa "desde hoy" para reemplazarlo.',
    });
    await expect(db.subscriptionPayment.count()).resolves.toBe(1);
  });

  it("cancelado: suma al final de lo pagado y reactiva", async () => {
    const { business, platform } = await setup({
      plan: "PRO",
      currentPeriodEnd: daysFromNow(10),
      canceledAt: daysFromNow(-2),
      status: "CANCELED",
    });

    const result = await platform.grantPlan(courtesy(business.id, { plan: "PRO", days: 20 }));

    expect(result.subscription).toMatchObject({ plan: "PRO", phase: "ACTIVE", daysLeft: 30 });
    await expect(subscriptionOf(business.id)).resolves.toMatchObject({ status: "ACTIVE", canceledAt: null });
  });

  it("en gracia: los días cuentan desde la fecha en que venció", async () => {
    const { business, platform } = await setup({
      plan: "BASIC",
      currentPeriodEnd: daysFromNow(-1),
      status: "PAST_DUE",
    });
    const before = await subscriptionOf(business.id);

    const result = await platform.grantPlan(courtesy(business.id, { plan: "PRO", reason: "COMPENSATION" }));

    // Plan distinto, pero el período nuevo ya empezó: aplica de inmediato.
    expect(result.subscription).toMatchObject({ plan: "PRO", phase: "ACTIVE", daysLeft: 29 });
    expect(result.periodStart).toEqual(before.currentPeriodEnd);
    await expect(subscriptionOf(business.id)).resolves.toMatchObject({ plan: "PRO", status: "ACTIVE", scheduledPlan: null });
  });

  it("solo lectura: el negocio vuelve a vender en cuanto se activa el plan", async () => {
    const { business, cashier, owner, platform } = await setup({ ...trial(-2), status: "READ_ONLY" });
    const product = await createProduct(business.id, { price: 3000, stock: 50 });
    const sell = () => callerFor(cashier).sale.create({ items: [{ productId: product.id, quantity: 1 }] });

    await expect(sell()).rejects.toMatchObject({ code: "FORBIDDEN", message: READ_ONLY_MESSAGE });

    const result = await platform.grantPlan(courtesy(business.id, { plan: "BASIC", days: 7 }));

    expect(result.subscription).toMatchObject({ plan: "BASIC", phase: "ACTIVE", daysLeft: 7 });
    near(result.periodStart, new Date());
    await expect(subscriptionOf(business.id)).resolves.toMatchObject({ plan: "BASIC", status: "ACTIVE" });
    await expect(sell()).resolves.toBeTruthy();
    await expect(callerFor(owner).billing.status()).resolves.toMatchObject({ phase: "ACTIVE", mode: "FULL", plan: "BASIC" });
    // El dueño ve la activación en su historial de pagos.
    await expect(callerFor(owner).billing.payments()).resolves.toMatchObject([
      { kind: "MANUAL", provider: "manual", status: "APPROVED", amountInCents: 0, grantDays: 7, revokedAt: null },
    ]);
  });

  it('"desde hoy" reemplaza lo vigente, incluido un cambio programado', async () => {
    const { business, platform } = await setup({
      plan: "BASIC",
      currentPeriodEnd: daysFromNow(40),
      scheduledPlan: "BUSINESS",
      scheduledCycle: "ANNUAL",
      scheduledFrom: daysFromNow(10),
    });

    const result = await platform.grantPlan(courtesy(business.id, { plan: "PRO", days: 15, start: "NOW" }));

    expect(result.subscription).toMatchObject({ plan: "PRO", phase: "ACTIVE", daysLeft: 15 });
    near(result.periodStart, new Date());
    await expect(subscriptionOf(business.id)).resolves.toMatchObject({
      plan: "PRO",
      billingCycle: "MONTHLY",
      currentPeriodStart: result.periodStart,
      currentPeriodEnd: result.periodEnd,
      scheduledPlan: null,
      scheduledCycle: null,
      scheduledFrom: null,
    });
    await expect(db.platformAuditLog.findFirstOrThrow()).resolves.toMatchObject({
      summary: expect.stringContaining("reemplazó 40 días vigentes") as string,
      detail: { lostDays: 40, start: "NOW" },
    });
  });

  it("consolida un cambio programado que ya empezó antes de aplicar la activación", async () => {
    const { business, platform } = await setup({
      plan: "BASIC",
      currentPeriodStart: daysFromNow(-40),
      currentPeriodEnd: daysFromNow(20),
      scheduledPlan: "PRO",
      scheduledCycle: "ANNUAL",
      scheduledFrom: daysFromNow(-5),
    });
    const before = await subscriptionOf(business.id);

    // PRO ya es el plan efectivo: activar PRO solo extiende.
    const result = await platform.grantPlan(courtesy(business.id, { plan: "PRO" }));

    expect(result.subscription).toMatchObject({ plan: "PRO", billingCycle: "ANNUAL", daysLeft: 50 });
    await expect(subscriptionOf(business.id)).resolves.toMatchObject({
      plan: "PRO",
      billingCycle: "ANNUAL",
      currentPeriodStart: before.scheduledFrom,
      scheduledPlan: null,
      scheduledCycle: null,
      scheduledFrom: null,
    });
  });

  it("crea la suscripción si el negocio no la tenía", async () => {
    const admin = await createAdmin();
    const business = await createBusiness();

    const result = await callerFor(admin).platform.grantPlan(courtesy(business.id, { plan: "PRO", start: "NOW" }));

    expect(result.subscription).toMatchObject({ plan: "PRO", phase: "ACTIVE", daysLeft: 30 });
    await expect(db.subscription.count({ where: { businessId: business.id } })).resolves.toBe(1);
  });

  it("valida el monto según el motivo, los días, los textos y el negocio", async () => {
    const { business, platform } = await setup(trial(3));
    const bad = { code: "BAD_REQUEST" };

    await expect(platform.grantPlan(courtesy(business.id, { reason: "MANUAL_PAYMENT" }))).rejects.toMatchObject({
      ...bad,
      message: "Indica el valor que pagó el negocio.",
    });
    await expect(
      platform.grantPlan(courtesy(business.id, { reason: "MANUAL_PAYMENT", amountCop: 0 })),
    ).rejects.toMatchObject(bad);
    await expect(platform.grantPlan(courtesy(business.id, { amountCop: 10_000 }))).rejects.toMatchObject(bad);
    for (const amountCop of [-1, 1000.5, 20_000_001]) {
      await expect(
        platform.grantPlan(courtesy(business.id, { reason: "MANUAL_PAYMENT", amountCop })),
      ).rejects.toMatchObject(bad);
    }
    for (const days of [0, -5, 1.5, 367]) {
      await expect(platform.grantPlan(courtesy(business.id, { days }))).rejects.toMatchObject(bad);
    }
    await expect(platform.grantPlan(courtesy(business.id, { note: "x".repeat(501) }))).rejects.toMatchObject(bad);
    await expect(
      platform.grantPlan(courtesy(business.id, { externalReference: "x".repeat(81) })),
    ).rejects.toMatchObject(bad);
    await expect(
      platform.grantPlan({ ...courtesy(business.id), plan: "GOLD" } as unknown as GrantPlanInput),
    ).rejects.toMatchObject(bad);
    await expect(platform.grantPlan(courtesy("no-existe"))).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Negocio no encontrado.",
    });

    await expect(db.subscriptionPayment.count()).resolves.toBe(0);
    await expect(db.platformAuditLog.count()).resolves.toBe(0);
    await expect(subscriptionOf(business.id)).resolves.toMatchObject({ status: "TRIAL", currentPeriodEnd: null });

    // Límites válidos; textos vacíos equivalen a no enviarlos.
    await expect(
      platform.grantPlan(courtesy(business.id, { days: 366, amountCop: 0, note: "  ", externalReference: "" })),
    ).resolves.toMatchObject({ subscription: { daysLeft: 369 } });
    await expect(lastGrant(business.id)).resolves.toMatchObject({ grantNote: null, externalReference: null });
  });

  it("separa el IVA incluido en un pago manual cuando la tarifa está configurada", async () => {
    const service = await import("~/server/subscription/service");
    const vat = vi.spyOn(service, "vatConfig").mockReturnValue({ rate: 0.19, pricesIncludeVat: true });
    const { business, platform } = await setup(trial(3));

    await platform.grantPlan(courtesy(business.id, { reason: "MANUAL_PAYMENT", amountCop: 119_000 }));

    await expect(lastGrant(business.id)).resolves.toMatchObject({ amountInCents: 11_900_000, vatInCents: 1_900_000 });
    vat.mockRestore();
  });
});

describe("platform.grantPlan: doble envío", () => {
  it("rechaza la misma activación repetida en menos de un minuto (doble clic)", async () => {
    const { business, platform } = await setup(trial(3));
    const input = courtesy(business.id, { note: "Cortesía de bienvenida" });

    const first = await platform.grantPlan(input);
    await expect(platform.grantPlan(input)).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Ya registraste esta misma acción hace un momento. Revisa el historial del negocio antes de repetirla.",
    });

    await expect(db.subscriptionPayment.count()).resolves.toBe(1);
    await expect(db.platformAuditLog.count()).resolves.toBe(1);
    await expect(subscriptionOf(business.id)).resolves.toMatchObject({ currentPeriodEnd: first.periodEnd });
  });

  it("dos envíos simultáneos idénticos: solo uno se aplica", async () => {
    const { business, platform } = await setup({ ...trial(-2) });
    const input = courtesy(business.id, { plan: "PRO" });

    const results = await Promise.allSettled([platform.grantPlan(input), platform.grantPlan(input)]);

    expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({ reason: { code: "CONFLICT" } });
    await expect(db.subscriptionPayment.count()).resolves.toBe(1);
    await expect(subscriptionOf(business.id)).resolves.toMatchObject({ plan: "PRO", status: "ACTIVE" });
    const sub = await subscriptionOf(business.id);
    near(sub.currentPeriodEnd, daysFromNow(30));
  });

  it("permite una activación distinta enseguida, y la misma pasado el minuto", async () => {
    const { business, platform } = await setup(trial(3));
    const input = courtesy(business.id);

    await platform.grantPlan(input);
    await expect(platform.grantPlan({ ...input, days: 31 })).resolves.toMatchObject({ subscription: { daysLeft: 64 } });
    await expect(platform.grantPlan({ ...input, note: "Segundo mes" })).resolves.toBeTruthy();

    await db.subscriptionPayment.updateMany({ data: { createdAt: new Date(Date.now() - 61_000) } });
    await expect(platform.grantPlan(input)).resolves.toBeTruthy();
    await expect(db.subscriptionPayment.count()).resolves.toBe(4);
  });

  it("un mismo comprobante no activa dos veces al mismo negocio, pero sí a otro", async () => {
    const { business, platform } = await setup(trial(3));
    const other = await createShop();
    const paid = (businessId: string, overrides: Partial<GrantPlanInput> = {}) =>
      courtesy(businessId, { reason: "MANUAL_PAYMENT", amountCop: 49_900, externalReference: "M-777", ...overrides });

    await platform.grantPlan(paid(business.id));
    const first = await lastGrant(business.id);
    await expect(platform.grantPlan(paid(business.id, { days: 60, externalReference: "m-777" }))).rejects.toMatchObject({
      code: "CONFLICT",
      message: `El comprobante m-777 ya se usó en otra activación de este negocio (${first.reference}).`,
    });
    await expect(platform.grantPlan(paid(other.business.id))).resolves.toBeTruthy();

    // Si la primera se revoca, el comprobante se puede volver a registrar.
    await platform.revokeGrant({ paymentId: first.id, note: "Se registró con los días mal", notifyOwner: false });
    await expect(platform.grantPlan(paid(business.id, { days: 60 }))).resolves.toBeTruthy();
  });
});

describe("platform.grantPlan: correo al propietario", () => {
  it("avisa al propietario activo cuando se pide", async () => {
    const { business, owner, platform } = await setup(trial(-1));

    const result = await platform.grantPlan(
      courtesy(business.id, {
        plan: "PRO",
        reason: "MANUAL_PAYMENT",
        amountCop: 79_900,
        externalReference: "M-1",
        notifyOwner: true,
      }),
    );

    expect(result.ownerNotified).toBe(true);
    expect(sendSubscriptionEmail).toHaveBeenCalledTimes(1);
    const [to, name, email] = vi.mocked(sendSubscriptionEmail).mock.calls[0]!;
    expect([to, name]).toEqual([owner.email, owner.name]);
    expect(email.subject).toBe("Activamos tu plan");
    expect(email.paragraphs[0]).toContain("Activamos el plan Pro de Café Central por 30 días");
    expect(email.paragraphs[1]).toContain("(comprobante M-1)");
    expect(email.paragraphs[1]).toContain((await lastGrant(business.id)).reference);
  });

  it("si el correo falla, la activación queda aplicada y se informa ownerNotified: false", async () => {
    const { business, platform } = await setup(trial(-1));
    vi.mocked(sendSubscriptionEmail).mockRejectedValueOnce(new Error("Brevo caído"));
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await platform.grantPlan(courtesy(business.id, { notifyOwner: true }));

    expect(result).toMatchObject({ ownerNotified: false, subscription: { phase: "ACTIVE" } });
    await expect(subscriptionOf(business.id)).resolves.toMatchObject({ status: "ACTIVE" });
    await expect(db.subscriptionPayment.count()).resolves.toBe(1);
    logged.mockRestore();
  });

  it("sin propietario activo no hay a quién avisar", async () => {
    const { business, owner, platform } = await setup(trial(-1));
    await db.user.update({ where: { id: owner.id }, data: { isActive: false } });

    await expect(platform.grantPlan(courtesy(business.id, { notifyOwner: true }))).resolves.toMatchObject({
      ownerNotified: false,
    });
    expect(sendSubscriptionEmail).not.toHaveBeenCalled();
  });
});

describe("platform.extendTrial", () => {
  it("prueba vigente: suma los días al final", async () => {
    const { admin, business, platform } = await setup(trial(2));
    const before = await subscriptionOf(business.id);

    const result = await platform.extendTrial({ businessId: business.id, days: 7, note: " Pidió más tiempo " });

    expect(result).toMatchObject({
      businessId: business.id,
      periodStart: null,
      ownerNotified: false,
      subscription: { plan: "BUSINESS", phase: "TRIAL", daysLeft: 9 },
    });
    expect(result.periodEnd).toEqual(new Date(before.trialEndsAt!.getTime() + 7 * DAY_MS));
    await expect(subscriptionOf(business.id)).resolves.toMatchObject({
      status: "TRIAL",
      trialEndsAt: result.periodEnd,
      currentPeriodEnd: null,
    });
    await expect(db.subscriptionPayment.count()).resolves.toBe(0);
    await expect(db.platformAuditLog.findFirstOrThrow()).resolves.toMatchObject({
      adminId: admin.id,
      action: "EXTEND_TRIAL",
      businessId: business.id,
      entityType: "Subscription",
      ip: "10.0.0.9",
      userAgent: "vitest",
      summary: expect.stringContaining("Extendió la prueba 7 días") as string,
      detail: { days: 7, note: "Pidió más tiempo", previousTrialEndsAt: before.trialEndsAt!.toISOString() },
    });
  });

  it("prueba vencida: cuenta desde hoy y el negocio vuelve a vender", async () => {
    const { business, cashier, platform } = await setup({ ...trial(-5), status: "READ_ONLY" });
    const product = await createProduct(business.id);
    const sell = () => callerFor(cashier).sale.create({ items: [{ productId: product.id, quantity: 1 }] });
    await expect(sell()).rejects.toMatchObject({ code: "FORBIDDEN" });

    const result = await platform.extendTrial({ businessId: business.id, days: 1 });

    expect(result.subscription).toMatchObject({ phase: "TRIAL", daysLeft: 1 });
    near(result.periodEnd, daysFromNow(1));
    await expect(subscriptionOf(business.id)).resolves.toMatchObject({ status: "TRIAL" });
    await expect(sell()).resolves.toBeTruthy();
  });

  it("solo aplica a negocios que nunca han pagado, y valida los días", async () => {
    const { business, platform } = await setup({ plan: "BASIC", currentPeriodEnd: daysFromNow(-10) });

    await expect(platform.extendTrial({ businessId: business.id, days: 7 })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: 'Este negocio ya tuvo un plan pagado: la prueba no se puede extender. Usa "Activar plan".',
    });
    for (const days of [0, 31, 2.5]) {
      await expect(platform.extendTrial({ businessId: business.id, days })).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    }
    await expect(platform.extendTrial({ businessId: "no-existe", days: 7 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(db.platformAuditLog.count()).resolves.toBe(0);
  });

  it("rechaza el doble envío, también simultáneo", async () => {
    const { business, platform } = await setup(trial(2));
    const input = { businessId: business.id, days: 7 };

    const results = await Promise.allSettled([platform.extendTrial(input), platform.extendTrial(input)]);
    expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    await expect(platform.extendTrial(input)).rejects.toMatchObject({ code: "CONFLICT" });

    const sub = await subscriptionOf(business.id);
    near(sub.trialEndsAt, daysFromNow(9));
    // Otra cantidad de días sí es una acción distinta.
    await expect(platform.extendTrial({ ...input, days: 3 })).resolves.toMatchObject({ subscription: { daysLeft: 12 } });
    await expect(db.platformAuditLog.count()).resolves.toBe(2);
  });
});

describe("platform.revokeGrant", () => {
  const revoke = (paymentId: string, notifyOwner = false) => ({
    paymentId,
    note: "Se registró por error",
    notifyOwner,
  });

  it("restaura la suscripción exactamente como estaba antes de la activación", async () => {
    const starts = [
      ["prueba", trial(3)],
      ["cancelado con otro plan", { plan: "BASIC" as const, currentPeriodEnd: daysFromNow(10), canceledAt: daysFromNow(-2), status: "CANCELED" as const }],
      ["en gracia", { plan: "PRO" as const, billingCycle: "ANNUAL" as const, currentPeriodEnd: daysFromNow(-1), status: "PAST_DUE" as const }],
      [
        "cambio programado pendiente",
        {
          plan: "BASIC" as const,
          currentPeriodEnd: daysFromNow(40),
          scheduledPlan: "BUSINESS" as const,
          scheduledCycle: "ANNUAL" as const,
          scheduledFrom: daysFromNow(10),
        },
      ],
      [
        "cambio programado ya empezado y sin consolidar",
        {
          plan: "BASIC" as const,
          currentPeriodEnd: daysFromNow(20),
          scheduledPlan: "PRO" as const,
          scheduledCycle: "ANNUAL" as const,
          scheduledFrom: daysFromNow(-5),
        },
      ],
    ] as const;
    const admin = await createAdmin();
    const { platform } = callerFor(admin);

    for (const [name, sub] of starts) {
      const { business } = await createShop();
      await setSubscription(business.id, sub);
      const before = await subscriptionOf(business.id);

      await platform.grantPlan(courtesy(business.id, { plan: "PRO", days: 90, start: "NOW" }));
      expect((await subscriptionOf(business.id)).currentPeriodEnd, name).not.toEqual(before.currentPeriodEnd);
      const payment = await lastGrant(business.id);

      const result = await platform.revokeGrant(revoke(payment.id));

      // Todo igual salvo `status`, que refleja la fase de hoy.
      const restored = await subscriptionOf(business.id);
      expect({ ...restored, status: null }, name).toEqual({ ...before, status: null });
      expect(result.ownerNotified, name).toBe(false);
      expect(result.subscription.endsAt, name).toEqual(before.currentPeriodEnd ?? before.trialEndsAt);
    }
  });

  it("marca el pago como revocado sin borrarlo, deja bitácora y la columna status coherente", async () => {
    const { admin, business, cashier, platform } = await setup({ ...trial(-2), status: "READ_ONLY" });
    const product = await createProduct(business.id);
    const sell = () => callerFor(cashier).sale.create({ items: [{ productId: product.id, quantity: 1 }] });
    await platform.grantPlan(courtesy(business.id, { plan: "PRO" }));
    await expect(sell()).resolves.toBeTruthy();
    const payment = await lastGrant(business.id);

    const result = await platform.revokeGrant({ ...revoke(payment.id), note: "  Se registró por error  " });

    expect(result).toMatchObject({
      businessId: business.id,
      subscription: { plan: "BUSINESS", phase: "READ_ONLY", daysLeft: 0 },
      periodStart: null,
      ownerNotified: false,
    });
    await expect(subscriptionOf(business.id)).resolves.toMatchObject({ status: "READ_ONLY", currentPeriodEnd: null });
    // Sin la activación, el negocio vuelve a estar en solo lectura.
    await expect(sell()).rejects.toMatchObject({ code: "FORBIDDEN", message: READ_ONLY_MESSAGE });

    const revoked = await db.subscriptionPayment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(revoked).toMatchObject({
      status: "APPROVED",
      kind: "MANUAL",
      revokedById: admin.id,
      revokeNote: "Se registró por error",
      periodEnd: payment.periodEnd,
    });
    expect(revoked.revokedAt).not.toBeNull();
    await expect(db.platformAuditLog.findFirstOrThrow({ where: { action: "REVOKE_GRANT" } })).resolves.toMatchObject({
      adminId: admin.id,
      businessId: business.id,
      entityType: "SubscriptionPayment",
      entityId: payment.id,
      ip: "10.0.0.9",
      summary: `Revocó la activación ${payment.reference} (plan Pro, 30 días): Se registró por error`,
      detail: { note: "Se registró por error", replaced: { plan: "PRO" } },
    });
    expect(sendSubscriptionEmail).not.toHaveBeenCalled();

    // Revocar dos veces no hace nada más.
    await expect(platform.revokeGrant(revoke(payment.id))).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Esta activación ya estaba revocada.",
    });
    await expect(db.platformAuditLog.count({ where: { action: "REVOKE_GRANT" } })).resolves.toBe(1);
  });

  it("dos revocaciones simultáneas: solo una se aplica", async () => {
    const { business, platform } = await setup(trial(3));
    await platform.grantPlan(courtesy(business.id));
    const payment = await lastGrant(business.id);

    const results = await Promise.allSettled([
      platform.revokeGrant(revoke(payment.id)),
      platform.revokeGrant(revoke(payment.id)),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    await expect(db.platformAuditLog.count({ where: { action: "REVOKE_GRANT" } })).resolves.toBe(1);
  });

  it("rechaza si hay un pago aprobado posterior", async () => {
    const { business, owner, platform } = await setup(trial(3));
    await platform.grantPlan(courtesy(business.id));
    const grant = await lastGrant(business.id);
    const afterGrant = await subscriptionOf(business.id);

    // El dueño renueva por la pasarela después de la activación.
    const checkout = await callerFor(owner).billing.checkout({ plan: "BUSINESS", cycle: "MONTHLY" });
    await callerFor(owner).billing.simulatePayment({ reference: checkout.reference, outcome: "DECLINED" });
    // Un pago rechazado no impide revocar... (se comprueba con la vista previa, sin revocar)
    await expect(platform.getBusiness({ businessId: business.id })).resolves.toMatchObject({
      recentPayments: [{ status: "DECLINED" }, { id: grant.id, grant: { revocable: true } }],
    });
    const second = await callerFor(owner).billing.checkout({ plan: "PRO", cycle: "ANNUAL" });
    await callerFor(owner).billing.simulatePayment({ reference: second.reference, outcome: "APPROVED" });
    const afterPayment = await subscriptionOf(business.id);
    expect(afterPayment.currentPeriodEnd).not.toEqual(afterGrant.currentPeriodEnd);

    // ...pero uno aprobado sí: la foto ya no corresponde al estado actual.
    await expect(platform.revokeGrant(revoke(grant.id))).rejects.toMatchObject({
      code: "CONFLICT",
      message:
        "Solo se puede revocar la activación más reciente del negocio, y si no hay pagos aprobados después de ella.",
    });
    await expect(subscriptionOf(business.id)).resolves.toEqual(afterPayment);
    await expect(db.subscriptionPayment.findUniqueOrThrow({ where: { id: grant.id } })).resolves.toMatchObject({
      revokedAt: null,
    });
    await expect(platform.getBusiness({ businessId: business.id })).resolves.toMatchObject({
      recentPayments: [{ kind: "PERIOD", grant: null }, { status: "DECLINED" }, { grant: { revocable: false } }],
    });
  });

  it("varias activaciones se deshacen en orden inverso, una por una", async () => {
    const { business, platform } = await setup(trial(3));
    const original = await subscriptionOf(business.id);
    await platform.grantPlan(courtesy(business.id, { days: 10 }));
    const first = await lastGrant(business.id);
    const afterFirst = await subscriptionOf(business.id);
    // Las dos activaciones caen en el mismo milisegundo en un test: se separan como en la vida real.
    await db.subscriptionPayment.update({
      where: { id: first.id },
      data: { paidAt: daysFromNow(-1), createdAt: daysFromNow(-1) },
    });
    await platform.grantPlan(courtesy(business.id, { days: 20 }));
    const second = await lastGrant(business.id);

    await expect(platform.revokeGrant(revoke(first.id))).rejects.toMatchObject({ code: "CONFLICT" });

    await platform.revokeGrant(revoke(second.id));
    await expect(subscriptionOf(business.id)).resolves.toEqual(afterFirst);
    await platform.revokeGrant(revoke(first.id));
    await expect(subscriptionOf(business.id)).resolves.toEqual(original);
  });

  it("solo revoca activaciones manuales con foto, y exige una nota", async () => {
    const { business, owner, platform } = await setup(trial(3));
    const checkout = await callerFor(owner).billing.checkout({ plan: "BUSINESS", cycle: "MONTHLY" });
    const gateway = await callerFor(owner).billing.simulatePayment({ reference: checkout.reference, outcome: "APPROVED" });
    const legacy = await db.subscriptionPayment.create({
      data: {
        subscriptionId: (await db.subscription.findUniqueOrThrow({ where: { businessId: business.id } })).id,
        businessId: business.id,
        reference: "BLF-SIN-FOTO-01",
        provider: "manual",
        kind: "MANUAL",
        plan: "PRO",
        billingCycle: "MONTHLY",
        amountInCents: 0,
        status: "APPROVED",
        paidAt: daysFromNow(1),
        grantReason: "COURTESY",
        grantDays: 30,
      },
    });
    const before = await subscriptionOf(business.id);

    await expect(platform.revokeGrant(revoke(gateway.id))).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Solo se pueden revocar las activaciones manuales.",
    });
    await expect(platform.revokeGrant(revoke(legacy.id))).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(platform.revokeGrant(revoke("no-existe"))).rejects.toMatchObject({ code: "NOT_FOUND" });
    for (const note of ["", "   ", "abc", "x".repeat(501)]) {
      await expect(
        platform.revokeGrant({ paymentId: legacy.id, note, notifyOwner: false }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    await expect(subscriptionOf(business.id)).resolves.toEqual(before);
    await expect(platform.listPayments({ onlyManual: true })).resolves.toMatchObject({
      items: [{ id: legacy.id, grant: { revocable: false, revokePreview: null } }],
    });
  });

  it("avisa al propietario solo si se pide", async () => {
    const { business, owner, platform } = await setup({ plan: "BASIC", currentPeriodEnd: daysFromNow(10) });
    await platform.grantPlan(courtesy(business.id, { plan: "BASIC" }));
    const payment = await lastGrant(business.id);

    const result = await platform.revokeGrant(revoke(payment.id, true));

    expect(result.ownerNotified).toBe(true);
    expect(sendSubscriptionEmail).toHaveBeenCalledTimes(1);
    const [to, , email] = vi.mocked(sendSubscriptionEmail).mock.calls[0]!;
    expect(to).toBe(owner.email);
    expect(email.subject).toBe("Actualizamos tu suscripción");
    expect(email.paragraphs[0]).toContain(payment.reference);
    expect(email.paragraphs[1]).toContain("Tu acceso sigue vigente hasta el");
  });

  it("el detalle del negocio dice cuál activación es revocable y cómo quedaría", async () => {
    const { business, platform } = await setup(trial(3));
    await platform.grantPlan(courtesy(business.id, { plan: "PRO", start: "NOW" }));
    const payment = await lastGrant(business.id);

    const detail = await platform.getBusiness({ businessId: business.id });
    expect(detail.subscription).toMatchObject({ plan: "PRO", phase: "ACTIVE" });
    expect(detail.recentPayments).toMatchObject([
      {
        id: payment.id,
        kind: "MANUAL",
        provider: "manual",
        grant: {
          reason: "COURTESY",
          days: 30,
          grantedBy: "Admin Plataforma",
          externalReference: null,
          revokedAt: null,
          revokeNote: null,
          revocable: true,
          revokePreview: { plan: "BUSINESS", phase: "TRIAL", daysLeft: 3, billingCycle: "MONTHLY" },
        },
      },
    ]);
    expect(detail.recentAudit).toMatchObject([{ action: "GRANT_PLAN", adminEmail: ADMIN_EMAIL, ip: "10.0.0.9" }]);
    // En la lista general: revocable sí, vista previa no.
    await expect(platform.listPayments({})).resolves.toMatchObject({
      items: [{ id: payment.id, grant: { revocable: true, revokePreview: null } }],
    });

    // La vista previa coincide con lo que pasa al revocar.
    const result = await platform.revokeGrant(revoke(payment.id));
    expect(result.subscription).toEqual(detail.recentPayments[0]!.grant!.revokePreview);
    await expect(platform.getBusiness({ businessId: business.id })).resolves.toMatchObject({
      recentPayments: [
        { grant: { revocable: false, revokePreview: null, revokeNote: "Se registró por error" } },
      ],
    });
  });
});

describe("platform.resolvePaymentReview", () => {
  it("quita la marca con una nota obligatoria y lo deja en la bitácora", async () => {
    const { admin, business, platform } = await setup();
    const payment = await db.subscriptionPayment.create({
      data: {
        subscriptionId: (await setSubscription(business.id)).id,
        businessId: business.id,
        reference: "BLF-REVISAR-01",
        provider: "wompi",
        kind: "PERIOD",
        plan: "PRO",
        billingCycle: "MONTHLY",
        amountInCents: 7_990_000,
        status: "APPROVED",
        needsReview: true,
        statusMessage: "Wompi reportó anulación después de aprobado: revisar manualmente.",
      },
    });
    const before = await subscriptionOf(business.id);
    await expect(platform.overview()).resolves.toMatchObject({ paymentsToReview: 1 });

    for (const note of ["", "ok", "x".repeat(501)]) {
      await expect(platform.resolvePaymentReview({ paymentId: payment.id, note })).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    }
    await expect(
      platform.resolvePaymentReview({ paymentId: payment.id, note: " Wompi confirmó que el reverso fue un error " }),
    ).resolves.toEqual({ paymentId: payment.id });

    await expect(platform.overview()).resolves.toMatchObject({ paymentsToReview: 0 });
    // Solo cambia la marca: ni el pago ni la suscripción.
    await expect(db.subscriptionPayment.findUniqueOrThrow({ where: { id: payment.id } })).resolves.toMatchObject({
      needsReview: false,
      status: "APPROVED",
      statusMessage: payment.statusMessage,
    });
    await expect(subscriptionOf(business.id)).resolves.toEqual(before);
    await expect(db.platformAuditLog.findMany()).resolves.toMatchObject([
      {
        adminId: admin.id,
        action: "RESOLVE_PAYMENT_REVIEW",
        businessId: business.id,
        entityId: payment.id,
        ip: "10.0.0.9",
        summary: "Marcó como revisado el pago BLF-REVISAR-01: Wompi confirmó que el reverso fue un error",
      },
    ]);

    await expect(
      platform.resolvePaymentReview({ paymentId: payment.id, note: "Otra vez lo mismo" }),
    ).rejects.toMatchObject({ code: "CONFLICT", message: "Este pago no está pendiente de revisión." });
    await expect(
      platform.resolvePaymentReview({ paymentId: "no-existe", note: "No existe este pago" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(db.platformAuditLog.count()).resolves.toBe(1);
  });
});

describe("platform.listPayments y platform.listAudit", () => {
  async function seed() {
    const admin = await createAdmin();
    const { platform } = callerFor(admin);
    const cafe = await createShop({ name: "Café Central" });
    const tienda = await createShop({ name: "Tienda Rosa" });
    await setSubscription(cafe.business.id, trial(3));
    await setSubscription(tienda.business.id, trial(-1));

    await platform.grantPlan(courtesy(cafe.business.id, { days: 10 }));
    await platform.grantPlan(courtesy(tienda.business.id, { plan: "PRO", reason: "MANUAL_PAYMENT", amountCop: 79_900 }));
    await platform.extendTrial({ businessId: (await createShop({ name: "Nuevo" })).business.id, days: 5 });
    // El Café ya tiene un período activo (la activación): subir a Pro es un cobro de mejora.
    const checkout = await callerFor(cafe.owner).billing.checkout({ plan: "PRO", cycle: "MONTHLY" });
    await db.subscriptionPayment.update({ where: { reference: checkout.reference }, data: { needsReview: true } });

    // Orden estable: cada fila con su propia fecha.
    const payments = await db.subscriptionPayment.findMany({ orderBy: { createdAt: "asc" } });
    for (const [i, p] of payments.entries()) {
      await db.subscriptionPayment.update({ where: { id: p.id }, data: { createdAt: daysFromNow(-10 + i) } });
    }
    const audit = await db.platformAuditLog.findMany({ orderBy: { createdAt: "asc" } });
    for (const [i, a] of audit.entries()) {
      await db.platformAuditLog.update({ where: { id: a.id }, data: { createdAt: daysFromNow(-10 + i) } });
    }
    return { platform, cafe, tienda };
  }

  it("lista los pagos de todos los negocios con filtros", async () => {
    const { platform, cafe, tienda } = await seed();
    const names = async (input: Parameters<typeof platform.listPayments>[0]) =>
      (await platform.listPayments(input)).items.map((p) => `${p.businessName}:${p.kind}:${p.status}`);

    await expect(names({})).resolves.toEqual([
      "Café Central:UPGRADE:PENDING",
      "Tienda Rosa:MANUAL:APPROVED",
      "Café Central:MANUAL:APPROVED",
    ]);
    await expect(names(undefined)).resolves.toHaveLength(3);
    await expect(names({ businessId: cafe.business.id })).resolves.toEqual([
      "Café Central:UPGRADE:PENDING",
      "Café Central:MANUAL:APPROVED",
    ]);
    await expect(names({ onlyManual: true })).resolves.toEqual([
      "Tienda Rosa:MANUAL:APPROVED",
      "Café Central:MANUAL:APPROVED",
    ]);
    await expect(names({ status: "PENDING" })).resolves.toEqual(["Café Central:UPGRADE:PENDING"]);
    await expect(names({ needsReview: true })).resolves.toEqual(["Café Central:UPGRADE:PENDING"]);
    await expect(names({ businessId: tienda.business.id, status: "DECLINED" })).resolves.toEqual([]);
    await expect(
      platform.listPayments({ status: "PAGADO" } as unknown as Parameters<typeof platform.listPayments>[0]),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    const manual = await platform.listPayments({ onlyManual: true });
    expect(manual.items[0]).toMatchObject({
      businessId: tienda.business.id,
      amountInCents: 7_990_000,
      needsReview: false,
      grant: { reason: "MANUAL_PAYMENT", days: 30, grantedBy: "Admin Plataforma", revocable: true, revokePreview: null },
    });
    // Un pago pendiente posterior no impide revocar la activación del Café.
    expect(manual.items[1]).toMatchObject({ grant: { days: 10, revocable: true } });
  });

  it("pagina pagos y bitácora por cursor sin repetir ni saltar", async () => {
    const { platform, cafe } = await seed();

    const first = await platform.listPayments({ limit: 2 });
    const second = await platform.listPayments({ limit: 2, cursor: first.nextCursor! });
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).toBe(first.items[1]!.id);
    expect(second).toMatchObject({ items: [{ businessName: "Café Central", kind: "MANUAL" }], nextCursor: null });
    await expect(platform.listPayments({ limit: 3 })).resolves.toMatchObject({ nextCursor: null });
    await expect(platform.listPayments({ limit: 101 })).rejects.toMatchObject({ code: "BAD_REQUEST" });

    const audit = await platform.listAudit({});
    expect(audit.items.map((a) => `${a.action}:${a.businessName}`)).toEqual([
      "EXTEND_TRIAL:Nuevo",
      "GRANT_PLAN:Tienda Rosa",
      "GRANT_PLAN:Café Central",
    ]);
    expect(audit.items[0]).toEqual({
      id: expect.any(String) as string,
      createdAt: expect.any(Date) as Date,
      adminName: "Admin Plataforma",
      adminEmail: ADMIN_EMAIL,
      action: "EXTEND_TRIAL",
      businessId: expect.any(String) as string,
      businessName: "Nuevo",
      summary: expect.stringContaining("Extendió la prueba 5 días") as string,
      ip: "127.0.0.1",
    });
    const page1 = await platform.listAudit({ limit: 2 });
    const page2 = await platform.listAudit({ limit: 2, cursor: page1.nextCursor! });
    expect([...page1.items, ...page2.items].map((a) => a.id)).toEqual(audit.items.map((a) => a.id));
    expect(page2.nextCursor).toBeNull();
    await expect(platform.listAudit({ businessId: cafe.business.id })).resolves.toMatchObject({
      items: [{ action: "GRANT_PLAN", businessName: "Café Central" }],
      nextCursor: null,
    });
    await expect(platform.listAudit()).resolves.toMatchObject({ items: { length: 3 } });
  });
});

describe("cron de suscripciones con activaciones manuales", () => {
  it("aplica el plan programado cuando llega su fecha y mantiene el estado por fechas", async () => {
    const { business, platform } = await setup({ plan: "BASIC", currentPeriodEnd: daysFromNow(10) });
    const result = await platform.grantPlan(courtesy(business.id, { plan: "PRO", days: 15 }));

    // Hoy: nada que aplicar todavía.
    await expect(runSubscriptionJob(db)).resolves.toMatchObject({ scheduledApplied: 0, statusUpdated: 0, paymentsExpired: 0 });
    await expect(subscriptionOf(business.id)).resolves.toMatchObject({ plan: "BASIC", scheduledPlan: "PRO" });

    // El día 12 ya rige el plan otorgado, con sus 15 días contados desde el día 10.
    await expect(runSubscriptionJob(db, daysFromNow(12))).resolves.toMatchObject({ scheduledApplied: 1 });
    await expect(subscriptionOf(business.id)).resolves.toMatchObject({
      plan: "PRO",
      status: "ACTIVE",
      currentPeriodStart: result.periodStart,
      currentPeriodEnd: result.periodEnd,
      scheduledPlan: null,
      scheduledFrom: null,
    });

    // Al terminar los días: gracia y luego solo lectura, como cualquier período pagado.
    await runSubscriptionJob(db, daysFromNow(26));
    await expect(subscriptionOf(business.id)).resolves.toMatchObject({ status: "PAST_DUE" });
    await runSubscriptionJob(db, daysFromNow(29));
    await expect(subscriptionOf(business.id)).resolves.toMatchObject({ status: "READ_ONLY" });
    // La activación nunca se toca como pago pendiente de la pasarela.
    await expect(lastGrant(business.id)).resolves.toMatchObject({ status: "APPROVED" });
  });

  it("recuerda el vencimiento de un período corto con los días que realmente faltan", async () => {
    const { business, owner, platform } = await setup({ ...trial(-1) });
    await platform.grantPlan(courtesy(business.id, { plan: "BASIC", days: 5 }));

    await expect(runSubscriptionJob(db)).resolves.toMatchObject({ noticesSent: 1 });

    const [to, , email] = vi.mocked(sendSubscriptionEmail).mock.calls[0]!;
    expect(to).toBe(owner.email);
    expect(email.subject).toBe("Tu plan vence en 5 días");
    expect(email.paragraphs[0]).toContain("El plan Básico de Café Central vence el");
    // No se repite el mismo aviso.
    await expect(runSubscriptionJob(db)).resolves.toMatchObject({ noticesSent: 0 });
  });
});

describe("activación manual + mejora de plan por la pasarela", () => {
  it("366 días de Básico (ciclo mensual): subir a Pro cuesta todos los días que quedan", async () => {
    const { business, owner, platform } = await setup({ ...trial(-2) });
    await platform.grantPlan(courtesy(business.id, { plan: "BASIC", days: 366, start: "NOW" }));

    // (79.900 − 29.900) / 30 × 366 días = 610.000 COP (no los 50.000 de un mes).
    await expect(callerFor(owner).billing.quote({ plan: "PRO", cycle: "MONTHLY" })).resolves.toMatchObject({
      ok: true,
      kind: "UPGRADE",
      baseAmount: 610_000,
    });
    const checkout = await callerFor(owner).billing.checkout({ plan: "PRO", cycle: "MONTHLY" });
    expect(checkout).toMatchObject({ kind: "UPGRADE", amountInCents: 61_000_000 });

    const paid = await callerFor(owner).billing.simulatePayment({ reference: checkout.reference, outcome: "APPROVED" });
    // Cotizada después de la activación: no hay nada que revisar.
    await expect(db.subscriptionPayment.findUniqueOrThrow({ where: { id: paid.id } })).resolves.toMatchObject({
      status: "APPROVED",
      needsReview: false,
    });
    await expect(subscriptionOf(business.id)).resolves.toMatchObject({ plan: "PRO", status: "ACTIVE" });
  });

  it("30 días de Básico con ciclo anual guardado: subir a Pro anual cuesta 30 días, no un año", async () => {
    const { business, owner, platform } = await setup({
      plan: "BASIC",
      billingCycle: "ANNUAL",
      currentPeriodStart: daysFromNow(-375),
      currentPeriodEnd: daysFromNow(-10),
    });
    await platform.grantPlan(courtesy(business.id, { plan: "BASIC", days: 30 }));

    // 50.000 / 30 × 30 = 50.000 COP (la diferencia anual serían 500.000).
    const checkout = await callerFor(owner).billing.checkout({ plan: "PRO", cycle: "ANNUAL" });
    expect(checkout).toMatchObject({ kind: "UPGRADE", amountInCents: 5_000_000 });
    // Pedir el otro ciclo no es una mejora: es un mes completo que empieza al terminar los 30 días.
    await expect(callerFor(owner).billing.quote({ plan: "PRO", cycle: "MONTHLY" })).resolves.toMatchObject({
      kind: "PERIOD",
      baseAmount: 79_900,
    });
  });

  it("una mejora cotizada antes de la activación se aplica al pagarse, pero queda para revisión", async () => {
    const { business, owner, platform } = await setup({
      plan: "BASIC",
      currentPeriodStart: daysFromNow(-20),
      currentPeriodEnd: daysFromNow(10),
    });
    // Cotización barata: quedan 10 días del período.
    const checkout = await callerFor(owner).billing.checkout({ plan: "PRO", cycle: "MONTHLY" });
    expect(checkout.kind).toBe("UPGRADE");
    expect(checkout.amountInCents).toBeLessThan(2_000_000);
    await db.subscriptionPayment.update({
      where: { reference: checkout.reference },
      data: { createdAt: new Date(Date.now() - 60_000) },
    });

    await platform.grantPlan(courtesy(business.id, { plan: "BASIC", days: 366 }));
    const paid = await callerFor(owner).billing.simulatePayment({ reference: checkout.reference, outcome: "APPROVED" });

    // El dinero ya se cobró: el plan sube...
    await expect(subscriptionOf(business.id)).resolves.toMatchObject({ plan: "PRO", status: "ACTIVE" });
    // ...y el pago aparece en "Pagos por revisar".
    await expect(db.subscriptionPayment.findUniqueOrThrow({ where: { id: paid.id } })).resolves.toMatchObject({
      status: "APPROVED",
      needsReview: true,
      statusMessage:
        "Mejora de plan cotizada antes de un cambio en el período (activación manual u otro pago): revisar el valor cobrado.",
    });
    await expect(platform.overview()).resolves.toMatchObject({ paymentsToReview: 1 });
    await expect(platform.listPayments({ needsReview: true })).resolves.toMatchObject({
      items: [{ id: paid.id, kind: "UPGRADE", needsReview: true }],
    });
    // La cotización nueva ya no es reutilizable al precio viejo.
    await expect(callerFor(owner).billing.quote({ plan: "PRO", cycle: "MONTHLY" })).resolves.toMatchObject({
      kind: "PERIOD",
    });
  });

  it("una activación revocada antes del pago no deja la mejora para revisión", async () => {
    const { business, owner, platform } = await setup({
      plan: "BASIC",
      currentPeriodStart: daysFromNow(-20),
      currentPeriodEnd: daysFromNow(10),
    });
    const checkout = await callerFor(owner).billing.checkout({ plan: "PRO", cycle: "MONTHLY" });
    await db.subscriptionPayment.update({
      where: { reference: checkout.reference },
      data: { createdAt: new Date(Date.now() - 60_000) },
    });
    await platform.grantPlan(courtesy(business.id, { plan: "BASIC", days: 366 }));
    await platform.revokeGrant({ paymentId: (await lastGrant(business.id)).id, note: "Días mal digitados", notifyOwner: false });

    const paid = await callerFor(owner).billing.simulatePayment({ reference: checkout.reference, outcome: "APPROVED" });

    await expect(db.subscriptionPayment.findUniqueOrThrow({ where: { id: paid.id } })).resolves.toMatchObject({
      needsReview: false,
      statusMessage: "Pago simulado aprobado",
    });
  });
});

describe("orden de aplicación de pagos y revocación", () => {
  it("un pago de pasarela aplicado después de la activación la deja no revocable aunque su reloj venga atrasado", async () => {
    const { business, owner, platform } = await setup({ plan: "BASIC", currentPeriodEnd: daysFromNow(10) });
    const checkout = await callerFor(owner).billing.checkout({ plan: "BASIC", cycle: "MONTHLY" });
    await platform.grantPlan(courtesy(business.id, { plan: "BASIC" }));
    const grant = await lastGrant(business.id);

    // El webhook tomó su hora antes de esperar el bloqueo: llega con un `now` anterior a la activación.
    const { processGatewayTransaction } = await import("~/server/subscription/payments");
    const result = await processGatewayTransaction(
      db,
      {
        provider: "mock",
        transactionId: "tx-atrasado",
        reference: checkout.reference,
        status: "APPROVED",
        amountInCents: checkout.amountInCents,
        currency: "COP",
        statusMessage: null,
      },
      new Date(Date.now() - 5 * 60_000),
    );
    expect(result.outcome).toBe("approved");

    const gateway = await db.subscriptionPayment.findUniqueOrThrow({ where: { reference: checkout.reference } });
    expect(gateway.paidAt!.getTime()).toBeGreaterThan(grant.paidAt!.getTime());
    const afterPayment = await subscriptionOf(business.id);

    await expect(platform.getBusiness({ businessId: business.id })).resolves.toMatchObject({
      recentPayments: expect.arrayContaining([
        expect.objectContaining({ id: grant.id, grant: expect.objectContaining({ revocable: false }) as unknown }),
      ]) as unknown,
    });
    await expect(
      platform.revokeGrant({ paymentId: grant.id, note: "No debería poder", notifyOwner: false }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    // El período pagado por la pasarela sigue intacto.
    await expect(subscriptionOf(business.id)).resolves.toEqual(afterPayment);
  });

  it("una activación posterior a un pago siempre queda después de él", async () => {
    const { business, owner, platform } = await setup({ ...trial(3) });
    const checkout = await callerFor(owner).billing.checkout({ plan: "BUSINESS", cycle: "MONTHLY" });
    await callerFor(owner).billing.simulatePayment({ reference: checkout.reference, outcome: "APPROVED" });
    // Reloj del otro servidor adelantado.
    await db.subscriptionPayment.update({ where: { reference: checkout.reference }, data: { paidAt: daysFromNow(1) } });

    await platform.grantPlan(courtesy(business.id));
    const grant = await lastGrant(business.id);

    expect(grant.paidAt!.getTime()).toBeGreaterThan(daysFromNow(1).getTime() - 10_000);
    await expect(platform.listPayments({ onlyManual: true })).resolves.toMatchObject({
      items: [{ id: grant.id, grant: { revocable: true } }],
    });
  });
});

describe("revocar respeta la cancelación o reanudación posterior del propietario", () => {
  const revoke = (paymentId: string) => ({ paymentId, note: "Se registró por error", notifyOwner: false });

  it("si el propietario canceló después de la activación, sigue cancelado al revocar", async () => {
    const { business, owner, platform } = await setup({ plan: "BASIC", currentPeriodEnd: daysFromNow(10) });
    await platform.grantPlan(courtesy(business.id, { plan: "BASIC" }));
    const grant = await lastGrant(business.id);
    await callerFor(owner).billing.cancel();
    const canceled = await subscriptionOf(business.id);
    expect(canceled.canceledAt).not.toBeNull();

    const detail = await platform.getBusiness({ businessId: business.id });
    const preview = detail.recentPayments[0]!.grant!.revokePreview;
    expect(preview).toMatchObject({ phase: "CANCELED", daysLeft: 10 });

    const result = await platform.revokeGrant(revoke(grant.id));

    expect(result.subscription).toEqual(preview);
    await expect(subscriptionOf(business.id)).resolves.toMatchObject({
      status: "CANCELED",
      canceledAt: canceled.canceledAt,
    });
    await expect(db.platformAuditLog.findFirstOrThrow({ where: { action: "REVOKE_GRANT" } })).resolves.toMatchObject({
      detail: { keptOwnerCancellation: true },
    });
  });

  it("si estaba cancelado, se activó y el propietario reanudó, no vuelve a quedar cancelado", async () => {
    const { business, owner, platform } = await setup({
      plan: "BASIC",
      currentPeriodEnd: daysFromNow(10),
      canceledAt: daysFromNow(-2),
      status: "CANCELED",
    });
    await platform.grantPlan(courtesy(business.id, { plan: "BASIC" }));
    const grant = await lastGrant(business.id);
    // Cancela y se arrepiente: su última decisión es seguir.
    await callerFor(owner).billing.cancel();
    await callerFor(owner).billing.resume();

    const detail = await platform.getBusiness({ businessId: business.id });
    const preview = detail.recentPayments[0]!.grant!.revokePreview;
    const result = await platform.revokeGrant(revoke(grant.id));

    expect(result.subscription).toEqual(preview);
    expect(result.subscription).toMatchObject({ phase: "ACTIVE", daysLeft: 10 });
    await expect(subscriptionOf(business.id)).resolves.toMatchObject({ status: "ACTIVE", canceledAt: null });
  });

  it("sin decisión posterior del propietario se restaura la cancelación de la foto", async () => {
    const { business, platform } = await setup({
      plan: "BASIC",
      currentPeriodEnd: daysFromNow(10),
      canceledAt: daysFromNow(-2),
      status: "CANCELED",
    });
    const before = await subscriptionOf(business.id);
    await platform.grantPlan(courtesy(business.id, { plan: "BASIC" }));

    await platform.revokeGrant(revoke((await lastGrant(business.id)).id));

    await expect(subscriptionOf(business.id)).resolves.toEqual(before);
    await expect(db.platformAuditLog.findFirstOrThrow({ where: { action: "REVOKE_GRANT" } })).resolves.toMatchObject({
      detail: { keptOwnerCancellation: false },
    });
  });

  it("si al revocar vuelve a la prueba, no queda una cancelación colgando", async () => {
    const { business, owner, platform } = await setup({ ...trial(3) });
    await platform.grantPlan(courtesy(business.id));
    await callerFor(owner).billing.cancel();

    const result = await platform.revokeGrant(revoke((await lastGrant(business.id)).id));

    expect(result.subscription).toMatchObject({ phase: "TRIAL", daysLeft: 3 });
    await expect(subscriptionOf(business.id)).resolves.toMatchObject({ status: "TRIAL", canceledAt: null, currentPeriodEnd: null });
  });
});

describe("lo que ve el propietario de una activación manual", () => {
  it("billing.payments y billing.paymentByReference no devuelven el mensaje interno", async () => {
    const { business, owner, platform } = await setup({ ...trial(3) });
    await platform.grantPlan(courtesy(business.id, { note: "Nota interna del admin" }));
    const grant = await lastGrant(business.id);
    expect(grant.statusMessage).toBe("Cortesía");
    const checkout = await callerFor(owner).billing.checkout({ plan: "BUSINESS", cycle: "ANNUAL" });
    await callerFor(owner).billing.simulatePayment({ reference: checkout.reference, outcome: "DECLINED" });

    const payments = await callerFor(owner).billing.payments();
    expect(payments).toMatchObject([
      { kind: "PERIOD", statusMessage: "Pago simulado rechazado" },
      { kind: "MANUAL", statusMessage: null, grantDays: 30 },
    ]);
    expect(JSON.stringify(payments)).not.toContain("Nota interna");
    await expect(callerFor(owner).billing.paymentByReference({ reference: grant.reference })).resolves.toMatchObject({
      kind: "MANUAL",
      statusMessage: null,
    });
  });
});
