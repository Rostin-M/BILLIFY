import { describe, expect, it } from "vitest";

import { addDays, computeAccess } from "./access";
import { dueNotice, noticeContent } from "./notices";

const NOW = new Date("2026-10-15T13:00:00Z");
const HOUR = 60 * 60 * 1000;

const paidAccess = (endsAt: Date, now = NOW) =>
  computeAccess({ plan: "BASIC", trialEndsAt: null, currentPeriodEnd: endsAt, canceledAt: null }, now);

describe("dueNotice — avisos 7, 3 y 1 día antes", () => {
  it.each([
    [addDays(NOW, 6.5), "renewal_7d"],
    [addDays(NOW, 2.5), "renewal_3d"],
    [new Date(NOW.getTime() + 20 * HOUR), "renewal_1d"],
  ])("vence en %s → %s", (endsAt, kind) => {
    expect(dueNotice(paidAccess(endsAt), NOW)).toEqual({ kind, dueAt: endsAt });
  });

  it("no avisa si faltan más de 7 días", () => {
    expect(dueNotice(paidAccess(addDays(NOW, 12)), NOW)).toBeNull();
  });

  it("en gracia avisa que venció y en solo lectura avisa el bloqueo", () => {
    expect(dueNotice(paidAccess(addDays(NOW, -1)), NOW)?.kind).toBe("past_due");
    expect(dueNotice(paidAccess(addDays(NOW, -3.5)), NOW)?.kind).toBe("read_only");
  });

  it("no insiste con el aviso de solo lectura días después", () => {
    expect(dueNotice(paidAccess(addDays(NOW, -10)), NOW)).toBeNull();
  });

  it("prueba: avisa en el día 5 y el último día", () => {
    const trial = (endsAt: Date) =>
      computeAccess({ plan: "BUSINESS", trialEndsAt: endsAt, currentPeriodEnd: null, canceledAt: null }, NOW);
    expect(dueNotice(trial(addDays(NOW, 1.5)), NOW)?.kind).toBe("trial_2d");
    expect(dueNotice(trial(new Date(NOW.getTime() + 5 * HOUR)), NOW)?.kind).toBe("trial_0d");
    expect(dueNotice(trial(addDays(NOW, 4)), NOW)).toBeNull();
  });

  it("el texto menciona el negocio y la fecha en hora de Colombia", () => {
    const endsAt = new Date("2026-10-20T03:00:00Z"); // 19 de octubre, 10 p. m. en Bogotá
    const access = paidAccess(endsAt);
    const content = noticeContent(dueNotice(access, NOW)!, access, "Café La 70");
    expect(content.subject).toBe("Tu plan vence en 7 días");
    expect(content.paragraphs.join(" ")).toContain("Café La 70");
    expect(content.paragraphs.join(" ")).toContain("19 de octubre de 2026");
  });
});
