import { describe, expect, it } from "vitest";
import {
  easterSunday,
  getActiveFestivity,
  getFestivityForDay,
  getFestivityPreview,
  toBrusselsDay,
} from "@/lib/festivities";

/** Noon in Brussels of a calendar day (no time zone edge cases). */
const day = (year: number, month: number, date: number) =>
  new Date(Date.UTC(year, month - 1, date, 11));

describe("fixed festivities", () => {
  const cases: [string, [number, number, number], [number, number, number]][] = [
    ["halloween", [2026, 10, 24], [2026, 11, 1]],
    ["christmas", [2026, 12, 1], [2026, 12, 26]],
    ["epiphany", [2027, 1, 3], [2027, 1, 6]],
    ["valentines", [2027, 2, 7], [2027, 2, 14]],
  ];

  for (const [id, from, to] of cases) {
    it(`${id}: day before, first day, last day and day after`, () => {
      const before = new Date(Date.UTC(from[0], from[1] - 1, from[2] - 1, 11));
      const after = new Date(Date.UTC(to[0], to[1] - 1, to[2] + 1, 11));
      // Neighbouring days may belong to another festivity (26 → 27 December is new_year).
      expect(getActiveFestivity(day(...from))).toBe(id);
      expect(getActiveFestivity(day(...to))).toBe(id);
      expect(getActiveFestivity(before)).not.toBe(id);
      expect(getActiveFestivity(after)).not.toBe(id);
    });
  }

  it("leaves the days around the ranges without decoration", () => {
    expect(getActiveFestivity(day(2026, 10, 23))).toBeNull();
    expect(getActiveFestivity(day(2026, 11, 2))).toBeNull();
    expect(getActiveFestivity(day(2026, 11, 30))).toBeNull();
    expect(getActiveFestivity(day(2027, 1, 7))).toBeNull();
    expect(getActiveFestivity(day(2027, 2, 6))).toBeNull();
    expect(getActiveFestivity(day(2027, 2, 15))).toBeNull();
    expect(getActiveFestivity(day(2026, 7, 15))).toBeNull();
  });

  it("chains christmas, new_year and epiphany without gaps", () => {
    expect(getActiveFestivity(day(2026, 12, 26))).toBe("christmas");
    expect(getActiveFestivity(day(2026, 12, 27))).toBe("new_year");
    expect(getActiveFestivity(day(2027, 1, 2))).toBe("new_year");
    expect(getActiveFestivity(day(2027, 1, 3))).toBe("epiphany");
  });

  it("new_year crosses the turn of the year", () => {
    expect(getActiveFestivity(day(2026, 12, 31))).toBe("new_year");
    expect(getActiveFestivity(day(2027, 1, 1))).toBe("new_year");
    // 23:30 in Brussels on 31 December (22:30 UTC) and 00:30 on 1 January (23:30 UTC).
    expect(getActiveFestivity(new Date(Date.UTC(2026, 11, 31, 22, 30)))).toBe("new_year");
    expect(getActiveFestivity(new Date(Date.UTC(2026, 11, 31, 23, 30)))).toBe("new_year");
    expect(toBrusselsDay(new Date(Date.UTC(2026, 11, 31, 23, 30)))).toEqual({ year: 2027, month: 1, day: 1 });
  });
});

