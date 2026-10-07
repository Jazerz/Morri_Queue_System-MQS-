export const statuses = {
  booked: "จองแล้ว",
  dispatched: "ส่งมอบแล้ว",
  returned: "คืนแล้ว",
  cancelled: "ยกเลิก",
} as const;
export type Status = keyof typeof statuses;
export type Model = { id: string; name: string; active: boolean };
export type Unit = {
  id: string;
  model_id: string;
  code: string;
  number: string;
  color: string;
  active: boolean;
};
export type Rate = {
  id: string;
  model_id: string;
  days: number;
  price: number;
};
export type Gadget = { id: string; name: string; active: boolean };
export type Delivery = {
  id: string;
  name: string;
  days_before: number;
  days_after: number;
  requires_address: boolean;
  active: boolean;
};
export type Catalog = {
  models: Model[];
  units: Unit[];
  rates: Rate[];
  gadgets: Gadget[];
  deliveries: Delivery[];
};
export type BookingCamera = {
  id: string;
  booking_id: string;
  unit_id: string;
  model_id: string;
  model_name: string;
  unit_code: string;
  unit_number: string;
  color: string;
  price: number;
  blocked_start: string;
  blocked_end: string;
  cancelled: boolean;
};
export type Booking = {
  id: string;
  reference: number;
  customer_name: string;
  phone: string;
  address: string;
  notes: string;
  start_date: string;
  end_date: string;
  delivery_method_id: string;
  delivery_name: string;
  days_before: number;
  days_after: number;
  requires_address: boolean;
  status: Status;
  version: number;
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string;
  booking_cameras: BookingCamera[];
  booking_gadgets: { gadget_id: string; quantity: number }[];
};
export type BookingInput = {
  id?: string;
  expected_version?: number;
  customer_name: string;
  phone: string;
  address: string;
  notes: string;
  start_date: string;
  end_date: string;
  delivery_method_id: string;
  status: Status;
  cameras: { unit_id: string; price: number }[];
  gadgets: { gadget_id: string; quantity: number }[];
};
export type ActionResult =
  { ok: true; id?: string } | { ok: false; error: string; code?: string };
