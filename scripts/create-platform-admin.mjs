// Crea la cuenta del administrador de la plataforma (rol SUPERADMIN, sin negocio).
// Es la ÚNICA forma de dar de alta un administrador: ni el registro ni ningún
// router pueden asignar ese rol.
//
// Doble llave: el correo debe estar ya en PLATFORM_ADMIN_EMAILS (en .env y en el
// hosting). Si el correo ya existe en la base, el script se niega: nunca
// convierte la cuenta de un cliente en administrador.
//
// Uso (interactivo: pide el correo y la contraseña sin mostrarla):
//   npm run admin:create
//
// Sin terminal interactiva (la contraseña NUNCA va como argumento, para que no
// quede en el historial ni en la lista de procesos):
//   PLATFORM_ADMIN_NEW_EMAIL=...  PLATFORM_ADMIN_NEW_PASSWORD=...  npm run admin:create -- --yes
//   echo "<contraseña>" | npm run admin:create -- --email=admin@tu-dominio.com --yes
//
// Opciones: --email=<correo>  --name="<nombre>"  --yes (no pedir confirmación)
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const BCRYPT_COST = 12;
const MIN_PASSWORD_LENGTH = 14;
// bcrypt ignora lo que pase de 72 bytes; el login acepta máximo 128 caracteres.
const MAX_PASSWORD_BYTES = 72;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

// Variables de .env (DATABASE_URL, PLATFORM_ADMIN_EMAILS). No pisa las que ya
// estén definidas en el entorno.
try {
  process.loadEnvFile();
} catch {
  // Sin archivo .env: se usan solo las variables del entorno.
}

function argValue(name) {
  const prefix = `--${name}=`;
  const arg = process.argv.slice(2).find((a) => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : undefined;
}

/** Mismo criterio que src/server/auth/platformAdminPolicy.ts. */
function allowedEmails() {
  return new Set(
    (process.env.PLATFORM_ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter((email) => email.length > 0),
  );
}

/** Devuelve el motivo por el que la contraseña es débil, o null si sirve. */
function passwordProblem(password, email) {
  if (password.length < MIN_PASSWORD_LENGTH) return `debe tener mínimo ${MIN_PASSWORD_LENGTH} caracteres`;
  if (Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES) return `debe ocupar máximo ${MAX_PASSWORD_BYTES} bytes`;
  if (!/[a-z]/.test(password)) return "debe incluir una letra minúscula";
  if (!/[A-Z]/.test(password)) return "debe incluir una letra mayúscula";
  if (!/\d/.test(password)) return "debe incluir un número";
  if (!/[^A-Za-z0-9]/.test(password)) return "debe incluir un símbolo";
  if (/^\s|\s$/.test(password)) return "no puede empezar ni terminar con espacios";
  const localPart = email.split("@")[0] ?? "";
  if (localPart.length >= 4 && password.toLowerCase().includes(localPart)) return "no puede contener tu correo";
  return null;
}

// ─── Entrada ──────────────────────────────────────────────────────────────────

/** Lee una línea de la terminal; con `hidden` no se muestra lo que se escribe. */
function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const { stdin, stdout } = process;
    stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let value = "";
    const onData = (chunk) => {
      for (const char of chunk) {
        if (char === "\r" || char === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          stdout.write("\n");
          resolve(value);
          return;
        }
        if (char === "\u0003") {
          // Ctrl+C
          stdin.setRawMode(false);
          stdout.write("\n");
          process.exit(130);
        }
        if (char === "\u007f" || char === "\b") {
          if (value.length > 0) {
            value = value.slice(0, -1);
            if (!hidden) stdout.write("\b \b");
          }
          continue;
        }
        value += char;
        if (!hidden) stdout.write(char);
      }
    };
    stdin.on("data", onData);
  });
}

/** Primera línea de la entrada estándar cuando viene por tubería. */
async function readPipedLine() {
  let data = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) data += chunk;
  return data.split(/\r?\n/)[0] ?? "";
}

