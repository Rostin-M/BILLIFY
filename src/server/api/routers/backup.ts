import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { backupFileSchema, firstBackupIssue } from "~/lib/backup/format";
import { createTRPCRouter, ownerProcedure } from "~/server/api/trpc";
import { buildBackup } from "~/server/backup/export";
import { importBackup } from "~/server/backup/import";

/**
 * Respaldo de productos y clientes (con fiados pendientes) en JSON.
 * Solo el propietario, en todos los planes. Exportar es lectura (sirve en solo
 * lectura); importar es mutación y respeta el límite de productos del plan.
 */
export const backupRouter = createTRPCRouter({
  export: ownerProcedure.query(({ ctx }) =>
    buildBackup(ctx.db, ctx.user.businessId),
  ),

  import: ownerProcedure
    .input(z.object({ file: z.unknown() }))
    .mutation(async ({ ctx, input }) => {
      const parsed = backupFileSchema.safeParse(input.file);
      if (!parsed.success) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: firstBackupIssue(parsed.error),
        });
      }
      return importBackup(
        ctx.db,
        {
          businessId: ctx.user.businessId,
          userId: ctx.user.id,
          plan: ctx.subscription.billing.plan,
        },
        parsed.data,
      );
    }),
});
