import { afterEach, describe, expect, it, vi } from "vitest";

// En desarrollo el middleware de tiempos agrega un retardo artificial y registra la duración.
vi.mock("~/env", () => ({ env: { NODE_ENV: "development" } }));
vi.mock("~/server/auth", () => ({ auth: vi.fn(async () => null) }));
vi.mock("~/server/db", () => ({ db: {} }));

const { createCallerFactory, createTRPCRouter, publicProcedure } = await import("./api/trpc");

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("timingMiddleware en desarrollo", () => {
  it("agrega un retardo de 100–500 ms y registra cuánto tardó", async () => {
    vi.useFakeTimers();
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const router = createTRPCRouter({ ping: publicProcedure.query(() => "pong") });
    const caller = createCallerFactory(router)({ db: {} as never, session: null, ip: "x", userAgent: null, headers: new Headers() });

    const pending = caller.ping();
    await vi.advanceTimersByTimeAsync(500);

    await expect(pending).resolves.toBe("pong");
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/^\[TRPC\] ping took \d+ms to execute$/));
  });
});
