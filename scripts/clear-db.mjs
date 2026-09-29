// Borra todos los datos respetando el orden de FK. Las tablas quedan intactas.
// SOLO para bases locales: se niega a correr si DATABASE_URL no apunta a
// localhost/127.0.0.1 o si no se pasa --yes.
//
// Uso: node scripts/clear-db.mjs --yes
import { PrismaClient } from "@prisma/client";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function assertLocalDatabase() {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    console.error("ERROR: DATABASE_URL no está definida.");
    process.exit(1);
  }
  let host;
  try {
    host = new URL(raw).hostname;
  } catch {
    console.error("ERROR: DATABASE_URL no es una URL válida.");
    process.exit(1);
  }
  if (!LOCAL_HOSTS.has(host)) {
    console.error(
      `ERROR: DATABASE_URL apunta a "${host}". Este script solo borra bases locales (localhost/127.0.0.1).`,
    );
    process.exit(1);
  }
  if (!process.argv.includes("--yes")) {
    console.error("Esto borra TODOS los datos de la base local. Vuelve a ejecutar con --yes para confirmar.");
    process.exit(1);
  }
}

assertLocalDatabase();

const prisma = new PrismaClient();

async function main() {
  console.log("⚠  Borrando todos los datos...\n");

  // Hijos antes que padres. _prisma_migrations no se toca.
  const steps = [
    ["TableOrderItem",      (tx) => tx.tableOrderItem.deleteMany()],
    ["TableOrder",          (tx) => tx.tableOrder.deleteMany()],
    ["SaleItem",            (tx) => tx.saleItem.deleteMany()],
    ["Sale",                (tx) => tx.sale.deleteMany()],
    ["TableGuest",          (tx) => tx.tableGuest.deleteMany()],
    ["TableSession",        (tx) => tx.tableSession.deleteMany()],
    ["CashMovement",        (tx) => tx.cashMovement.deleteMany()],
    ["CashRegister",        (tx) => tx.cashRegister.deleteMany()],
    ["CustomerPayment",     (tx) => tx.customerPayment.deleteMany()],
    ["InventoryMovement",   (tx) => tx.inventoryMovement.deleteMany()],
    ["AuditLog",            (tx) => tx.auditLog.deleteMany()],
    ["AuthEvent",           (tx) => tx.authEvent.deleteMany()],
    ["PasswordResetToken",  (tx) => tx.passwordResetToken.deleteMany()],
    ["PendingRegistration", (tx) => tx.pendingRegistration.deleteMany()],
    ["InvoiceSequence",     (tx) => tx.invoiceSequence.deleteMany()],
    ["RateLimit",           (tx) => tx.rateLimit.deleteMany()],
    ["Customer",            (tx) => tx.customer.deleteMany()],
    ["Product",             (tx) => tx.product.deleteMany()],
    ["User",                (tx) => tx.user.deleteMany()],
    ["Business",            (tx) => tx.business.deleteMany()],
  ];

  // Todo o nada: si un paso falla no queda la base a medio borrar.
  const results = await prisma.$transaction(
    async (tx) => {
      const out = [];
      for (const [name, fn] of steps) {
        const result = await fn(tx);
        out.push([name, result.count]);
      }
      return out;
    },
    { timeout: 60_000 },
  );

  for (const [name, count] of results) {
    console.log(`  ✓ ${name.padEnd(24)} — ${count} filas eliminadas`);
  }

  console.log("\n✅ Base de datos limpia. Tablas y relaciones intactas.");
}

try {
  await main();
} catch (e) {
  console.error("❌ Error:", e);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
