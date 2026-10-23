import { TRPCError } from "@trpc/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { businessProcedure, createTRPCRouter, ownerProcedure } from "~/server/api/trpc";
import { assertCashRegisterNotStale, resolveSaleCashRegisterId } from "~/server/lib/cashRegisterGuard";
import { creditLimitLabel, renderCreditTerms } from "~/lib/creditTerms";
import type { BusinessForAgreementPdf } from "~/lib/pdf/AcuerdoFiadoPDF";
import { computeCustomerDebt } from "~/server/lib/credit";
import { sendCreditAgreementEmail } from "~/server/lib/email";
import { generateAcuerdoFiadoPdfBuffer } from "~/server/lib/generateFacturaPdf";
import { idempotencyKeySchema, runIdempotent } from "~/server/lib/idempotency";

const customerSchema = z.object({
  name: z.string().trim().min(2, "El nombre es obligatorio").max(120, "El nombre es demasiado largo"),
  alias: z.string().trim().max(120).optional(),
  document: z.string().trim().max(20, "El documento es demasiado largo").optional(),
  email: z
    .string()
    .trim()
    .max(254)
    .email("El correo no es válido. Ej: nombre@dominio.com")
    .optional()
    .or(z.literal("")),
  phone: z.string().trim().max(20, "El teléfono es demasiado largo").optional(),
});


const MAX_SIGNATURE_LENGTH = 400_000;

const slug = (v: string) =>
  v.normalize("NFD").split(/[^A-Za-z0-9]+/).filter(Boolean).join("-").slice(0, 40) || "cliente";

async function loadAgreementForPdf(db: Prisma.TransactionClient, businessId: string, agreementId: string) {
  const agreement = await db.creditAgreement.findFirst({
    where: { id: agreementId, businessId },
    select: {
      id: true, createdAt: true, creditLimit: true, creditTermDays: true, terms: true,
      signerName: true, signerDocument: true, signature: true,
      user: { select: { name: true } },
      customer: { select: { name: true, document: true, phone: true, email: true } },
    },
  });
  if (!agreement) throw new TRPCError({ code: "NOT_FOUND", message: "Acuerdo no encontrado." });
  const business = await db.business.findUniqueOrThrow({
    where: { id: businessId },
    select: { name: true, document: true, address: true, phone: true, email: true, logoUrl: true },
  });
  const { user, ...rest } = agreement;
  return { business, agreement: { ...rest, registeredBy: user.name } };
}

async function emailAgreement(
  db: Prisma.TransactionClient,
  params: {
    agreementId: string;
    to: string;
    business: BusinessForAgreementPdf & { email: string | null };
    customer: { name: string; document: string | null; phone: string | null; email: string | null };
  },
): Promise<boolean> {
  const agreement = await db.creditAgreement.findUniqueOrThrow({
    where: { id: params.agreementId },
    select: {
      id: true, createdAt: true, creditLimit: true, creditTermDays: true, terms: true,
      signerName: true, signerDocument: true, signature: true, user: { select: { name: true } },
    },
  });
  try {
    const { user, ...rest } = agreement;
    const pdf = await generateAcuerdoFiadoPdfBuffer(params.business, { ...rest, customer: params.customer, registeredBy: user.name });
    await sendCreditAgreementEmail(params.to, pdf, {
      businessName: params.business.name,
      customerName: params.customer.name,
      creditLimitLabel: creditLimitLabel(agreement.creditLimit),
      creditTermLabel: agreement.creditTermDays ? `${agreement.creditTermDays} días` : "Sin fecha fija",
      signedAt: agreement.createdAt,
      business: params.business,
    });
    await db.creditAgreement.update({ where: { id: agreement.id }, data: { emailedTo: params.to, emailedAt: new Date() } });
    return true;
  } catch (error) {
    console.error("[creditAgreement] no se pudo enviar el acuerdo", error);
    return false;
  }
}

