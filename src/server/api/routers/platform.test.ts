import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type SubscriptionPhase } from "~/lib/subscription/access";
import { processGatewayTransaction } from "~/server/subscription/payments";
import { monthKey, USAGE_METRICS } from "~/server/subscription/quotas";
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

const createAdmin = (data: { email?: string; mustChangePassword?: boolean } = {}) =>
  createUser({ businessId: null, role: "SUPERADMIN", name: "Admin Plataforma", email: ADMIN_EMAIL, ...data });

/** Prueba gratis (nunca ha pagado) que termina en `days` días. */
const trial = (days: number) => ({
  plan: "BUSINESS" as const,
  status: "TRIAL" as const,
  trialEndsAt: daysFromNow(days),
  currentPeriodStart: null,
  currentPeriodEnd: null,
});

beforeEach(() => vi.stubEnv("PLATFORM_ADMIN_EMAILS", `otro@billify.test, ${ADMIN_EMAIL.toUpperCase()}`));
afterEach(() => vi.unstubAllEnvs());

describe("platformAdminProcedure", () => {
  it("rechaza llamadas sin sesión, de cajeros y de propietarios", async () => {
    const { owner, cashier } = await createShop();
    // Ni siquiera con su correo en la lista: falta la otra llave (el rol).
    vi.stubEnv("PLATFORM_ADMIN_EMAILS", `${owner.email}, ${cashier.email}`);

    await expect(callerFor(null).platform.overview()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    for (const user of [owner, cashier]) {
      const caller = callerFor(user);
      await expect(caller.platform.overview()).rejects.toMatchObject({
        code: "FORBIDDEN",
        message: "Solo el administrador de la plataforma puede realizar esta acción.",
      });
      await expect(caller.platform.listBusinesses({})).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(caller.platform.getBusiness({ businessId: owner.businessId! })).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    }
  });

  it("un SUPERADMIN sin PLATFORM_ADMIN_EMAILS no tiene sesión válida (falla cerrado)", async () => {
    const admin = await createAdmin();

    vi.stubEnv("PLATFORM_ADMIN_EMAILS", undefined);
    await expect(callerFor(admin).platform.overview()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    vi.stubEnv("PLATFORM_ADMIN_EMAILS", "");
    await expect(callerFor(admin).platform.overview()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("un SUPERADMIN con el correo fuera de la lista no entra a nada", async () => {
    const admin = await createAdmin({ email: "intruso@billify.test" });

    await expect(callerFor(admin).platform.overview()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(callerFor(admin).platform.listBusinesses({})).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    // Tampoco al resto de procedimientos con sesión.
    await expect(
      callerFor(admin).auth.changePassword({ currentPassword: "x", newPassword: "NuevaClave123" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("deja pasar al administrador válido sin crearle suscripción ni exigirle negocio", async () => {
    const admin = await createAdmin();

    await expect(callerFor(admin).platform.overview()).resolves.toMatchObject({ total: 0 });
    await expect(callerFor(admin).platform.listBusinesses()).resolves.toEqual({ items: [], nextCursor: null });
    await expect(db.subscription.count()).resolves.toBe(0);
  });

  it("exige cambiar la contraseña pendiente y respeta sesiones revocadas", async () => {
    const admin = await createAdmin({ mustChangePassword: true });
    await expect(callerFor(admin).platform.overview()).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Debes cambiar tu contraseña",
    });

    await db.user.update({ where: { id: admin.id }, data: { mustChangePassword: false, sessionVersion: 1 } });
    await expect(callerFor(admin).platform.overview()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(callerFor({ id: admin.id, sessionVersion: 1 }).platform.overview()).resolves.toBeTruthy();
  });
});

describe("aislamiento del SUPERADMIN", () => {
  it("no puede usar los procedimientos de negocio ni los de propietario", async () => {
    const admin = await createAdmin();
    const caller = callerFor(admin);
    const noBusiness = { code: "FORBIDDEN", message: "Cuenta sin negocio asociado." };

    // businessProcedure
    await expect(caller.product.list()).rejects.toMatchObject(noBusiness);
    await expect(caller.billing.status()).rejects.toMatchObject(noBusiness);
    await expect(caller.sale.create({ items: [{ productId: "x", quantity: 1 }] })).rejects.toMatchObject(noBusiness);
    // ownerProcedure: nunca se le trata como propietario.
    const ownerOnly = { code: "FORBIDDEN", message: "Solo el propietario puede realizar esta acción." };
    await expect(caller.user.list()).rejects.toMatchObject(ownerOnly);
    await expect(caller.admin.dbStats()).rejects.toMatchObject(ownerOnly);
    await expect(caller.billing.checkout({ plan: "PRO", cycle: "MONTHLY" })).rejects.toMatchObject(ownerOnly);
  });

  it("la BD impide que un SUPERADMIN pertenezca a un negocio", async () => {
    const { business, cashier } = await createShop();

    await expect(createUser({ businessId: business.id, role: "SUPERADMIN" })).rejects.toThrow();
    await expect(db.user.update({ where: { id: cashier.id }, data: { role: "SUPERADMIN" } })).rejects.toThrow();
  });

  it("un propietario no puede crear, editar ni desactivar a un SUPERADMIN", async () => {
    const admin = await createAdmin();
    const { owner } = await createShop();
    const caller = callerFor(owner);

    await expect(caller.user.resetEmployeePassword({ employeeId: admin.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(caller.user.setActive({ employeeId: admin.id, isActive: false })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(caller.user.setCashManagement({ employeeId: admin.id, canManageCash: true })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      caller.user.createEmployee({ name: "Impostor", document: "1234567", email: ADMIN_EMAIL }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(caller.user.list()).resolves.not.toContainEqual(expect.objectContaining({ id: admin.id }));

    await expect(db.user.findUniqueOrThrow({ where: { id: admin.id } })).resolves.toMatchObject({
      role: "SUPERADMIN",
      isActive: true,
      sessionVersion: 0,
      businessId: null,
    });
  });

  it("el registro público no crea ni asciende administradores", async () => {
    const admin = await createAdmin();
    const anonymous = callerFor(null);

    // Con el correo de un administrador existente: conflicto.
    await expect(
      anonymous.auth.registerOwner({
        businessName: "Tienda Falsa",
        businessDocument: "900555111",
        ownerName: "Impostor",
        ownerDocument: "1234567",
        ownerEmail: ADMIN_EMAIL,
        ownerPassword: "ClaveSegura-2026",
        acceptedTerms: true,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    // Un correo de la lista que aún no tiene cuenta se registra como propietario, no como administrador.
    await anonymous.auth.registerOwner({
      businessName: "Tienda Lista",
      businessDocument: "900555222",
      ownerName: "Otro",
      ownerDocument: "7654321",
      ownerEmail: "otro@billify.test",
      ownerPassword: "ClaveSegura-2026",
      acceptedTerms: true,
    });
    await expect(db.pendingRegistration.count()).resolves.toBe(1);
    await expect(db.user.findMany({ where: { role: "SUPERADMIN" }, select: { id: true } })).resolves.toEqual([
      { id: admin.id },
    ]);
  });

  it("el administrador no recupera la contraseña por correo", async () => {
    const admin = await createAdmin();
    await db.user.update({ where: { id: admin.id }, data: { document: "1234567" } });

    await expect(callerFor(null).auth.forgotPassword({ email: ADMIN_EMAIL, document: "1234567" })).resolves.toEqual({
      message: "Si los datos son correctos, recibirás un correo.",
    });
    await expect(db.passwordResetToken.count()).resolves.toBe(0);
  });
});

describe("platform.overview y platform.listBusinesses", () => {
  /** Un negocio por cada caso de fase, con la columna `status` desactualizada a propósito. */
  async function seedPhases() {
    const make = async (name: string, sub: Parameters<typeof setSubscription>[1] | null) => {
      const shop = await createShop({ name });
      if (sub) await setSubscription(shop.business.id, sub);
      return shop;
    };
    return {
      trial: await make("Prueba", trial(5)),
      active: await make("Activo", { currentPeriodEnd: daysFromNow(30) }),
      activeEndingSoon: await make("Activo por vencer", { currentPeriodEnd: daysFromNow(3), status: "TRIAL" }),
      pastDue: await make("En gracia", { currentPeriodEnd: daysFromNow(-1), status: "ACTIVE" }),
      canceled: await make("Cancelado", { currentPeriodEnd: daysFromNow(10), canceledAt: daysFromNow(-2) }),
      trialExpired: await make("Prueba vencida", { ...trial(-1), status: "TRIAL" }),
      graceExpired: await make("Plan vencido", { currentPeriodEnd: daysFromNow(-4), status: "ACTIVE" }),
      canceledExpired: await make("Cancelado vencido", {
        currentPeriodEnd: daysFromNow(-1),
        canceledAt: daysFromNow(-9),
        status: "ACTIVE",
      }),
      noSubscription: await make("Sin suscripción", null),
    };
  }

  it("cuenta los negocios por fase calculada con fechas, no con la columna status", async () => {
    const admin = await createAdmin();
    await seedPhases();
    await db.business.updateMany({ where: { name: "Activo" }, data: { createdAt: daysFromNow(-45) } });

    await expect(callerFor(admin).platform.overview()).resolves.toEqual({
      total: 9,
      trial: 1,
      active: 2,
      pastDue: 1,
      canceled: 1,
      readOnly: 4,
      // Prueba (5 días) y "Activo por vencer" (3 días); el que está en gracia no cuenta.
      expiringSoon: 2,
      newLast30Days: 8,
      paymentsToReview: 0,
    });
  });

  it("el filtro por fase coincide con la fase que devuelve cada fila", async () => {
    const admin = await createAdmin();
    const shops = await seedPhases();
    const caller = callerFor(admin);

    const all = await caller.platform.listBusinesses({ limit: 100 });
    expect(all.items).toHaveLength(9);
    const phaseOf = (shop: { business: { id: string } }) =>
      all.items.find((b) => b.id === shop.business.id)!.subscription.phase;
    expect({
      trial: phaseOf(shops.trial),
      active: phaseOf(shops.active),
      activeEndingSoon: phaseOf(shops.activeEndingSoon),
      pastDue: phaseOf(shops.pastDue),
      canceled: phaseOf(shops.canceled),
      trialExpired: phaseOf(shops.trialExpired),
      graceExpired: phaseOf(shops.graceExpired),
      canceledExpired: phaseOf(shops.canceledExpired),
      noSubscription: phaseOf(shops.noSubscription),
    }).toEqual({
      trial: "TRIAL",
      active: "ACTIVE",
      activeEndingSoon: "ACTIVE",
      pastDue: "PAST_DUE",
      canceled: "CANCELED",
      trialExpired: "READ_ONLY",
      graceExpired: "READ_ONLY",
      canceledExpired: "READ_ONLY",
      noSubscription: "READ_ONLY",
    });

    // El filtro en la BD y `computeAccess` deben clasificar igual a cada negocio.
    const phases: SubscriptionPhase[] = ["TRIAL", "ACTIVE", "PAST_DUE", "CANCELED", "READ_ONLY"];
    for (const phase of phases) {
      const filtered = await caller.platform.listBusinesses({ phase, limit: 100 });
      const expected = all.items.filter((b) => b.subscription.phase === phase).map((b) => b.id);
      expect(filtered.items.map((b) => b.id).sort()).toEqual(expected.sort());
      expect(filtered.items.every((b) => b.subscription.phase === phase)).toBe(true);
    }

    const soon = await caller.platform.listBusinesses({ expiringSoon: true });
    expect(soon.items.map((b) => b.name).sort()).toEqual(["Activo por vencer", "Prueba"]);
    await expect(caller.platform.listBusinesses({ expiringSoon: true, phase: "TRIAL" })).resolves.toMatchObject({
      items: [{ name: "Prueba", subscription: { phase: "TRIAL", plan: "BUSINESS", daysLeft: 5 } }],
    });
  });

  it("devuelve dueño, usuarios activos y resumen de la suscripción de cada negocio", async () => {
    const admin = await createAdmin();
    const { business, owner, cashier } = await createShop({ name: "Café Central", document: "900111222" });
    await db.user.update({ where: { id: owner.id }, data: { phone: "3001234567" } });
    await db.user.update({ where: { id: cashier.id }, data: { isActive: false } });
    await setSubscription(business.id, { plan: "BASIC", billingCycle: "ANNUAL", currentPeriodEnd: daysFromNow(-1) });

    const page = await callerFor(admin).platform.listBusinesses({});

    expect(page).toEqual({
      nextCursor: null,
      items: [
        {
          id: business.id,
          name: "Café Central",
          document: "900111222",
          createdAt: business.createdAt,
          owner: { id: owner.id, name: owner.name, email: owner.email, phone: "3001234567" },
          subscription: {
            plan: "BASIC",
            billingCycle: "ANNUAL",
            phase: "PAST_DUE",
            endsAt: expect.any(Date) as Date,
            daysLeft: 0,
            graceDaysLeft: 2,
          },
          activeUsers: 1,
        },
      ],
    });
  });

  it("muestra el plan efectivo cuando un cambio programado ya empezó", async () => {
    const admin = await createAdmin();
    const { business } = await createShop();
    await setSubscription(business.id, {
      plan: "PRO",
      scheduledPlan: "BASIC",
      scheduledCycle: "ANNUAL",
      scheduledFrom: daysFromNow(-1),
    });

    const page = await callerFor(admin).platform.listBusinesses({});
    expect(page.items[0]!.subscription).toMatchObject({ plan: "BASIC", billingCycle: "ANNUAL", phase: "ACTIVE" });
  });

  it("pagina por cursor del más nuevo al más antiguo, sin repetir ni saltar", async () => {
    const admin = await createAdmin();
    const created: string[] = [];
    for (let i = 0; i < 5; i++) {
      const business = await createBusiness({ name: `Negocio ${i}`, createdAt: daysFromNow(-i) });
      created.push(business.id);
    }
    const caller = callerFor(admin);

    const first = await caller.platform.listBusinesses({ limit: 2 });
    const second = await caller.platform.listBusinesses({ limit: 2, cursor: first.nextCursor! });
    const third = await caller.platform.listBusinesses({ limit: 2, cursor: second.nextCursor! });

    expect(first.nextCursor).toBe(created[1]);
    expect(second.nextCursor).toBe(created[3]);
    expect(third.nextCursor).toBeNull();
    expect([...first.items, ...second.items, ...third.items].map((b) => b.id)).toEqual(created);
    // Negocio sin usuarios: sin dueño y sin activos.
    expect(first.items[0]).toMatchObject({ owner: null, activeUsers: 0 });

    // Página exacta: no anuncia una siguiente que no existe.
    await expect(caller.platform.listBusinesses({ limit: 5 })).resolves.toMatchObject({ nextCursor: null });
    await expect(caller.platform.listBusinesses({ limit: 0 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.platform.listBusinesses({ limit: 101 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("busca por nombre, documento y datos del propietario", async () => {
    const admin = await createAdmin();
    const cafe = await createShop({ name: "Café Central", document: "900111222" });
    const tienda = await createShop({ name: "Tienda Doña Rosa", document: "800333444" });
    await db.user.update({ where: { id: tienda.owner.id }, data: { name: "Rosa Pérez", email: "rosa@tienda.co" } });
    // El correo de un cajero no sirve para encontrar el negocio.
    await db.user.update({ where: { id: cafe.cashier.id }, data: { email: "rosario@cafe.co" } });
    const search = async (text: string) =>
      (await callerFor(admin).platform.listBusinesses({ search: text })).items.map((b) => b.id);

    await expect(search("  café ")).resolves.toEqual([cafe.business.id]);
    await expect(search("800333")).resolves.toEqual([tienda.business.id]);
    await expect(search("ROSA@tienda")).resolves.toEqual([tienda.business.id]);
    await expect(search("pérez")).resolves.toEqual([tienda.business.id]);
    await expect(search("rosario")).resolves.toEqual([]);
    await expect(search("no existe")).resolves.toEqual([]);
  });

  it("cuenta los pagos que quedaron para revisión manual", async () => {
    const admin = await createAdmin();
    const { owner } = await createShop();
    const checkout = await callerFor(owner).billing.checkout({ plan: "PRO", cycle: "MONTHLY" });
    const gatewayTx = {
      provider: "mock",
      transactionId: "tx-1",
      reference: checkout.reference,
      currency: "COP",
      statusMessage: null,
    } as const;

    await processGatewayTransaction(db, { ...gatewayTx, status: "APPROVED", amountInCents: 100 });
    await expect(callerFor(admin).platform.overview()).resolves.toMatchObject({ paymentsToReview: 1 });

    // El pago correcto resuelve el intento con monto distinto...
    await processGatewayTransaction(db, { ...gatewayTx, status: "APPROVED", amountInCents: checkout.amountInCents });
    await expect(callerFor(admin).platform.overview()).resolves.toMatchObject({ paymentsToReview: 0, active: 1 });

    // ...y una anulación posterior lo vuelve a marcar.
    await processGatewayTransaction(db, { ...gatewayTx, status: "VOIDED", amountInCents: checkout.amountInCents });
    await expect(callerFor(admin).platform.overview()).resolves.toMatchObject({ paymentsToReview: 1 });
  });
});

describe("platform.getBusiness", () => {
  it("devuelve el detalle con consumo, usuarios, pagos y bitácora", async () => {
    const admin = await createAdmin();
    const now = new Date();
    const { business, owner, cashier } = await createShop({
      name: "Café Central",
      address: "Calle 10 # 5-20",
      phone: "6041234567",
      email: "contacto@cafe.co",
    });
    const inactive = await createUser({ businessId: business.id, role: "CASHIER", isActive: false });
    const subscription = await setSubscription(business.id, {
      plan: "BASIC",
      scheduledPlan: "PRO",
      scheduledCycle: "MONTHLY",
      scheduledFrom: daysFromNow(30),
    });

    await createProduct(business.id);
    await createProduct(business.id);
    await createProduct(business.id, { isActive: false });
    await db.usageCounter.createMany({
      data: [
        { businessId: business.id, metric: USAGE_METRICS.invoiceEmails, period: monthKey(now), value: 7 },
        { businessId: business.id, metric: USAGE_METRICS.invoiceEmails, period: "2020-01", value: 99 },
        { businessId: business.id, metric: USAGE_METRICS.storageBytes, period: "total", value: 2048 },
      ],
    });
    const sale = { businessId: business.id, userId: cashier.id, subtotal: 1000, total: 1000 };
    const lastSaleAt = daysFromNow(-2);
    await db.sale.createMany({
      data: [
        { ...sale, createdAt: lastSaleAt },
        { ...sale, createdAt: daysFromNow(-40) },
        { ...sale, status: "VOIDED", createdAt: daysFromNow(-1) },
      ],
    });

    const payment = {
      subscriptionId: subscription.id,
      businessId: business.id,
      plan: "BASIC" as const,
      billingCycle: "MONTHLY" as const,
      status: "APPROVED" as const,
    };
    const manual = await db.subscriptionPayment.create({
      data: {
        ...payment,
        reference: "BLF-MANUAL-1",
        provider: "manual",
        kind: "MANUAL",
        amountInCents: 2_990_000,
        createdById: admin.id,
        grantReason: "MANUAL_PAYMENT",
        grantDays: 30,
        grantNote: "Pagó por Nequi",
        externalReference: "M1234567",
        periodStart: daysFromNow(-1),
        periodEnd: daysFromNow(29),
        paidAt: now,
        revokedAt: now,
        createdAt: daysFromNow(-1),
      },
    });
    const gateway = await db.subscriptionPayment.create({
      data: {
        ...payment,
        reference: "BLF-WOMPI-1",
        provider: "wompi",
        kind: "PERIOD",
        amountInCents: 2_990_000,
        createdById: owner.id,
        needsReview: true,
        statusMessage: "Wompi reportó anulación después de aprobado: revisar manualmente.",
        createdAt: daysFromNow(-3),
      },
    });
    const audit = await db.platformAuditLog.create({
      data: {
        adminId: admin.id,
        adminEmail: ADMIN_EMAIL,
        adminName: admin.name,
        action: "GRANT_PLAN",
        businessId: business.id,
        businessName: business.name,
        entityType: "SubscriptionPayment",
        entityId: manual.id,
        summary: "Activó el plan Básico por 30 días (pago manual)",
        detail: { days: 30 },
        ip: "10.0.0.9",
        userAgent: "vitest",
      },
    });
    // Datos de otro negocio: no deben mezclarse.
    const other = await createShop();
    await createProduct(other.business.id);
    await db.platformAuditLog.create({
      data: { adminEmail: ADMIN_EMAIL, action: "EXTEND_TRIAL", businessId: other.business.id, summary: "Otro" },
    });

    const detail = await callerFor(admin).platform.getBusiness({ businessId: business.id });

    expect(detail).toMatchObject({
      id: business.id,
      name: "Café Central",
      address: "Calle 10 # 5-20",
      phone: "6041234567",
      email: "contacto@cafe.co",
      owner: { id: owner.id },
      activeUsers: 2,
      subscription: { plan: "BASIC", billingCycle: "MONTHLY", phase: "ACTIVE", daysLeft: 30 },
      subscriptionDates: {
        trialEndsAt: subscription.trialEndsAt,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        canceledAt: null,
        scheduledPlan: "PRO",
        scheduledFrom: subscription.scheduledFrom,
      },
    });
    expect(detail.usage).toEqual({
      activeUsers: 2,
      usersLimit: 2,
      activeProducts: 2,
      productsLimit: 500,
      invoiceEmailsThisMonth: 7,
      invoiceEmailsLimit: 100,
      storageBytes: 2048,
      storageLimitBytes: 300 * 1024 * 1024,
      salesLast30Days: 1,
      lastSaleAt,
    });
    expect(detail.users).toHaveLength(3);
    expect(detail.users[0]).toEqual({ id: owner.id, name: owner.name, email: owner.email, role: "OWNER", isActive: true });
    expect(detail.users).toContainEqual({
      id: inactive.id,
      name: inactive.name,
      email: inactive.email,
      role: "CASHIER",
      isActive: false,
    });

    expect(detail.recentPayments.map((p) => p.id)).toEqual([manual.id, gateway.id]);
    expect(detail.recentPayments[0]).toMatchObject({
      businessId: business.id,
      businessName: "Café Central",
      reference: "BLF-MANUAL-1",
      provider: "manual",
      kind: "MANUAL",
      amountInCents: 2_990_000,
      status: "APPROVED",
      needsReview: false,
      grant: {
        reason: "MANUAL_PAYMENT",
        days: 30,
        note: "Pagó por Nequi",
        grantedBy: "Admin Plataforma",
        revokedAt: now,
      },
    });
    // Los pagos de pasarela no llevan `grant` aunque tengan `createdById`.
    expect(detail.recentPayments[1]).toMatchObject({ kind: "PERIOD", grant: null, needsReview: true });

    expect(detail.recentAudit).toEqual([
      {
        id: audit.id,
        createdAt: audit.createdAt,
        adminName: "Admin Plataforma",
        adminEmail: ADMIN_EMAIL,
        action: "GRANT_PLAN",
        businessId: business.id,
        businessName: "Café Central",
        summary: "Activó el plan Básico por 30 días (pago manual)",
        ip: "10.0.0.9",
      },
    ]);
  });

  it("responde NOT_FOUND si el negocio no existe y valida la entrada", async () => {
    const admin = await createAdmin();

    await expect(callerFor(admin).platform.getBusiness({ businessId: "no-existe" })).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Negocio no encontrado.",
    });
    await expect(callerFor(admin).platform.getBusiness({ businessId: "" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("funciona con un negocio sin suscripción ni actividad", async () => {
    const admin = await createAdmin();
    const business = await createBusiness();

    await expect(callerFor(admin).platform.getBusiness({ businessId: business.id })).resolves.toMatchObject({
      owner: null,
      activeUsers: 0,
      subscription: { phase: "READ_ONLY", endsAt: null, daysLeft: 0 },
      subscriptionDates: { trialEndsAt: null, currentPeriodEnd: null, scheduledPlan: null, scheduledFrom: null },
      usage: { activeProducts: 0, salesLast30Days: 0, lastSaleAt: null, invoiceEmailsThisMonth: 0, storageBytes: 0 },
      users: [],
      recentPayments: [],
      recentAudit: [],
    });
    // Consultar no crea la suscripción de prueba.
    await expect(db.subscription.count()).resolves.toBe(0);
  });
});

describe("PlatformAuditLog", () => {
  it("se conserva al borrar al administrador o al negocio", async () => {
    const admin = await createAdmin();
    const business = await createBusiness({ name: "Negocio Borrado" });
    const log = await db.platformAuditLog.create({
      data: {
        adminId: admin.id,
        adminEmail: ADMIN_EMAIL,
        adminName: admin.name,
        action: "EXTEND_TRIAL",
        businessId: business.id,
        businessName: business.name,
        summary: "Extendió la prueba 7 días",
      },
    });

    await db.business.delete({ where: { id: business.id } });
    await db.user.delete({ where: { id: admin.id } });

    await expect(db.platformAuditLog.findUniqueOrThrow({ where: { id: log.id } })).resolves.toMatchObject({
      adminId: null,
      adminEmail: ADMIN_EMAIL,
      adminName: "Admin Plataforma",
      businessId: null,
      businessName: "Negocio Borrado",
      summary: "Extendió la prueba 7 días",
    });
  });
});

describe("contraseña del administrador de la plataforma", () => {
  it("al cambiarla exige la misma política del alta, no la de los negocios", async () => {
    const bcrypt = (await import("bcryptjs")).default;
    const admin = await createAdmin();
    await db.user.update({ where: { id: admin.id }, data: { passwordHash: await bcrypt.hash("Actual-Clave-2026!", 4) } });
    const change = (newPassword: string) =>
      callerFor(admin).auth.changePassword({ currentPassword: "Actual-Clave-2026!", newPassword });

    // Válida para un negocio (10 caracteres, letra, número y símbolo), insuficiente para el administrador.
    await expect(change("Definitiva#12")).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "La contraseña del administrador debe tener mínimo 14 caracteres.",
    });
    await expect(change("definitiva-clave-2026")).rejects.toThrow("debe incluir una letra mayúscula");
    await expect(change("DefinitivaClave2026")).rejects.toThrow("carácter especial");
    await expect(change("Definitiva-Clave-Larga")).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(change("Admin-Clave-2026!")).rejects.toThrow("no puede contener tu correo");
    await expect(db.user.findUniqueOrThrow({ where: { id: admin.id } })).resolves.toMatchObject({ sessionVersion: 0 });

    await expect(change("Nueva-Clave-Fuerte-2027!")).resolves.toMatchObject({ requiresReLogin: true });
    const updated = await db.user.findUniqueOrThrow({ where: { id: admin.id } });
    await expect(bcrypt.compare("Nueva-Clave-Fuerte-2027!", updated.passwordHash!)).resolves.toBe(true);
  });

  it("no se restablece por correo aunque exista un código vigente", async () => {
    const { hashCode } = await import("~/server/lib/secureCode");
    const admin = await createAdmin();
    await db.passwordResetToken.create({
      data: { userId: admin.id, tokenHash: hashCode("123456"), expiresAt: daysFromNow(1) },
    });

    await expect(
      callerFor(null).auth.resetPassword({ email: ADMIN_EMAIL, token: "123456", newPassword: "Nueva-Clave-Fuerte-2027!" }),
    ).rejects.toThrow("Código incorrecto o vencido.");
    await expect(db.user.findUniqueOrThrow({ where: { id: admin.id } })).resolves.toMatchObject({
      passwordHash: null,
      sessionVersion: 0,
    });
  });
});

describe("platform.listBusinesses: comodines en la búsqueda", () => {
  it("trata % y _ como texto, no como comodines", async () => {
    const admin = await createAdmin();
    const percent = await createBusiness({ name: "Descuentos 100% Reales" });
    const underscore = await createBusiness({ name: "tienda_la_14" });
    await createBusiness({ name: "Descuentos 1000 Reales" });
    await createBusiness({ name: "tiendaXlaY14" });
    const search = async (text: string) =>
      (await callerFor(admin).platform.listBusinesses({ search: text })).items.map((b) => b.id);

    await expect(search("100%")).resolves.toEqual([percent.id]);
    await expect(search("tienda_la")).resolves.toEqual([underscore.id]);
    await expect(search("%")).resolves.toEqual([percent.id]);
    await expect(search("_")).resolves.toEqual([underscore.id]);
  });
});
