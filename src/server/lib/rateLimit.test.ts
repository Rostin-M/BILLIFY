import { afterEach, describe, expect, it, vi } from "vitest";

import { db } from "../../../tests/integration/helpers";
import { consumeRateLimit, enforceRateLimits, purgeExpiredRateLimits, resetRateLimit } from "./rateLimit";

const rule = { limit: 2, windowSec: 60 };

describe("rateLimit", () => {
  afterEach(() => vi.restoreAllMocks());

  it("cuenta intentos dentro de la ventana y bloquea al superar el límite", async () => {
    await expect(consumeRateLimit("k", rule)).resolves.toMatchObject({ allowed: true, count: 1 });
    await expect(consumeRateLimit("k", rule)).resolves.toMatchObject({ allowed: true, count: 2 });

    const third = await consumeRateLimit("k", rule);

    expect(third).toMatchObject({ allowed: false, count: 3 });
    expect(third.retryAfterSec).toBeGreaterThan(0);
    expect(third.retryAfterSec).toBeLessThanOrEqual(60);
  });

  it("reinicia el contador cuando la ventana venció", async () => {
    await db.rateLimit.create({
      data: { key: "k", count: 99, windowStart: new Date(Date.now() - 120_000), expiresAt: new Date(Date.now() - 60_000) },
    });

    await expect(consumeRateLimit("k", rule)).resolves.toMatchObject({ allowed: true, count: 1 });
  });

  it("resetRateLimit y purgeExpiredRateLimits borran contadores", async () => {
    await consumeRateLimit("vigente", rule);
    await db.rateLimit.create({
      data: { key: "vencido", count: 1, windowStart: new Date(0), expiresAt: new Date(1000) },
    });

    await purgeExpiredRateLimits();
    await expect(db.rateLimit.findMany({ select: { key: true } })).resolves.toEqual([{ key: "vigente" }]);
    await resetRateLimit("vigente");
    await expect(db.rateLimit.count()).resolves.toBe(0);
  });

  it("enforceRateLimits lanza TOO_MANY_REQUESTS con el mensaje indicado", async () => {
    const checks = [{ key: "a", rule: { limit: 1, windowSec: 60 } }];
    await enforceRateLimits(checks);

    await expect(enforceRateLimits(checks, "Frena")).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
      message: "Frena",
    });
  });
});
