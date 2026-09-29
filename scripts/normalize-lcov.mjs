// En Windows, Vitest escribe las rutas de coverage/lcov.info con "\". El scanner de
// SonarQube corre en Linux (Docker) y no las reconoce, así que se pasan a "/".
import { readFile, writeFile } from "node:fs/promises";

const LCOV_PATH = "coverage/lcov.info";

const lcov = await readFile(LCOV_PATH, "utf8");
const normalized = lcov.replace(/^SF:(.*)$/gm, (_, file) => `SF:${file.replaceAll("\\", "/")}`);
await writeFile(LCOV_PATH, normalized);
