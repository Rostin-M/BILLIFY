// Genera los íconos de PWA a partir de public/logo.png.
// Ejecutar una sola vez (o cuando cambie el logo): node scripts/generate-pwa-icons.mjs
import sharp from "sharp";
import { mkdirSync } from "fs";

const BRAND_BG = "#020617"; // slate-950, mismo fondo que login/loading
const SRC = "public/logo.png";
const OUT_DIR = "public/icons";

mkdirSync(OUT_DIR, { recursive: true });

async function squareIcon(size, { padPct = 0.14, background = BRAND_BG, outPath }) {
  const inner = Math.round(size * (1 - padPct * 2));
  const logo = await sharp(SRC)
    .resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  await sharp({
    create: { width: size, height: size, channels: 4, background },
  })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toFile(outPath);

  console.log("wrote", outPath);
}

await squareIcon(192, { outPath: `${OUT_DIR}/icon-192.png` });
await squareIcon(512, { outPath: `${OUT_DIR}/icon-512.png` });
// Maskable: el SO recorta a círculo/squircle/etc. — necesita más margen de seguridad.
await squareIcon(512, { padPct: 0.25, outPath: `${OUT_DIR}/icon-maskable-512.png` });
// Apple no soporta transparencia en apple-touch-icon de forma confiable.
await squareIcon(180, { padPct: 0.16, outPath: "public/apple-touch-icon.png" });

console.log("Listo.");
