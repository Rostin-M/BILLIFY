import { z } from "zod";

import { createTRPCRouter, ownerProcedure } from "~/server/api/trpc";
import { fillDayRange, getPeriodRangeBogota, toBogotaDateKey } from "~/server/lib/bogotaTime";

export const dashboardRouter = createTRPCRouter({
  summary: ownerProcedure
    .input(z.object({ period: z.enum(["today", "week", "month"]).default("today") }))
    .query(async ({ ctx, input }) => {
      const { businessId } = ctx.session.user;
      const { from, to } = getPeriodRangeBogota(input.period);
      const prevFrom = new Date(from.getTime() - (to.getTime() - from.getTime()));

      const [completedSales, voidedCount, inventoryCounts, openRegisters, lastClosed, prevSalesAgg] =
        await Promise.all([
          ctx.db.sale.findMany({
            where: { businessId, status: "COMPLETED", createdAt: { gte: from, lte: to } },
            select: {
              total: true,
              paymentMethod: true,
              createdAt: true,
              items: { select: { name: true, quantity: true, subtotal: true } },
            },
            orderBy: { createdAt: "asc" },
          }),
          ctx.db.sale.count({
            where: { businessId, status: "VOIDED", createdAt: { gte: from, lte: to } },
          }),
          ctx.db.product.groupBy({
            by: ["isActive"],
            where: { businessId },
            _count: true,
          }),
          // Todas las cajas abiertas: el saldo del tablero es la suma de sus saldos individuales.
          ctx.db.cashRegister.findMany({
            where: { businessId, status: "OPEN" },
            select: { id: true, openingBalance: true, movements: { select: { type: true, amount: true } } },
          }),
          ctx.db.cashRegister.findFirst({
            where: { businessId, status: "CLOSED" },
            select: { closedAt: true, closingBalance: true },
            orderBy: { closedAt: "desc" },
          }),
          ctx.db.sale.aggregate({
            where: { businessId, status: "COMPLETED", createdAt: { gte: prevFrom, lt: from } },
            _sum: { total: true },
            _count: true,
          }),
        ]);

      const byMethod = { CASH: 0, CARD: 0, TRANSFER: 0, CREDIT: 0 } as Record<string, number>;
      let salesTotal = 0;
      for (const sale of completedSales) {
        salesTotal += sale.total;
        byMethod[sale.paymentMethod] = (byMethod[sale.paymentMethod] ?? 0) + sale.total;
      }

      // Group sales by Bogotá date
      const dayMap = new Map<string, { count: number; total: number }>();
      for (const sale of completedSales) {
        const day = toBogotaDateKey(new Date(sale.createdAt));
        const existing = dayMap.get(day) ?? { count: 0, total: 0 };
        dayMap.set(day, { count: existing.count + 1, total: existing.total + sale.total });
      }

      const dayRange = fillDayRange(from, to).map((date) => ({
        date,
        ...(dayMap.get(date) ?? { count: 0, total: 0 }),
      }));

      const productMap = new Map<string, { quantitySold: number; revenue: number }>();
      for (const sale of completedSales) {
        for (const item of sale.items) {
          const existing = productMap.get(item.name) ?? { quantitySold: 0, revenue: 0 };
          productMap.set(item.name, {
            quantitySold: existing.quantitySold + item.quantity,
            revenue: existing.revenue + item.subtotal,
          });
        }
      }
      // "Más vendidos" = mayor cantidad, no mayor ingreso (un producto barato de alta rotación
      // importa más para decidir qué reabastecer que uno caro vendido pocas veces).
      const topProducts = [...productMap.entries()]
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.quantitySold - a.quantitySold)
        .slice(0, 20);

      const activeCount = inventoryCounts.find((g) => g.isActive)?._count ?? 0;
      const [lowStockCount, outOfStockProducts] = await Promise.all([
        ctx.db.product.count({ where: { businessId, isActive: true, trackStock: true, stock: { gt: 0, lte: 5 } } }),
        ctx.db.product.findMany({
          where: { businessId, isActive: true, trackStock: true, stock: 0 },
          select: { name: true },
          orderBy: { name: "asc" },
        }),
      ]);
      const lowStock = lowStockCount;
      const outOfStock = outOfStockProducts.length;

      let currentCashBalance: number | null = null;
      let cashManualIncome: number | null = null;
      let cashManualExpense: number | null = null;
      if (openRegisters.length > 0) {
        // Ventas en efectivo de cada caja abierta (Sale.cashRegisterId), no de todo el negocio
        // desde la apertura: con varias cajas, cada venta cuenta una sola vez.
        const cashSalesAgg = await ctx.db.sale.aggregate({
          where: {
            businessId,
            cashRegisterId: { in: openRegisters.map((r) => r.id) },
            paymentMethod: "CASH",
            status: "COMPLETED",
          },
          _sum: { total: true },
        });

        const cashSales = cashSalesAgg._sum.total ?? 0;
        const movements = openRegisters.flatMap((r) => r.movements);
        const openingBalance = openRegisters.reduce((sum, r) => sum + r.openingBalance, 0);
        const manualIncome = movements
          .filter((m) => m.type === "INCOME")
          .reduce((sum, m) => sum + m.amount, 0);
        const manualExpense = movements
          .filter((m) => m.type === "EXPENSE")
          .reduce((sum, m) => sum + m.amount, 0);
        currentCashBalance = openingBalance + cashSales + manualIncome - manualExpense;
        cashManualIncome = manualIncome;
        cashManualExpense = manualExpense;
      }

      return {
        period: { from, to },
        sales: {
          count: completedSales.length,
          total: salesTotal,
          voided: voidedCount,
          byMethod,
          byDay: dayRange,
        },
        inventory: { totalActive: activeCount, lowStock, outOfStock, outOfStockNames: outOfStockProducts.map((p) => p.name) },
        cashRegister: {
          isOpen: openRegisters.length > 0,
          currentBalance: currentCashBalance,
          manualIncome: cashManualIncome,
          manualExpense: cashManualExpense,
          lastClosedAt: lastClosed?.closedAt ?? null,
          lastClosingBalance: lastClosed?.closingBalance ?? null,
        },
        topProducts,
        comparison: {
          sales: {
            count: prevSalesAgg._count,
            total: prevSalesAgg._sum.total ?? 0,
          },
        },
      };
    }),
});