describe("easter", () => {
  it("computes Easter Sunday with the Gregorian algorithm", () => {
    expect(easterSunday(2026)).toEqual({ year: 2026, month: 4, day: 5 });
    expect(easterSunday(2027)).toEqual({ year: 2027, month: 3, day: 28 });
    expect(easterSunday(2028)).toEqual({ year: 2028, month: 4, day: 16 });
    expect(easterSunday(2019)).toEqual({ year: 2019, month: 4, day: 21 });
    expect(easterSunday(2038)).toEqual({ year: 2038, month: 4, day: 25 });
    expect(easterSunday(2285)).toEqual({ year: 2285, month: 3, day: 22 });
  });

  it("2026: from 29 March to Easter Monday 6 April", () => {
    expect(getActiveFestivity(day(2026, 3, 28))).toBeNull();
    expect(getActiveFestivity(day(2026, 3, 29))).toBe("easter");
    expect(getActiveFestivity(day(2026, 4, 5))).toBe("easter");
    expect(getActiveFestivity(day(2026, 4, 6))).toBe("easter");
    expect(getActiveFestivity(day(2026, 4, 7))).toBeNull();
  });

  it("2027: from 21 March to Easter Monday 29 March", () => {
    expect(getActiveFestivity(day(2027, 3, 20))).toBeNull();
    expect(getActiveFestivity(day(2027, 3, 21))).toBe("easter");
    expect(getActiveFestivity(day(2027, 3, 28))).toBe("easter");
    expect(getActiveFestivity(day(2027, 3, 29))).toBe("easter");
    expect(getActiveFestivity(day(2027, 3, 30))).toBeNull();
  });

  it("2028: from 9 April to Easter Monday 17 April", () => {
    expect(getActiveFestivity(day(2028, 4, 8))).toBeNull();
    expect(getActiveFestivity(day(2028, 4, 9))).toBe("easter");
    expect(getActiveFestivity(day(2028, 4, 16))).toBe("easter");
    expect(getActiveFestivity(day(2028, 4, 17))).toBe("easter");
    expect(getActiveFestivity(day(2028, 4, 18))).toBeNull();
  });
});

describe("time zone Europe/Brussels", () => {
  it("23:30 UTC on 23 October is already 24 October in Brussels (summer time)", () => {
    const instant = new Date(Date.UTC(2026, 9, 23, 23, 30));
    expect(toBrusselsDay(instant)).toEqual({ year: 2026, month: 10, day: 24 });
    expect(getActiveFestivity(instant)).toBe("halloween");
    // 21:30 UTC is still 23 October in Brussels.
    expect(getActiveFestivity(new Date(Date.UTC(2026, 9, 23, 21, 30)))).toBeNull();
  });

  it("ends halloween at midnight Brussels time (winter time)", () => {
    // 1 November 23:30 Brussels = 22:30 UTC; 2 November 00:30 Brussels = 23:30 UTC.
    expect(getActiveFestivity(new Date(Date.UTC(2026, 10, 1, 22, 30)))).toBe("halloween");
    expect(getActiveFestivity(new Date(Date.UTC(2026, 10, 1, 23, 30)))).toBeNull();
  });

  it("uses Brussels for easter too", () => {
    // Easter Monday 2026 ends at 22:00 UTC (summer time).
    expect(getActiveFestivity(new Date(Date.UTC(2026, 3, 6, 21, 59)))).toBe("easter");
    expect(getActiveFestivity(new Date(Date.UTC(2026, 3, 6, 22, 0)))).toBeNull();
  });
});

describe("getFestivityForDay", () => {
  it("works on plain calendar days", () => {
    expect(getFestivityForDay({ year: 2026, month: 10, day: 31 })).toBe("halloween");
    expect(getFestivityForDay({ year: 2026, month: 6, day: 1 })).toBeNull();
  });
});

describe("getFestivityPreview (development only)", () => {
  it("forces a festivity or removes it", () => {
    expect(getFestivityPreview({ festivity: "halloween" })).toBe("halloween");
    expect(getFestivityPreview({ festivity: "NEW_YEAR" })).toBe("new_year");
    expect(getFestivityPreview({ festivity: "none" })).toBeNull();
  });

  it("uses the calendar for a simulated date", () => {
    expect(getFestivityPreview({ festivityDate: "2026-12-20" })).toBe("christmas");
    expect(getFestivityPreview({ festivityDate: "2027-01-05" })).toBe("epiphany");
    expect(getFestivityPreview({ festivityDate: "2027-03-28" })).toBe("easter");
    expect(getFestivityPreview({ festivityDate: "2026-07-01" })).toBeNull();
  });

  it("ignores missing or invalid values", () => {
    expect(getFestivityPreview({})).toBeUndefined();
    expect(getFestivityPreview({ festivity: "carnival" })).toBeUndefined();
    expect(getFestivityPreview({ festivityDate: "20-12-2026" })).toBeUndefined();
    expect(getFestivityPreview({ festivityDate: "2026-02-31" })).toBeUndefined();
  });
});
