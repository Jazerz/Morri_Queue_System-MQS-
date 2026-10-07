import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import {
  addDays,
  blockedRange,
  monthChanged,
  monthRange,
  overlaps,
  rentalDays,
  todayBangkok,
  validDate,
} from "@/lib/dates";
import { statistics } from "@/lib/statistics";
import { demoBookings } from "@/lib/demo";
import { exportRows, makeExport, safeCell, sheetName } from "@/lib/export";
import { bookingSchema } from "@/lib/validation";

describe("rental date rules", () => {
  it("counts inclusive days, leap days and year boundaries", () => {
    expect(rentalDays("2026-10-10", "2026-10-10")).toBe(1);
    expect(rentalDays("2026-10-10", "2026-10-12")).toBe(3);
    expect(rentalDays("2028-02-28", "2028-03-01")).toBe(3);
    expect(rentalDays("2026-12-31", "2027-01-02")).toBe(3);
    expect(validDate("2026-02-30")).toBe(false);
  });
  it("blocks EMS shipping on both sides and allows the next day", () => {
    const range = blockedRange("2026-10-10", "2026-10-12", 2, 2);
    expect(range).toEqual({ start: "2026-10-08", end: "2026-10-14" });
    expect(overlaps(range.start, range.end, "2026-10-14", "2026-10-15")).toBe(
      true,
    );
    expect(overlaps(range.start, range.end, "2026-10-15", "2026-10-15")).toBe(
      false,
    );
  });
  it("handles custom buffers across a year", () => {
    expect(blockedRange("2027-01-01", "2027-01-01", 3, 1)).toEqual({
      start: "2026-12-29",
      end: "2027-01-02",
    });
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("uses Bangkok midnight and detects month/year changes", () => {
    expect(todayBangkok(new Date("2026-12-31T17:00:00Z"))).toBe("2027-01-01");
    expect(monthChanged("2026-12-31", "2027-01-01")).toBe(true);
    expect(monthChanged("2026-10-07", "2026-10-08")).toBe(false);
    expect(monthRange("2028-02-10")).toEqual({
      start: "2028-02-01",
      end: "2028-02-29",
    });
  });
});
describe("statistics", () => {
  it("counts unique model bookings separately from rented units, excludes cancellation and separates booked", () => {
    const fixture = demoBookings()[0];
    const booking = {
      ...fixture,
      status: "returned" as const,
      booking_cameras: [
        fixture.booking_cameras[0],
        { ...fixture.booking_cameras[0], unit_id: "different-unit" },
      ],
    };
    const stats = statistics([
      booking,
      { ...booking, id: "cancelled", status: "cancelled" },
      { ...booking, id: "future", status: "booked" },
    ]);
    expect(stats.actualCount).toBe(1);
    expect(stats.unitCount).toBe(2);
    expect(stats.bookedCount).toBe(1);
    expect(stats.models[0]).toMatchObject({ bookings: 1, units: 2 });
    expect(stats.units.map((u) => u.count)).toEqual([1, 1]);
  });
});
describe("export", () => {
  it("handles invalid, long, duplicate and reserved sheet names", () => {
    const used = new Set<string>();
    const a = sheetName("A/very:long[name]".repeat(4), used),
      b = sheetName("A/very:long[name]".repeat(4), used);
    expect(a.length).toBeLessThanOrEqual(31);
    expect(b.length).toBeLessThanOrEqual(31);
    expect(a).not.toBe(b);
    expect(a).not.toMatch(/[\\/*?:\[\]]/);
    expect(sheetName("History", used)).not.toBe("History");
    expect(sheetName(" 'Camera' ", used)).toBe("Camera");
    expect(sheetName("a".repeat(30) + "'rest", used)).toBe("a".repeat(30));
  });
  it("prevents spreadsheet formulas, preserves Thai and writes a UTF-8 BOM", async () => {
    const b = {
      ...demoBookings()[0],
      customer_name: ' =HYPERLINK("bad")',
      phone: "0812345678",
    };
    const buffer = await makeExport([b], "csv");
    expect([...buffer.subarray(0, 3)]).toEqual([239, 187, 191]);
    expect(buffer.toString()).toContain("0812345678");
    expect(buffer.toString()).toContain("ชื่อลูกค้า");
    expect(buffer.toString()).toContain("' =HYPERLINK");
    expect(safeCell("+123")).toBe("'+123");
  });
  it("creates readable workbooks with one sheet per model and typed phone text", async () => {
    const bookings = demoBookings();
    const bytes = await makeExport(bookings, "xlsx");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes as unknown as ExcelJS.Buffer);
    expect(wb.worksheets.length).toBe(3);
    expect(wb.worksheets[0].getCell("G2").value).toBe("0800000000");
    expect(wb.worksheets[0].getCell("O2").type).toBe(ExcelJS.ValueType.Number);
    expect(exportRows(bookings).length).toBe(bookings.length);
  });
  it("creates an empty export with headers", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(
      (await makeExport([], "xlsx")) as unknown as ExcelJS.Buffer,
    );
    expect(wb.worksheets[0].name).toBe("ไม่มีข้อมูล");
    expect(wb.worksheets[0].rowCount).toBe(1);
  });
});
it("validates missing prices, duplicates and invalid date ranges", () => {
  const b = demoBookings()[0];
  const input = {
    ...b,
    cameras: b.booking_cameras.map((c) => ({
      unit_id: c.unit_id,
      price: c.price,
    })),
    gadgets: [],
    expected_version: 1,
  };
  expect(bookingSchema.safeParse(input).success).toBe(true);
  expect(
    bookingSchema.safeParse({
      ...input,
      cameras: [...input.cameras, ...input.cameras],
    }).success,
  ).toBe(false);
  expect(
    bookingSchema.safeParse({ ...input, end_date: "2020-01-01" }).success,
  ).toBe(false);
  expect(
    bookingSchema.safeParse({
      ...input,
      cameras: [{ unit_id: input.cameras[0].unit_id, price: 1.001 }],
    }).success,
  ).toBe(false);
});
