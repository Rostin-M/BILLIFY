import { z } from "zod";

import { createTRPCRouter, ownerProcedure } from "~/server/api/trpc";
import { getPeriodRangeBogota } from "~/server/lib/bogotaTime";

export const auditLogRouter = createTRPCRouter({
  list: ownerProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(200).default(100),
        action: z.string().trim().max(64).optional(),
      }),
    )
    .query(({ ctx, input }) => {
      return ctx.db.auditLog.findMany({
        where: {
          businessId: ctx.session.user.businessId,
          ...(input.action ? { action: input.action } : {}),
        },
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          detail: true,
          createdAt: true,
          user: { select: { name: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
        take: input.limit,
      });
    }),

  // Exportación de movimientos de caja del período (para CSV)
  exportCashPeriod: ownerProcedure
    .input(z.object({ period: z.enum(["today", "week", "month"]) }))
    .query(({ ctx, input }) => {
      const { businessId } = ctx.session.user;
      const { from, to } = getPeriodRangeBogota(input.period);

      return ctx.db.cashMovement.findMany({
        where: { businessId, createdAt: { gte: from, lte: to } },
        select: {
          id: true,
          type: true,
          amount: true,
          description: true,
          createdAt: true,
          user: { select: { name: true } },
        },
        orderBy: { createdAt: "asc" },
      });
    }),
});