async function readEmail(interactive) {
  const given = argValue("email") ?? process.env.PLATFORM_ADMIN_NEW_EMAIL;
  if (given) return given;
  if (!interactive) fail("Falta el correo: usa --email=<correo> o PLATFORM_ADMIN_NEW_EMAIL.");
  return ask("Correo del administrador: ");
}

async function readPassword(interactive) {
  const fromEnv = process.env.PLATFORM_ADMIN_NEW_PASSWORD;
  if (fromEnv) return fromEnv;
  if (!interactive) return readPipedLine();
  const password = await ask("Contraseña (no se muestra): ", { hidden: true });
  const confirmation = await ask("Repite la contraseña: ", { hidden: true });
  if (password !== confirmation) fail("Las contraseñas no coinciden.");
  return password;
}

/** Host y base de DATABASE_URL, sin usuario ni contraseña. */
function databaseTarget() {
  const raw = process.env.DATABASE_URL;
  if (!raw) fail("DATABASE_URL no está definida.");
  try {
    const url = new URL(raw);
    return `${url.hostname}${url.port ? `:${url.port}` : ""}${url.pathname}`;
  } catch {
    return fail("DATABASE_URL no es una URL válida.");
  }
}

// ─── Principal ────────────────────────────────────────────────────────────────

async function main() {
  if (process.argv.slice(2).some((a) => a.startsWith("--password"))) {
    fail("La contraseña no se pasa como argumento (queda en el historial). Usa el modo interactivo o PLATFORM_ADMIN_NEW_PASSWORD.");
  }

  const interactive = Boolean(process.stdin.isTTY);
  const allowed = allowedEmails();
  if (allowed.size === 0) {
    fail("PLATFORM_ADMIN_EMAILS está vacía. Agrega primero el correo del administrador a esa variable.");
  }

  const email = (await readEmail(interactive)).trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email) || email.length > 254) fail("Correo electrónico inválido.");
  if (!allowed.has(email)) {
    fail(`${email} no está en PLATFORM_ADMIN_EMAILS. Agrégalo a esa variable antes de crear la cuenta.`);
  }

  const target = databaseTarget();
  const password = await readPassword(interactive);
  const problem = passwordProblem(password, email);
  if (problem) fail(`Contraseña débil: ${problem}.`);

  const name = (argValue("name") ?? "Administrador BILLIFY").trim().slice(0, 80);

  console.log(`\nSe creará el administrador ${email} en la base ${target}`);
  if (!process.argv.includes("--yes")) {
    if (!interactive) fail("Sin terminal interactiva debes confirmar con --yes.");
    const answer = await ask('Escribe "crear" para confirmar: ');
    if (answer.trim().toLowerCase() !== "crear") fail("Cancelado.");
  }

  const prisma = new PrismaClient();
  try {
    // Cualquier cuenta con ese correo (sin importar mayúsculas) bloquea el alta.
    const existing = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { role: true },
    });
    if (existing) {
      fail(
        existing.role === "SUPERADMIN"
          ? "Ya existe un administrador con ese correo."
          : "Ya existe una cuenta de un negocio con ese correo. Este script no convierte cuentas existentes: usa otro correo.",
      );
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

    const admin = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name,
          email,
          passwordHash,
          role: "SUPERADMIN",
          isActive: true,
          businessId: null,
          canManageCash: false,
          emailVerified: new Date(),
        },
        select: { id: true },
      });
      await tx.platformAuditLog.create({
        data: {
          adminId: user.id,
          adminEmail: email,
          adminName: name,
          action: "CREATE_PLATFORM_ADMIN",
          entityType: "User",
          entityId: user.id,
          summary: "Cuenta de administrador creada con scripts/create-platform-admin.mjs",
        },
      });
      return user;
    });

    console.log(`\n✅ Administrador creado (id ${admin.id}).`);
    console.log("   Ingresa por /auth/login con ese correo; el panel está en /admin.");
    console.log("   Recuerda definir PLATFORM_ADMIN_EMAILS también en el hosting (Vercel).");
  } finally {
    await prisma.$disconnect();
  }
}

try {
  await main();
} catch (e) {
  console.error("❌ Error:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
}
