import { createTRPCRouter, ownerProcedure } from "~/server/api/trpc";

export const adminRouter = createTRPCRouter({
  // Conteo de registros por tabla del negocio.
  // Útil para verificar integridad de datos tras una restauración.
  dbStats: ownerProcedure.query(async ({ ctx }) => {
    const { businessId } = ctx.session.user;

    const [
      productos,
      ventas,
      clientes,
      movimientosInventario,
      cajas,
      movimientosCaja,
      auditLogs,
    ] = await Promise.all([
      ctx.db.product.count({ where: { businessId } }),
      ctx.db.sale.count({ where: { businessId } }),
      ctx.db.customer.count({ where: { businessId } }),
      ctx.db.inventoryMovement.count({ where: { businessId } }),
      ctx.db.cashRegister.count({ where: { businessId } }),
      ctx.db.cashMovement.count({ where: { businessId } }),
      ctx.db.auditLog.count({ where: { businessId } }),
    ]);

    return {
      tablas: {
        productos,
        ventas,
        clientes,
        movimientosInventario,
        cajas,
        movimientosCaja,
        auditLogs,
      },
      verificadoEn: new Date(),
    };
  }),
});
