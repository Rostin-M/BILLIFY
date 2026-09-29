import { describe, expect, it, vi } from "vitest";

vi.mock("~/trpc/react", () => ({ api: {} }));

import { bannerFor } from "./SubscriptionBanner";

type Status = Parameters<typeof bannerFor>[0];

const base = {
  plan: "BUSINESS",
  billingCycle: "MONTHLY",
  mode: "FULL",
  endsAt: new Date("2026-10-30T15:00:00Z"),
  daysLeft: 20,
  graceDaysLeft: 0,
  isOwner: true,
} as unknown as Status;

const status = (patch: Partial<Status>): Status => ({ ...base, ...patch });

describe("bannerFor", () => {
  it("solo lectura: rojo con CTA para el propietario", () => {
    const b = bannerFor(status({ phase: "READ_ONLY", mode: "READ_ONLY" }));
    expect(b?.tone).toBe("danger");
    expect(b?.text).toContain("solo lectura");
    expect(b?.cta).toBe("Pagar y reactivar");
  });

  it("solo lectura: el cajero no tiene CTA", () => {
    const b = bannerFor(status({ phase: "READ_ONLY", mode: "READ_ONLY", isOwner: false }));
    expect(b?.cta).toBeNull();
    expect(b?.text).toContain("propietario");
  });

  it("gracia: ámbar con los días que quedan", () => {
    const b = bannerFor(status({ phase: "PAST_DUE", graceDaysLeft: 2 }));
    expect(b?.tone).toBe("warning");
    expect(b?.text).toBe("Tu plan venció. Te quedan 2 días de gracia.");
  });

  it("prueba: discreto, y más visible los últimos 2 días", () => {
    expect(bannerFor(status({ phase: "TRIAL", daysLeft: 5 }))?.tone).toBe("quiet");
    expect(bannerFor(status({ phase: "TRIAL", daysLeft: 2 }))?.tone).toBe("notice");
  });

  it("prueba: el cajero solo ve el aviso los últimos días", () => {
    expect(bannerFor(status({ phase: "TRIAL", daysLeft: 5, isOwner: false }))).toBeNull();
    expect(bannerFor(status({ phase: "TRIAL", daysLeft: 1, isOwner: false }))).not.toBeNull();
  });

  it("activo: solo avisa a 7 días o menos", () => {
    expect(bannerFor(status({ phase: "ACTIVE", daysLeft: 8 }))).toBeNull();
    expect(bannerFor(status({ phase: "ACTIVE", daysLeft: 7 }))?.cta).toBe("Renovar");
  });
});
