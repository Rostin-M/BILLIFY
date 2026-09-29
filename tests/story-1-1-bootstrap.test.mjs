import { test } from "vitest";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

test("estructura base requerida por la historia existe", async () => {
  const requiredPaths = [
    "package.json",
    ".env.example",
    "prisma/schema.prisma",
    "src/app/(app)/page.tsx",
    "src/server/api/root.ts",
    "src/server/auth/config.ts",
  ];

  for (const relativePath of requiredPaths) {
    await assert.doesNotReject(() => access(path.join(projectRoot, relativePath)));
  }
});

test("package.json contiene scripts minimos para desarrollo", async () => {
  const packageJsonPath = path.join(projectRoot, "package.json");
  const packageJsonRaw = await readFile(packageJsonPath, "utf8");
  const packageJson = JSON.parse(packageJsonRaw);

  assert.equal(typeof packageJson.scripts?.dev, "string");
  assert.equal(typeof packageJson.scripts?.build, "string");
  assert.equal(typeof packageJson.scripts?.check, "string");
});

test("prisma usa provider postgresql", async () => {
  const schemaPath = path.join(projectRoot, "prisma", "schema.prisma");
  const schema = await readFile(schemaPath, "utf8");

  assert.match(schema, /datasource\s+db\s*\{[\s\S]*provider\s*=\s*"postgresql"/);
});