function paymentMessage(customerName: string, remainingDebt: number): string {
  return remainingDebt <= 0.01
    ? `Deuda de ${customerName} saldada por completo.`
    : `Abono registrado. Deuda restante: ${remainingDebt.toFixed(0)}.`;
}

export const customerRouter = createTRPCRouter({
  // Búsqueda rápida para el POS — ambos roles
  search: businessProcedure
    .input(z.object({ q: z.string().trim().max(120).default("") }))
    .query(({ ctx, input }) => {
      const { businessId } = ctx.session.user;

      return ctx.db.customer.findMany({
        where: {
          businessId,
          isActive: true,
          ...(input.q
            ? {
                OR: [
                  { name: { contains: input.q, mode: "insensitive" } },
                  { alias: { contains: input.q, mode: "insensitive" } },
                  { document: { contains: input.q, mode: "insensitive" } },
                  { phone: { contains: input.q, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        select: { id: true, name: true, alias: true, document: true, phone: true, email: true },
        orderBy: { name: "asc" },
        take: 10,
      });
    }),

  // Lista completa para la página de gestión — solo OWNER
  list: ownerProcedure.query(async ({ ctx }) => {
    const { businessId } = ctx.session.user;

    const [customers, creditTotals, paidTotals] = await Promise.all([
      ctx.db.customer.findMany({
        where: { businessId },
        select: {
          id: true,
          name: true,
          alias: true,
          document: true,
          email: true,
          phone: true,
          isActive: true,
          createdAt: true,
          _count: { select: { sales: true } },
        },
        orderBy: [{ isActive: "desc" }, { name: "asc" }],
      }),
      ctx.db.sale.groupBy({
        by: ["customerId"],
        where: { businessId, paymentMethod: "CREDIT", status: "COMPLETED", customerId: { not: null } },
        _sum: { total: true },
      }),
      ctx.db.customerPayment.groupBy({
        by: ["customerId"],
        where: { businessId },
        _sum: { amount: true },
      }),
    ]);

    const creditMap = new Map(creditTotals.map((c) => [c.customerId, c._sum.total ?? 0]));
    const paidMap = new Map(paidTotals.map((p) => [p.customerId, p._sum.amount ?? 0]));

    return customers.map((c) => ({
      ...c,
      debt: (creditMap.get(c.id) ?? 0) - (paidMap.get(c.id) ?? 0),
    }));
  }),

  // Clientes con deuda pendiente — ambos roles, para la vista de Fiados
  listDebtors: businessProcedure.query(async ({ ctx }) => {
    const { businessId } = ctx.session.user;

    const [creditTotals, paidTotals] = await Promise.all([
      ctx.db.sale.groupBy({
        by: ["customerId"],
        where: { businessId, paymentMethod: "CREDIT", status: "COMPLETED", customerId: { not: null } },
        _sum: { total: true },
      }),
      ctx.db.customerPayment.groupBy({
        by: ["customerId"],
        where: { businessId },
        _sum: { amount: true },
      }),
    ]);

    const paidMap = new Map(paidTotals.map((p) => [p.customerId, p._sum.amount ?? 0]));
    const debtorIds = creditTotals
      .map((c) => ({ customerId: c.customerId!, debt: (c._sum.total ?? 0) - (paidMap.get(c.customerId!) ?? 0) }))
      .filter((d) => d.debt > 0.01);

    if (debtorIds.length === 0) return [];

    const customers = await ctx.db.customer.findMany({
      where: { id: { in: debtorIds.map((d) => d.customerId) }, businessId },
      select: { id: true, name: true, alias: true, phone: true },
    });
    const customerMap = new Map(customers.map((c) => [c.id, c]));

    return debtorIds
      .map((d) => ({ ...customerMap.get(d.customerId)!, debt: d.debt }))
      .filter((c) => !!c.id)
      .sort((a, b) => b.debt - a.debt);
  }),

  // Crear cliente — ambos roles (cajero puede crear al vuelo en la venta)
  create: businessProcedure.input(customerSchema).mutation(async ({ ctx, input }) => {
    const { businessId, id: userId } = ctx.session.user;

    const customer = await ctx.db.customer.create({
      data: {
        businessId,
        name: input.name,
        alias: input.alias ?? null,
        document: input.document ?? null,
        email: input.email?.length ? input.email : null,
        phone: input.phone ?? null,
      },
      select: { id: true, name: true },
    });

    await ctx.db.auditLog.create({
      data: {
        businessId,
        userId,
        action: "CREATE_CUSTOMER",
        entityType: "Customer",
        entityId: customer.id,
        detail: { name: input.name },
      },
    });

    return { id: customer.id, name: customer.name, message: "Cliente creado correctamente." };
  }),

  // Editar cliente — solo OWNER
  update: ownerProcedure
    .input(customerSchema.extend({ id: z.string().min(1).max(64) }))
    .mutation(async ({ ctx, input }) => {
      const { businessId, id: userId } = ctx.session.user;

      const existing = await ctx.db.customer.findFirst({
        where: { id: input.id, businessId },
        select: { id: true },
      });

      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Cliente no encontrado en este negocio." });
      }

      await ctx.db.customer.update({
        where: { id: input.id },
        data: {
          name: input.name,
          alias: input.alias ?? null,
          document: input.document ?? null,
          email: input.email?.length ? input.email : null,
          phone: input.phone ?? null,
        },
      });

      await ctx.db.auditLog.create({
        data: {
          businessId,
          userId,
          action: "UPDATE_CUSTOMER",
          entityType: "Customer",
          entityId: input.id,
          detail: { name: input.name },
        },
      });

      return { message: "Cliente actualizado correctamente." };
    }),

  // Activar / desactivar — solo OWNER
  setActive: ownerProcedure
    .input(z.object({ customerId: z.string().min(1).max(64), isActive: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const { businessId, id: userId } = ctx.session.user;

      const customer = await ctx.db.customer.findFirst({
        where: { id: input.customerId, businessId },
        select: { id: true, name: true },
      });

      if (!customer) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Cliente no encontrado en este negocio." });
      }

      await ctx.db.customer.update({
        where: { id: input.customerId },
        data: { isActive: input.isActive },
      });

      await ctx.db.auditLog.create({
        data: {
          businessId,
          userId,
          action: input.isActive ? "ACTIVATE_CUSTOMER" : "DEACTIVATE_CUSTOMER",
          entityType: "Customer",
          entityId: input.customerId,
          detail: { name: customer.name },
        },
      });

      return {
        message: input.isActive ? "Cliente activado correctamente." : "Cliente desactivado correctamente.",
      };
    }),

  // Historial de ventas por cliente — ambos roles
  history: businessProcedure
    .input(z.object({ customerId: z.string().min(1).max(64) }))
    .query(async ({ ctx, input }) => {
      const { businessId } = ctx.session.user;

      const customer = await ctx.db.customer.findFirst({
        where: { id: input.customerId, businessId },
        select: { id: true },
      });

      if (!customer) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Cliente no encontrado en este negocio." });
      }

      const [sales, payments] = await Promise.all([
        ctx.db.sale.findMany({
          where: { businessId, customerId: input.customerId, status: "COMPLETED" },
          select: {
            id: true,
            invoiceNumber: true,
            saleType: true,
            total: true,
            paymentMethod: true,
            createdAt: true,
            items: { select: { name: true, quantity: true, price: true, subtotal: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 20,
        }),
        ctx.db.customerPayment.findMany({
          where: { businessId, customerId: input.customerId },
          select: { id: true, amount: true, note: true, paymentMethod: true, createdAt: true, user: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
          take: 20,
        }),
      ]);

      const totalSpent = sales.reduce((sum, s) => sum + s.total, 0);
      const creditTotal = sales
        .filter((s) => s.paymentMethod === "CREDIT")
        .reduce((sum, s) => sum + s.total, 0);
      const paidTotal = payments.reduce((sum, p) => sum + p.amount, 0);
      const debt = creditTotal - paidTotal;

      return { sales, payments, totalSpent, creditTotal, paidTotal, debt };
    }),

  // Registrar abono o pago completo de la deuda — ambos roles
  addPayment: businessProcedure
    .input(
      z.object({
        customerId: z.string().min(1).max(64),
        amount: z
          .number()
          .finite()
          .positive("El monto debe ser mayor a cero")
          .max(1e9, "Monto demasiado grande"),
        note: z.string().trim().max(500).optional(),
        // Un abono nunca es "fiado". Solo el efectivo suma al saldo de la caja.
        paymentMethod: z.enum(["CASH", "CARD", "TRANSFER"]).default("CASH"),
        idempotencyKey: idempotencyKeySchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { businessId, id: userId } = ctx.session.user;

      const registerPayment = async () => {
        // Igual que una venta: no se recibe dinero en una caja abierta desde un día anterior.
        await assertCashRegisterNotStale(ctx.db, businessId, userId);

        return ctx.db.$transaction(async (tx) => {
          // Bloquear al cliente: dos abonos simultáneos se procesan uno tras otro y el segundo
          // ya ve la deuda descontada por el primero (no se puede abonar más de lo que se debe).
          const locked = await tx.$queryRaw<{ id: string; name: string }[]>`
            SELECT "id", "name" FROM "customers"
             WHERE "id" = ${input.customerId} AND "business_id" = ${businessId}
             FOR UPDATE
          `;
          const customer = locked[0];
          if (!customer) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Cliente no encontrado en este negocio." });
          }

          const currentDebt = await computeCustomerDebt(tx, businessId, customer.id);

          if (currentDebt <= 0.01) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Este cliente no tiene deuda pendiente." });
          }
          if (input.amount > currentDebt + 0.01) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `El abono no puede ser mayor a la deuda actual (${currentDebt.toFixed(0)}).`,
            });
          }

          // Caja en la que entra el abono (la de quien lo recibe o la única abierta). El efectivo
          // tiene que entrar a una caja para que quede en el cuadre del cierre.
          const cashRegisterId = await resolveSaleCashRegisterId(tx, businessId, userId);
          if (input.paymentMethod === "CASH" && !cashRegisterId) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "Abre la caja para recibir abonos en efectivo. Si te pagaron por transferencia o tarjeta, elige esa forma de pago.",
            });
          }

          const payment = await tx.customerPayment.create({
            data: {
              businessId,
              customerId: customer.id,
              userId,
              amount: input.amount,
              note: input.note ?? null,
              paymentMethod: input.paymentMethod,
              cashRegisterId,
              idempotencyKey: input.idempotencyKey ?? null,
            },
            select: { id: true },
          });

          await tx.auditLog.create({
            data: {
              businessId,
              userId,
              action: "CREATE_CUSTOMER_PAYMENT",
              entityType: "CustomerPayment",
              entityId: payment.id,
              detail: {
                customerName: customer.name,
                amount: input.amount,
                debtBefore: currentDebt,
                paymentMethod: input.paymentMethod,
                cashRegisterId,
              },
            },
          });

          const remainingDebt = currentDebt - input.amount;
          return { remainingDebt, message: paymentMessage(customer.name, remainingDebt) };
        });
      };

      // Doble clic / reintento con la misma clave → no registrar el abono dos veces.
      return runIdempotent({
        key: input.idempotencyKey,
        findExisting: async () => {
          const existing = await ctx.db.customerPayment.findFirst({
            where: { businessId, idempotencyKey: input.idempotencyKey },
            select: { customerId: true, customer: { select: { name: true } } },
          });
          if (!existing) return null;
          const remainingDebt = await computeCustomerDebt(ctx.db, businessId, existing.customerId);
          return { remainingDebt, message: paymentMessage(existing.customer.name, remainingDebt) };
        },
        run: registerPayment,
      });
    }),

  creditAccount: businessProcedure
    .input(z.object({ customerId: z.string().min(1).max(64) }))
    .query(async ({ ctx, input }) => {
      const { businessId } = ctx.session.user;
      const customer = await ctx.db.customer.findFirst({
        where: { id: input.customerId, businessId },
        select: {
          id: true, name: true, document: true, email: true, phone: true, creditLimit: true, creditTermDays: true,
          creditAgreements: {
            select: { id: true, createdAt: true, creditLimit: true, creditTermDays: true, signerName: true, emailedTo: true, emailedAt: true, signature: true, user: { select: { name: true } } },
            orderBy: { createdAt: "desc" },
            take: 10,
          },
        },
      });
      if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "Cliente no encontrado en este negocio." });

      const debt = await computeCustomerDebt(ctx.db, businessId, customer.id);
      const { creditAgreements, ...rest } = customer;
      return {
        ...rest,
        debt,
        agreements: creditAgreements.map(({ signature, ...a }) => ({ ...a, signed: !!signature })),
      };
    }),

  creditSettings: businessProcedure.query(async ({ ctx }) => {
    const business = await ctx.db.business.findUniqueOrThrow({
      where: { id: ctx.session.user.businessId },
      select: { name: true, creditTerms: true, creditSignatureRequired: true },
    });
    return business;
  }),

  signCreditAgreement: businessProcedure
    .input(z.object({
      customerId: z.string().min(1).max(64),
      creditLimit: z.number().finite().positive("El monto máximo debe ser mayor a cero").max(1e9).nullable(),
      creditTermDays: z.number().int().positive("El plazo debe ser de al menos un día").max(365, "Máximo 365 días").nullable(),
      signerName: z.string().trim().min(2, "Escribe el nombre de quien firma").max(120),
      signerDocument: z.string().trim().max(20).optional(),
      signature: z
        .string()
        .max(MAX_SIGNATURE_LENGTH, "La firma es demasiado grande")
        .regex(/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/, "Firma inválida")
        .optional(),
      email: z.string().trim().max(254).email("El correo no es válido. Ej: nombre@dominio.com").optional().or(z.literal("")),
    }))
    .mutation(async ({ ctx, input }) => {
      const { businessId, id: userId } = ctx.session.user;

      const [business, customer] = await Promise.all([
        ctx.db.business.findUniqueOrThrow({
          where: { id: businessId },
          select: { name: true, document: true, address: true, phone: true, email: true, logoUrl: true, creditTerms: true, creditSignatureRequired: true },
        }),
        ctx.db.customer.findFirst({
          where: { id: input.customerId, businessId, isActive: true },
          select: { id: true, name: true, document: true, phone: true, email: true },
        }),
      ]);
      if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "Cliente no encontrado en este negocio." });
      if (business.creditSignatureRequired && !input.signature) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Este negocio exige la firma del cliente para abrirle el fiado." });
      }

      const email = input.email?.trim().length ? input.email.trim() : null;
      const terms = renderCreditTerms(business.creditTerms, {
        businessName: business.name,
        customerName: customer.name,
        creditLimit: input.creditLimit,
        creditTermDays: input.creditTermDays,
      });

      const agreement = await ctx.db.$transaction(async (tx) => {
        await tx.customer.update({
          where: { id: customer.id },
          data: {
            creditLimit: input.creditLimit,
            creditTermDays: input.creditTermDays,
            ...(email && !customer.email ? { email } : {}),
            ...(input.signerDocument && !customer.document ? { document: input.signerDocument } : {}),
          },
        });
        const created = await tx.creditAgreement.create({
          data: {
            businessId,
            customerId: customer.id,
            userId,
            creditLimit: input.creditLimit,
            creditTermDays: input.creditTermDays,
            terms,
            signerName: input.signerName,
            signerDocument: input.signerDocument?.length ? input.signerDocument : null,
            signature: input.signature ?? null,
          },
          select: { id: true, createdAt: true, user: { select: { name: true } } },
        });
        await tx.auditLog.create({
          data: {
            businessId, userId, action: "SIGN_CREDIT_AGREEMENT", entityType: "CreditAgreement", entityId: created.id,
            detail: {
              customerName: customer.name,
              creditLimit: input.creditLimit,
              creditTermDays: input.creditTermDays,
              signed: !!input.signature,
            },
          },
        });
        return created;
      });

      // Si el correo falla, el acuerdo ya quedó guardado y se puede reenviar.
      let emailed = false;
      if (email) {
        emailed = await emailAgreement(ctx.db, {
          agreementId: agreement.id,
          to: email,
          business,
          customer: { ...customer, document: customer.document ?? input.signerDocument ?? null, email },
        });
      }

      let message = "Cuenta de fiado abierta.";
      if (email) message = emailed ? `Cuenta de fiado abierta. Le enviamos el acuerdo a ${email}.` : "Cuenta de fiado abierta, pero no se pudo enviar el correo. Puedes reenviarlo.";
      return { id: agreement.id, emailed, message };
    }),

  updateCreditTerms: businessProcedure
    .input(z.object({
      customerId: z.string().min(1).max(64),
      creditLimit: z.number().finite().positive("El monto máximo debe ser mayor a cero").max(1e9).nullable(),
      creditTermDays: z.number().int().positive().max(365, "Máximo 365 días").nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { businessId, id: userId } = ctx.session.user;
      const customer = await ctx.db.customer.findFirst({
        where: { id: input.customerId, businessId },
        select: { id: true, name: true, creditLimit: true, creditTermDays: true },
      });
      if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "Cliente no encontrado en este negocio." });

      await ctx.db.customer.update({
        where: { id: customer.id },
        data: { creditLimit: input.creditLimit, creditTermDays: input.creditTermDays },
      });
      await ctx.db.auditLog.create({
        data: {
          businessId, userId, action: "UPDATE_CREDIT_TERMS", entityType: "Customer", entityId: customer.id,
          detail: {
            customerName: customer.name,
            before: { creditLimit: customer.creditLimit, creditTermDays: customer.creditTermDays },
            after: { creditLimit: input.creditLimit, creditTermDays: input.creditTermDays },
          },
        },
      });
      return { message: "Condiciones de fiado actualizadas." };
    }),

  creditAgreementPdf: businessProcedure
    .input(z.object({ agreementId: z.string().min(1).max(64) }))
    .mutation(async ({ ctx, input }) => {
      const { businessId } = ctx.session.user;
      const data = await loadAgreementForPdf(ctx.db, businessId, input.agreementId);
      const buffer = await generateAcuerdoFiadoPdfBuffer(data.business, data.agreement);
      return { fileName: `Acuerdo-fiado-${slug(data.agreement.customer.name)}.pdf`, base64: buffer.toString("base64") };
    }),

  resendCreditAgreement: businessProcedure
    .input(z.object({
      agreementId: z.string().min(1).max(64),
      email: z.string().trim().max(254).email("El correo no es válido. Ej: nombre@dominio.com"),
    }))
    .mutation(async ({ ctx, input }) => {
      const { businessId } = ctx.session.user;
      const { business, agreement } = await loadAgreementForPdf(ctx.db, businessId, input.agreementId);
      const ok = await emailAgreement(ctx.db, {
        agreementId: agreement.id,
        to: input.email,
        business,
        customer: agreement.customer,
      });
      if (!ok) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "No se pudo enviar el correo. Intenta de nuevo." });
      return { message: `Acuerdo enviado a ${input.email}.` };
    }),
});
