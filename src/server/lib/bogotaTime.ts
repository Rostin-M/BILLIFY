// Colombia/Bogotá is always UTC-5 (América/Bogotá, no daylight saving time)
const OFFSET_MS = 5 * 60 * 60 * 1000;

function bogotaComponents(utcDate: Date) {
  const shifted = new Date(utcDate.getTime() - OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
  };
}

/** Returns "YYYY-MM-DD" in Bogotá local time for a UTC Date */
export function toBogotaDateKey(utcDate: Date): string {
  return new Date(utcDate.getTime() - OFFSET_MS).toISOString().slice(0, 10);
}

/** Start of the Bogotá calendar day for a UTC Date (i.e., 00:00 Bogotá = 05:00 UTC) */
export function bogotaStartOfDay(utcDate: Date): Date {
  const { year, month, day } = bogotaComponents(utcDate);
  return new Date(Date.UTC(year, month, day, 5, 0, 0, 0));
}

export type Period = "today" | "week" | "month";

/** Returns { from, to } UTC Date range covering the requested Bogotá period */
export function getPeriodRangeBogota(period: Period): { from: Date; to: Date } {
  const nowUTC = new Date();
  const { year, month, day } = bogotaComponents(nowUTC);
  // Bogotá midnight expressed as UTC (00:00 BOG = 05:00 UTC, same calendar day)
  const todayMidnight = new Date(Date.UTC(year, month, day, 5, 0, 0, 0));

  if (period === "today") {
    return { from: todayMidnight, to: nowUTC };
  }
  if (period === "week") {
    const from = new Date(todayMidnight);
    from.setUTCDate(from.getUTCDate() - 6);
    return { from, to: nowUTC };
  }
  // month: first day of Bogotá month at midnight Bogotá
  return { from: new Date(Date.UTC(year, month, 1, 5, 0, 0, 0)), to: nowUTC };
}

/**
 * Fills "YYYY-MM-DD" Bogotá date keys from `from` to `to` advancing day by day.
 * `from` must be a Bogotá midnight expressed as UTC (output of getPeriodRangeBogota).
 */
export function fillDayRange(from: Date, to: Date): string[] {
  const keys: string[] = [];
  const cursor = new Date(from); // starts at 05:00 UTC = 00:00 Bogotá
  while (cursor <= to) {
    // At 05:00 UTC the UTC date string equals the Bogotá date string
    keys.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return keys;
}
