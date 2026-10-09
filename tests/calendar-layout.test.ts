import { describe, expect, it } from "vitest";
import { cameraWeekRows } from "../src/lib/calendar-layout";

describe("camera calendar lanes", () => {
  it("keeps EMS periods contiguous in the same week, with the rental on its actual dates", () => {
    const rows = cameraWeekRows(
      "2026-10-15",
      "2026-10-17",
      "2026-10-13",
      "2026-10-19",
      "2026-10-01",
      "2026-10-31",
    );
    expect(rows).toEqual([
      {
        start: "2026-10-13",
        end: "2026-10-18",
        periods: [
          { phase: "before", start: "2026-10-13", end: "2026-10-14", days: 2 },
          { phase: "rent", start: "2026-10-15", end: "2026-10-17", days: 3 },
          { phase: "after", start: "2026-10-18", end: "2026-10-18", days: 1 },
        ],
      },
      {
        start: "2026-10-19",
        end: "2026-10-19",
        periods: [
          { phase: "after", start: "2026-10-19", end: "2026-10-19", days: 1 },
        ],
      },
    ]);
  });
  it("handles a one-day rental without buffers, including cancelled bookings", () => {
    expect(
      cameraWeekRows(
        "2026-10-15",
        "2026-10-15",
        "2026-10-15",
        "2026-10-15",
        "2026-10-01",
        "2026-10-31",
      )[0].periods,
    ).toEqual([
      { phase: "rent", start: "2026-10-15", end: "2026-10-15", days: 1 },
    ]);
  });
  it("clips long custom buffers and rentals at week and year boundaries without losing days", () => {
    const rows = cameraWeekRows(
      "2026-12-31",
      "2027-01-05",
      "2026-12-20",
      "2027-01-15",
      "2026-12-28",
      "2027-01-10",
    );
    expect(rows.map((r) => [r.start, r.end])).toEqual([
      ["2026-12-28", "2027-01-03"],
      ["2027-01-04", "2027-01-10"],
    ]);
    expect(rows.map((r) => r.periods.map((p) => [p.phase, p.days]))).toEqual([
      [
        ["before", 3],
        ["rent", 4],
      ],
      [
        ["rent", 2],
        ["after", 5],
      ],
    ]);
  });
  it("counts leap day and excludes bookings outside the visible range", () => {
    expect(
      cameraWeekRows(
        "2028-02-28",
        "2028-03-01",
        "2028-02-28",
        "2028-03-01",
        "2028-02-28",
        "2028-03-05",
      )[0].periods[0].days,
    ).toBe(3);
    expect(
      cameraWeekRows(
        "2026-10-15",
        "2026-10-15",
        "2026-10-13",
        "2026-10-17",
        "2026-11-01",
        "2026-11-30",
      ),
    ).toEqual([]);
  });
});
