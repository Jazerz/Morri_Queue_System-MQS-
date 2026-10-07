import type { Booking, Catalog } from "./types";
import { addDays, monthRange, todayBangkok } from "./dates";
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const demoCatalog: Catalog = {
  models: [
    { id: id(1), name: "Canon PowerShot G7 X II", active: true },
    { id: id(2), name: "Fujifilm X100V", active: true },
    { id: id(3), name: "Sony ZV-1", active: true },
  ],
  units: [
    {
      id: id(11),
      model_id: id(1),
      code: "CAN-01",
      number: "01",
      color: "ดำ",
      active: true,
    },
    {
      id: id(12),
      model_id: id(1),
      code: "CAN-02",
      number: "02",
      color: "ดำ",
      active: true,
    },
    {
      id: id(13),
      model_id: id(2),
      code: "FUJI-01",
      number: "01",
      color: "เงิน",
      active: true,
    },
    {
      id: id(14),
      model_id: id(3),
      code: "SONY-01",
      number: "01",
      color: "ขาว",
      active: true,
    },
  ],
  rates: [
    { id: id(21), model_id: id(1), days: 1, price: 450 },
    { id: id(22), model_id: id(1), days: 3, price: 1200 },
    { id: id(23), model_id: id(2), days: 1, price: 650 },
    { id: id(24), model_id: id(3), days: 1, price: 400 },
  ],
  gadgets: [
    { id: id(31), name: "แบตเตอรี่สำรอง", active: true },
    { id: id(32), name: "SD card 64 GB", active: true },
    { id: id(33), name: "ขาตั้งกล้อง", active: true },
  ],
  deliveries: [
    {
      id: id(41),
      name: "นัดรับ",
      days_before: 0,
      days_after: 0,
      requires_address: false,
      active: true,
    },
    {
      id: id(42),
      name: "EMS",
      days_before: 2,
      days_after: 2,
      requires_address: true,
      active: true,
    },
    {
      id: id(43),
      name: "แมสจากคอน",
      days_before: 0,
      days_after: 0,
      requires_address: true,
      active: true,
    },
    {
      id: id(44),
      name: "แมสจากอ้อม",
      days_before: 0,
      days_after: 0,
      requires_address: true,
      active: true,
    },
  ],
};
export function demoBookings(): Booking[] {
  const start = monthRange().start,
    today = todayBangkok();
  const specs = [
    { day: start, len: 2, u: 0, d: 0, s: "returned" },
    { day: addDays(start, 3), len: 1, u: 2, d: 0, s: "returned" },
    { day: today, len: 2, u: 1, d: 1, s: "dispatched" },
    { day: addDays(today, 3), len: 3, u: 0, d: 0, s: "booked" },
    { day: addDays(today, 5), len: 2, u: 2, d: 2, s: "booked" },
    { day: addDays(today, 8), len: 1, u: 3, d: 3, s: "booked" },
  ] as const;
  return specs.map((s, i) => {
    const u = demoCatalog.units[s.u],
      m = demoCatalog.models.find((m) => m.id === u.model_id)!,
      d = demoCatalog.deliveries[s.d],
      bid = id(100 + i),
      end = addDays(s.day, s.len - 1);
    return {
      id: bid,
      reference: 101 + i,
      customer_name: [
        "คุณมินต์ (ตัวอย่าง)",
        "คุณพลอย (ตัวอย่าง)",
        "คุณแพรว (ตัวอย่าง)",
        "คุณน้ำ (ตัวอย่าง)",
        "คุณฟ้า (ตัวอย่าง)",
        "คุณออม (ตัวอย่าง)",
      ][i],
      phone: "0800000000",
      address: "ที่อยู่ตัวอย่าง กรุงเทพฯ",
      notes: "ข้อมูลจำลองสำหรับทดลองหน้าจอ",
      start_date: s.day,
      end_date: end,
      delivery_method_id: d.id,
      delivery_name: d.name,
      days_before: d.days_before,
      days_after: d.days_after,
      requires_address: d.requires_address,
      status: s.s,
      version: 1,
      created_by: id(999),
      updated_by: id(999),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      booking_cameras: [
        {
          id: id(200 + i),
          booking_id: bid,
          unit_id: u.id,
          model_id: m.id,
          model_name: m.name,
          unit_code: u.code,
          unit_number: u.number,
          color: u.color,
          price: 450 * s.len,
          blocked_start: addDays(s.day, -d.days_before),
          blocked_end: addDays(end, d.days_after),
          cancelled: false,
        },
      ],
      booking_gadgets: [{ gadget_id: id(31), quantity: 1 }],
    };
  });
}
