import { addDays, rentalDays } from "./dates";

export type CameraPeriod = {
  phase: "before" | "rent" | "after";
  start: string;
  end: string;
  days: number;
};

/** Split only at week boundaries so each camera's three periods share one lane.
 * All inputs and returned dates are inclusive date-only values, independent of
 * the browser's timezone. FullCalendar receives an exclusive end separately.
 */
export function cameraWeekRows(
  rentalStart: string,
  rentalEnd: string,
  blockedStart: string,
  blockedEnd: string,
  visibleStart: string,
  visibleEnd: string,
) {
  const start = blockedStart > visibleStart ? blockedStart : visibleStart;
  const end = blockedEnd < visibleEnd ? blockedEnd : visibleEnd;
  const rows: { start: string; end: string; periods: CameraPeriod[] }[] = [];
  const periods = [
    {
      phase: "before" as const,
      start: blockedStart,
      end: addDays(rentalStart, -1),
    },
    { phase: "rent" as const, start: rentalStart, end: rentalEnd },
    { phase: "after" as const, start: addDays(rentalEnd, 1), end: blockedEnd },
  ];
  for (let day = start; day <= end;) {
    const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
    const sunday = addDays(day, (7 - weekday) % 7);
    const rowEnd = sunday < end ? sunday : end;
    rows.push({
      start: day,
      end: rowEnd,
      periods: periods.flatMap((period) => {
        const from = period.start > day ? period.start : day;
        const to = period.end < rowEnd ? period.end : rowEnd;
        return from <= to
          ? [
              {
                phase: period.phase,
                start: from,
                end: to,
                days: rentalDays(from, to),
              },
            ]
          : [];
      }),
    });
    day = addDays(rowEnd, 1);
  }
  return rows;
}
