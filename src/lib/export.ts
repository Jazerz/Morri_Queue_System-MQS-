import ExcelJS from "exceljs";
import type { Booking } from "./types";
import { statuses } from "./types";
const headers = [
  "รหัสคิว",
  "รุ่นกล้อง",
  "รหัสกล้อง",
  "หมายเลขตัว",
  "สี",
  "ชื่อลูกค้า",
  "เบอร์โทร",
  "ที่อยู่",
  "วันเริ่มเช่า",
  "วันสิ้นสุดเช่า",
  "วันเริ่มกันกล้อง",
  "วันสิ้นสุดกันกล้อง",
  "วิธีส่ง",
  "สถานะ",
  "ค่าเช่ากล้อง (บาท)",
];
export function safeCell(value: string) {
  return /^[\s\uFEFF]*[=+\-@\t\r\n]/.test(value) ? "'" + value : value;
}
export function sheetName(name: string, used: Set<string>) {
  const clean =
    name
      .replace(/[\\/*?:\[\]\u0000-\u001f]/g, " ")
      .trim()
      .replace(/^'+|'+$/g, "")
      .trim() || "กล้อง";
  let result = clean.slice(0, 31).replace(/'+$/g, "") || "กล้อง",
    n = 2;
  while (used.has(result.toLowerCase()) || result.toLowerCase() === "history") {
    const suffix = ` (${n++})`;
    result = clean.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(result.toLowerCase());
  return result;
}
export function exportRows(bookings: Booking[], model = "") {
  return bookings.flatMap((b) =>
    b.booking_cameras
      .filter((c) => !model || c.model_id === model)
      .map((c) => ({
        modelId: c.model_id,
        modelName: c.model_name,
        values: [
          `MQS-${String(b.reference).padStart(5, "0")}`,
          c.model_name,
          c.unit_code,
          c.unit_number,
          c.color,
          b.customer_name,
          b.phone,
          b.address,
          b.start_date,
          b.end_date,
          c.blocked_start,
          c.blocked_end,
          b.delivery_name,
          statuses[b.status],
          Number(c.price),
        ] as (string | number)[],
      })),
  );
}
export async function makeExport(
  bookings: Booking[],
  format: "xlsx" | "csv",
  model = "",
) {
  const rows = exportRows(bookings, model);
  if (format === "csv") {
    const quote = (v: string | number) =>
      `"${(typeof v === "string" ? safeCell(v) : String(v)).replaceAll('"', '""')}"`;
    return Buffer.from(
      "\uFEFF" +
        [headers, ...rows.map((r) => r.values)]
          .map((row) => row.map(quote).join(","))
          .join("\r\n"),
      "utf8",
    );
  }
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Morii Queue System";
  const groups = new Map<string, typeof rows>();
  for (const row of rows)
    groups.set(row.modelId, [...(groups.get(row.modelId) ?? []), row]);
  const names = new Set<string>();
  if (!rows.length) groups.set("empty", []);
  for (const group of groups.values()) {
    const sheet = workbook.addWorksheet(
      sheetName(group[0]?.modelName ?? "ไม่มีข้อมูล", names),
    );
    sheet.addRow(headers);
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFD95384" },
    };
    headers.forEach((_, i) => {
      sheet.getColumn(i + 1).width = i === 7 ? 38 : i === 1 ? 25 : 20;
    });
    sheet.getColumn(7).numFmt = "@";
    sheet.getColumn(4).numFmt = "@";
    sheet.getColumn(15).numFmt = "#,##0.00";
    for (const r of group)
      sheet.addRow(
        r.values.map((v) => (typeof v === "string" ? safeCell(v) : v)),
      );
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: Math.max(1, sheet.rowCount), column: headers.length },
    };
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
