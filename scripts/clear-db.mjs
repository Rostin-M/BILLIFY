// Borra todos los datos respetando el orden de FK. Las tablas quedan intactas.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("⚠  Borrando todos los datos...\n");

  const steps = [
    ["TableOrderItem",        () => prisma.tableOrderItem.deleteMany()],
    ["TableOrder",            () => prisma.tableOrder.deleteMany()],
    ["TableGuest",            () => prisma.tableGuest.deleteMany()],
    ["TableSession",          () => prisma.tableSession.deleteMany()],
    ["SaleItem",              () => prisma.saleItem.deleteMany()],
    ["Sale",                  () => prisma.sale.deleteMany()],
    ["CashMovement",          () => prisma.cashMovement.deleteMany()],
    ["CashRegister",          () => prisma.cashRegister.deleteMany()],
    ["InventoryMovement",     () => prisma.inventoryMovement.deleteMany()],
    ["AuditLog",              () => prisma.auditLog.deleteMany()],
    ["PasswordResetToken",    () => prisma.passwordResetToken.deleteMany()],
    ["EmailVerificationCode", () => prisma.emailVerificationCode.deleteMany()],
    ["PendingRegistration",   () => prisma.pendingRegistration.deleteMany()],
    ["Customer",              () => prisma.customer.deleteMany()],
    ["Product",               () => prisma.product.deleteMany()],
    ["Post",                  () => prisma.post.deleteMany()],
    ["Account",               () => prisma.account.deleteMany()],
    ["Session",               () => prisma.session.deleteMany()],
    ["VerificationToken",     () => prisma.verificationToken.deleteMany()],
    ["User",                  () => prisma.user.deleteMany()],
    ["Business",              () => prisma.business.deleteMany()],
  ];

  for (const [name, fn] of steps) {
    const result = await fn();
    console.log(`  ✓ ${name.padEnd(24)} — ${result.count} filas eliminadas`);
  }

  console.log("\n✅ Base de datos limpia. Tablas y relaciones intactas.");
}

main()
  .catch((e) => { console.error("❌ Error:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
