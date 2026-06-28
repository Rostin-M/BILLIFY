import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Borrando datos...");

  // Orden: tablas hijas primero, luego padres
  const counts = await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.inventoryMovement.deleteMany(),
    prisma.saleItem.deleteMany(),
    prisma.sale.deleteMany(),
    prisma.cashMovement.deleteMany(),
    prisma.cashRegister.deleteMany(),
    prisma.customer.deleteMany(),
    prisma.product.deleteMany(),
    prisma.post.deleteMany(),
    prisma.account.deleteMany(),
    prisma.session.deleteMany(),
    prisma.verificationToken.deleteMany(),
    prisma.user.deleteMany(),
    prisma.business.deleteMany(),
  ]);

  const labels = [
    "audit_logs", "inventory_movements", "sale_items", "sales",
    "cash_movements", "cash_registers", "customers", "products",
    "posts", "accounts", "sessions", "verification_tokens",
    "users", "businesses",
  ];

  counts.forEach((r, i) => {
    if (r.count > 0) console.log(`  ✓ ${labels[i]}: ${r.count} eliminados`);
  });

  console.log("\nBase de datos limpia. Listo para empezar desde cero.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
