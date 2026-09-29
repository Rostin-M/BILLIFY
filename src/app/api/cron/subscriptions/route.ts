import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { env } from "~/env";
import { db } from "~/server/db";
import { runSubscriptionJob } from "~/server/subscription/jobs";

// Recorre todas las suscripciones: puede tardar más que el límite por defecto.
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const secret = env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`, "utf8");
  const received = Buffer.from(header, "utf8");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

/**
 * Tarea diaria de suscripciones (vercel.json → crons). Vercel envía
 * "Authorization: Bearer <CRON_SECRET>". Sin CRON_SECRET configurado, no corre.
 */
export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  const report = await runSubscriptionJob(db);
  console.info("[cron:subscriptions]", JSON.stringify(report));
  return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
}
