/**
 * Automatic calendar of the public site's festivities. Dates are read in the shop's time
 * zone (Europe/Brussels) and every range includes its first and last day.
 *
 * - halloween: 24 October – 1 November
 * - christmas: 1 – 26 December
 * - new_year: 27 December – 2 January (crosses the year)
 * - epiphany (Befana): 3 – 6 January
 * - valentines: 7 – 14 February
 * - easter: Palm Sunday (Easter − 7 days) – Easter Monday
 *
 * Pure functions only: the server layout calls getActiveFestivity on every request.
 */
export const festivityIds = [
  "halloween",
  "christmas",
  "new_year",
  "epiphany",
  "valentines",
  "easter",
] as const;
export type FestivityId = (typeof festivityIds)[number];

export const festivityTimeZone = "Europe/Brussels";

export type CalendarDay = { year: number; month: number; day: number };

/** Fixed ranges as [month, day] pairs, inclusive. new_year is split at the turn of the year. */
const fixedRanges: { id: FestivityId; from: [number, number]; to: [number, number] }[] = [
  { id: "new_year", from: [1, 1], to: [1, 2] },
  { id: "epiphany", from: [1, 3], to: [1, 6] },
  { id: "valentines", from: [2, 7], to: [2, 14] },
  { id: "halloween", from: [10, 24], to: [11, 1] },
  { id: "christmas", from: [12, 1], to: [12, 26] },
  { id: "new_year", from: [12, 27], to: [12, 31] },
];

const brusselsDateFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: festivityTimeZone,
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

/** Calendar day of an instant as seen in Brussels. */
export function toBrusselsDay(date: Date): CalendarDay {
  const parts = brusselsDateFormat.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((item) => item.type === type)?.value);
  return { year: part("year"), month: part("month"), day: part("day") };
}

/** Easter Sunday of a Gregorian year (anonymous algorithm, Meeus/Jones/Butcher). */
export function easterSunday(year: number): CalendarDay {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { year, month, day };
}

const dayNumber = ({ year, month, day }: CalendarDay) => Date.UTC(year, month - 1, day) / 86_400_000;

/** Festivity of a calendar day (already in Brussels time), or null outside every range. */
export function getFestivityForDay(calendarDay: CalendarDay): FestivityId | null {
  const monthDay = calendarDay.month * 100 + calendarDay.day;
  for (const range of fixedRanges) {
    const from = range.from[0] * 100 + range.from[1];
    const to = range.to[0] * 100 + range.to[1];
    if (monthDay >= from && monthDay <= to) return range.id;
  }
  const easter = dayNumber(easterSunday(calendarDay.year));
  const today = dayNumber(calendarDay);
  if (today >= easter - 7 && today <= easter + 1) return "easter";
  return null;
}

/** Festivity active at an instant, in Brussels time. */
export function getActiveFestivity(date: Date): FestivityId | null {
  return getFestivityForDay(toBrusselsDay(date));
}

export function isFestivityId(value: string | null | undefined): value is FestivityId {
  return festivityIds.some((id) => id === value);
}

/**
 * Preview of the decoration outside production (FestivityProvider ignores it when
 * NODE_ENV is "production"):
 * - `?festivity=halloween` (any id) forces a festivity, `?festivity=none` removes it;
 * - `?festivityDate=2026-12-20` uses that day of the calendar.
 * Returns undefined when there is nothing valid to preview (the real date is used).
 */
export function getFestivityPreview(params: {
  festivity?: string | null;
  festivityDate?: string | null;
}): FestivityId | null | undefined {
  const forced = params.festivity?.trim().toLowerCase();
  if (forced === "none") return null;
  if (isFestivityId(forced)) return forced;
  const match = params.festivityDate?.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return undefined;
  const calendarDay = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  const check = new Date(Date.UTC(calendarDay.year, calendarDay.month - 1, calendarDay.day));
  // Rejects impossible days such as 2026-02-31.
  if (check.getUTCMonth() !== calendarDay.month - 1 || check.getUTCDate() !== calendarDay.day) {
    return undefined;
  }
  return getFestivityForDay(calendarDay);
}
