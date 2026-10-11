import { z } from "zod";
import { rentalDays, validDate } from "./dates";
const date = z.string().refine(validDate, "วันที่ไม่ถูกต้อง");
export const priceSchema = z
  .number()
  .finite()
  .min(0)
  .max(9999999999.99)
  .refine(
    (n) => Math.abs(n * 100 - Math.round(n * 100)) < 0.0001,
    "ราคาใช้ทศนิยมได้ไม่เกิน 2 ตำแหน่ง",
  );
export const bookingSchema = z
  .object({
    id: z.uuid().optional(),
    expected_version: z.number().int().positive().optional(),
    customer_name: z.string().trim().min(1, "กรุณากรอกชื่อลูกค้า").max(200),
    phone: z.string().trim().min(3, "กรุณากรอกเบอร์โทร").max(40),
    address: z.string().max(2000),
    notes: z.string().max(4000),
    start_date: date,
    end_date: date,
    delivery_method_id: z.uuid(),
    return_appointment_time: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "เวลาคืนต้องเป็น HH:mm")
      .nullable()
      .optional(),
    appointment_time: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "เวลานัดต้องเป็น HH:mm")
      .nullable()
      .optional(),
    status: z.enum(["booked", "dispatched", "returned", "cancelled"]),
    cameras: z
      .array(z.object({ unit_id: z.uuid(), price: priceSchema }))
      .min(1, "กรุณาเลือกกล้องอย่างน้อยหนึ่งตัว"),
    gadgets: z.array(
      z.object({
        gadget_id: z.uuid(),
        quantity: z.number().int().min(1).max(9999),
      }),
    ),
  })
  .refine(
    (v) =>
      rentalDays(v.start_date, v.end_date) > 0 &&
      rentalDays(v.start_date, v.end_date) <= 3660,
    "ช่วงวันเช่าไม่ถูกต้อง",
  )
  .refine((v) => !v.id || !!v.expected_version, "ไม่พบเวอร์ชันคิว")
  .refine(
    (v) => new Set(v.cameras.map((c) => c.unit_id)).size === v.cameras.length,
    "เลือกกล้องซ้ำ",
  )
  .refine(
    (v) => new Set(v.gadgets.map((g) => g.gadget_id)).size === v.gadgets.length,
    "เลือกอุปกรณ์ซ้ำ",
  );
export const exportSchema = z
  .object({
    format: z.enum(["xlsx", "csv"]),
    start: date,
    end: date,
    model: z.union([z.uuid(), z.literal("")]).default(""),
    status: z
      .enum(["", "booked", "dispatched", "returned", "cancelled"])
      .default(""),
  })
  .refine((v) => v.end >= v.start, "ช่วงวันไม่ถูกต้อง");
