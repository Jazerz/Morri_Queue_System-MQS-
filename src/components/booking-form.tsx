"use client";
import { useEffect, useMemo, useState } from "react";
import { Camera, Check, Package, Truck, UserRound } from "lucide-react";
import type { Booking, BookingInput, Catalog, Status } from "@/lib/types";
import { statuses } from "@/lib/types";
import {
  blockedRange,
  money,
  addDays,
  rentalDays,
  thaiDate,
  todayBangkok,
} from "@/lib/dates";
import { saveBooking } from "@/app/actions";
import { supportsAppointment } from "@/lib/preparation";
import {
  schedulesOverlap,
  supportsNextDayReturn,
} from "@/lib/booking-availability";
import { Modal, Notice } from "./ui";
export function BookingForm({
  catalog,
  booking,
  initialDate,
  onClose,
  onSaved,
  onReload,
  demoBookings,
}: {
  catalog: Catalog;
  booking?: Booking;
  initialDate?: string;
  onClose: () => void;
  onSaved: () => void;
  onReload?: () => void;
  demoBookings?: Booking[];
}) {
  const [customer, setCustomer] = useState(booking?.customer_name ?? ""),
    [phone, setPhone] = useState(booking?.phone ?? ""),
    [address, setAddress] = useState(booking?.address ?? ""),
    [notes, setNotes] = useState(booking?.notes ?? "");
  const [start, setStart] = useState(
      booking?.start_date ?? initialDate ?? todayBangkok(),
    ),
    [end, setEnd] = useState(
      booking?.end_date ?? initialDate ?? todayBangkok(),
    );
  const [deliveryId, setDeliveryId] = useState(
    booking?.delivery_method_id ??
      catalog.deliveries.find((d) => d.active && !d.requires_address)?.id ??
      catalog.deliveries.find((d) => d.active)?.id ??
      "",
  );
  const [status, setStatus] = useState<Status>(booking?.status ?? "booked");
  const [appointmentTime, setAppointmentTime] = useState(
    booking?.appointment_time?.slice(0, 5) ?? "",
  );
  const [returnTime, setReturnTime] = useState(
    booking?.return_appointment_time?.slice(0, 5) ?? "",
  );
  const [selected, setSelected] = useState<string[]>(
    booking?.booking_cameras.map((c) => c.unit_id) ?? [],
  );
  const [prices, setPrices] = useState<Record<string, string>>(
    Object.fromEntries(
      booking?.booking_cameras.map((c) => [c.unit_id, String(c.price)]) ?? [],
    ),
  );
  const [quantities, setQuantities] = useState<Record<string, string>>(
    Object.fromEntries(
      booking?.booking_gadgets.map((g) => [g.gadget_id, String(g.quantity)]) ??
        [],
    ),
  );
  const [conflictBookings, setConflicts] = useState<Booking[]>([]),
    [checking, setChecking] = useState(true),
    [availabilityError, setAvailabilityError] = useState("");
  const [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const [stale, setStale] = useState(false),
    [availabilityVersion, setAvailabilityVersion] = useState(0);
  const method = catalog.deliveries.find((d) => d.id === deliveryId);
  const showAppointment = supportsAppointment(
    booking?.delivery_method_id === deliveryId
      ? booking.delivery_name
      : (method?.name ?? ""),
  );
  const delivery = useMemo(
    () =>
      booking && booking.delivery_method_id === deliveryId
        ? {
            days_before: booking.days_before,
            days_after: booking.days_after,
            requires_address: booking.requires_address,
          }
        : method,
    [booking, deliveryId, method],
  );
  const days = rentalDays(start, end);
  const deliveryName =
    booking?.delivery_method_id === deliveryId
      ? booking.delivery_name
      : (method?.name ?? "");
  const showReturn =
    !!delivery &&
    supportsNextDayReturn({
      delivery_name: deliveryName,
      ...delivery,
    });
  const range =
    days && delivery
      ? blockedRange(start, end, delivery.days_before, delivery.days_after)
      : null;
  // Include rentals ending yesterday and the next-day return of this booking.
  const from = range ? addDays(range.start, -1) : "",
    to = range ? addDays(range.end, showReturn ? 1 : 0) : "";
  useEffect(() => {
    if (!from || !to) return;
    const controller = new AbortController();
    async function load() {
      setChecking(true);
      setAvailabilityError("");
      try {
        if (demoBookings) {
          setConflicts(demoBookings);
          return;
        }
        const response = await fetch(`/api/bookings?start=${from}&end=${to}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setConflicts(data);
      } catch (e) {
        if (!controller.signal.aborted)
          setAvailabilityError(
            e instanceof Error ? e.message : "ตรวจวันว่างไม่สำเร็จ",
          );
      } finally {
        if (!controller.signal.aborted) setChecking(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [from, to, demoBookings, availabilityVersion]);
  const conflicts = useMemo(() => {
    const map = new Map<string, Booking>();
    if (!range || !delivery) return map;
    const schedule = {
      start_date: start,
      end_date: end,
      ...delivery,
      delivery_name: deliveryName,
      appointment_time: appointmentTime || null,
      return_appointment_time: returnTime || null,
    };
    for (const b of conflictBookings)
      if (b.id !== booking?.id && b.status !== "cancelled")
        for (const c of b.booking_cameras)
          if (!c.cancelled && schedulesOverlap(schedule, b))
            map.set(c.unit_id, b);
    return map;
  }, [
    conflictBookings,
    range,
    booking?.id,
    delivery,
    start,
    end,
    deliveryName,
    appointmentTime,
    returnTime,
  ]);
  const availableUnits = catalog.units.filter(
    (u) =>
      (u.active &&
        catalog.models.some((m) => m.id === u.model_id && m.active)) ||
      booking?.booking_cameras.some((c) => c.unit_id === u.id),
  );
  function priceFor(unitId: string) {
    if (prices[unitId] !== undefined) return prices[unitId];
    const unit = catalog.units.find((u) => u.id === unitId);
    const rate = catalog.rates.find(
      (r) => r.model_id === unit?.model_id && r.days === days,
    );
    return rate ? String(rate.price) : "";
  }
  function toggle(id: string) {
    setSelected((old) =>
      old.includes(id) ? old.filter((v) => v !== id) : [...old, id],
    );
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (demoBookings) {
      setError(
        "โหมดตัวอย่างไม่บันทึกข้อมูล กรุณาเชื่อม Supabase เพื่อใช้งานจริง",
      );
      return;
    }
    if (!days || !delivery || !range || !selected.length) {
      setError("กรุณาเลือกช่วงวัน วิธีส่ง และกล้องอย่างน้อยหนึ่งตัว");
      return;
    }
    if (
      status !== "cancelled" &&
      (checking ||
        availabilityError ||
        selected.some((id) => conflicts.has(id)))
    ) {
      setError("ยังบันทึกไม่ได้ กรุณาตรวจวันว่างและแก้ไขกล้องที่คิวชน");
      return;
    }
    if (selected.some((id) => priceFor(id) === "")) {
      setError("กรุณากรอกราคากล้องทุกตัว");
      return;
    }
    const input: BookingInput = {
      id: booking?.id,
      expected_version: booking?.version,
      customer_name: customer,
      phone,
      address,
      notes,
      start_date: start,
      end_date: end,
      delivery_method_id: deliveryId,
      appointment_time:
        showAppointment && appointmentTime ? appointmentTime : null,
      return_appointment_time: showReturn && returnTime ? returnTime : null,
      status,
      cameras: selected.map((id) => ({
        unit_id: id,
        price: Number(priceFor(id)),
      })),
      gadgets: Object.entries(quantities)
        .filter(([, v]) => Number(v) > 0)
        .map(([gadget_id, v]) => ({ gadget_id, quantity: Number(v) })),
    };
    setPending(true);
    try {
      const result = await saveBooking(input);
      if (!result.ok) {
        setError(result.error);
        if (result.code === "stale") setStale(true);
        if (result.code === "conflict") setAvailabilityVersion((v) => v + 1);
        return;
      }
      onSaved();
    } catch {
      setError("ไม่สามารถเชื่อมต่อได้ กรุณาลองอีกครั้ง");
    } finally {
      setPending(false);
    }
  }
  return (
    <Modal
      title={
        booking
          ? `แก้ไขคิว MQS-${String(booking.reference).padStart(5, "0")}`
          : "เพิ่มคิวเช่ากล้อง"
      }
      onClose={() => {
        if (!pending) onClose();
      }}
      wide
    >
      <form onSubmit={submit} className="booking-form">
        <div className="form-body">
          <div className="section-label">
            <UserRound size={18} />
            ข้อมูลลูกค้า
          </div>
          <div className="form-grid">
            <label>
              ชื่อลูกค้า *
              <input
                value={customer}
                onChange={(e) => setCustomer(e.target.value)}
                required
                maxLength={200}
                placeholder="ชื่อ–นามสกุล หรือชื่อผู้ติดต่อ"
              />
            </label>
            <label>
              เบอร์โทร *
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                minLength={3}
                maxLength={40}
                placeholder="08x xxx xxxx"
              />
            </label>
          </div>
          <div className="section-label">
            <Truck size={18} />
            วันเช่าและการจัดส่ง
          </div>
          <div className="form-grid three">
            <label>
              วันเริ่มเช่า *
              <input
                type="date"
                value={start}
                onChange={(e) => {
                  setStart(e.target.value);
                  if (end < e.target.value) setEnd(e.target.value);
                }}
                required
              />
            </label>
            <label>
              วันสิ้นสุดเช่า *
              <input
                type="date"
                value={end}
                min={start}
                onChange={(e) => setEnd(e.target.value)}
                required
              />
            </label>
            <label>
              วิธีส่ง *
              <select
                value={deliveryId}
                onChange={(e) => setDeliveryId(e.target.value)}
                required
              >
                <option value="" disabled>
                  เลือกวิธีส่ง
                </option>
                {catalog.deliveries
                  .filter(
                    (d) => d.active || d.id === booking?.delivery_method_id,
                  )
                  .map((d) => (
                    <option value={d.id} key={d.id}>
                      {d.name}
                      {!d.active ? " (ปิดใช้งาน)" : ""}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          {showAppointment && (
            <label className="appointment-field">
              เวลานัดรับ / เวลาส่งแมส
              <input
                type="time"
                step={60}
                value={appointmentTime}
                onChange={(e) => setAppointmentTime(e.target.value)}
              />
              <span className="help">
                เวลาไทย · เว้นว่างได้หากยังไม่ได้นัดเวลา
              </span>
            </label>
          )}
          {showReturn && (
            <label className="appointment-field">
              เวลานัดส่งคืน
              <input
                type="time"
                step={60}
                value={returnTime}
                onChange={(e) => setReturnTime(e.target.value)}
              />
              <span className="help">
                {days ? `วันนัดคืน ${thaiDate(addDays(end, 1), true)} · ` : ""}
                เวลาไทย · ไม่คิดค่าเช่าเพิ่ม
              </span>
              <span className="help">
                หากรับคิวต่อในวันคืน ต้องระบุเวลาคืนและเวลานัดรับของคิวถัดไป
              </span>
            </label>
          )}
          {range && (
            <div className="range-note">
              <span>
                เช่า <b>{days} วัน</b>
              </span>
              <span>
                กันกล้อง {thaiDate(range.start)} – {thaiDate(range.end)}
                {delivery &&
                  (delivery.days_before > 0 || delivery.days_after > 0) &&
                  ` · เผื่อก่อน ${delivery.days_before} / หลัง ${delivery.days_after} วัน`}
              </span>
            </div>
          )}
          <label>
            ที่อยู่
            {delivery?.requires_address ? " *" : " (ไม่บังคับสำหรับนัดรับ)"}
            <textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              rows={2}
              required={delivery?.requires_address}
              maxLength={2000}
              placeholder="ที่อยู่สำหรับจัดส่ง / จุดนัดรับ"
            />
          </label>
          <div className="section-label">
            <Camera size={18} />
            เลือกกล้อง <span className="subtle">{selected.length} ตัว</span>
          </div>
          {availabilityError && (
            <Notice kind="error">{availabilityError}</Notice>
          )}
          {!availableUnits.length && (
            <Notice>
              ยังไม่มีกล้องที่เปิดใช้งาน กรุณาเพิ่มรุ่นและกล้องก่อน
            </Notice>
          )}
          <div className="camera-picker">
            {availableUnits.map((u) => {
              const model = catalog.models.find((m) => m.id === u.model_id),
                conflict = conflicts.get(u.id),
                chosen = selected.includes(u.id);
              return (
                <div
                  key={u.id}
                  className={`camera-choice ${chosen ? "selected" : ""} ${conflict ? "conflict" : ""}`}
                >
                  <label className="camera-choice-label">
                    <input
                      type="checkbox"
                      checked={chosen}
                      onChange={() => toggle(u.id)}
                      disabled={!chosen && !!conflict && status !== "cancelled"}
                    />
                    <span>
                      <strong>{model?.name}</strong>
                      <small>
                        {u.code} · ตัวที่ {u.number} · สี{u.color}
                      </small>
                    </span>
                    {chosen && <Check size={17} />}
                  </label>
                  <small
                    className={conflict ? "conflict-text" : "available-text"}
                  >
                    {checking
                      ? "กำลังตรวจวันว่าง…"
                      : conflict
                        ? `ชนคิว MQS-${conflict.reference} · ${thaiDate(conflict.start_date)}–${thaiDate(conflict.end_date)}${supportsNextDayReturn(conflict) ? ` · คืน ${thaiDate(addDays(conflict.end_date, 1))} ${conflict.return_appointment_time?.slice(0, 5) || "ยังไม่ระบุเวลา"}` : ""}`
                        : "ว่างในช่วงวันที่เลือก"}
                  </small>
                  {chosen && (
                    <label className="price-input">
                      ค่าเช่ารวม (บาท) *
                      <input
                        type="number"
                        min="0"
                        max="9999999999.99"
                        step="0.01"
                        value={priceFor(u.id)}
                        onChange={(e) =>
                          setPrices({ ...prices, [u.id]: e.target.value })
                        }
                        required
                        placeholder="ไม่มี rate ตรงจำนวนวัน กรุณากรอก"
                      />
                    </label>
                  )}
                </div>
              );
            })}
          </div>
          <p className="help left">
            ราคาแนะนำตามจำนวนวันเช่าเท่านั้น แก้ไขได้ และไม่รวมวันเผื่อขนส่ง
          </p>
          <div className="section-label">
            <Package size={18} />
            อุปกรณ์ที่แนบ <span className="subtle">ไม่กันสต็อก</span>
          </div>
          <div className="gadget-picker">
            {catalog.gadgets
              .filter(
                (g) =>
                  g.active ||
                  booking?.booking_gadgets.some((bg) => bg.gadget_id === g.id),
              )
              .map((g) => (
                <label key={g.id}>
                  {g.name}
                  <input
                    aria-label={`จำนวน ${g.name}`}
                    type="number"
                    min="0"
                    max="9999"
                    step="1"
                    value={quantities[g.id] ?? ""}
                    placeholder="0"
                    onChange={(e) =>
                      setQuantities({ ...quantities, [g.id]: e.target.value })
                    }
                  />
                </label>
              ))}
          </div>
          <div className="form-grid">
            <label>
              สถานะ
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as Status)}
              >
                {Object.entries(statuses).map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              หมายเหตุ
              <textarea
                rows={2}
                value={notes}
                maxLength={4000}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="รายละเอียดเพิ่มเติม"
              />
            </label>
          </div>
          {error && (
            <Notice kind="error">
              {error}
              {stale && onReload && (
                <button
                  type="button"
                  className="text-button"
                  onClick={onReload}
                >
                  โหลดคิวล่าสุด (แทนที่ข้อมูลในฟอร์ม)
                </button>
              )}
            </Notice>
          )}
          {demoBookings && (
            <Notice>
              ข้อมูลตัวอย่าง — กรอกและทดลองเลือกกล้องได้ แต่จะไม่บันทึก
            </Notice>
          )}
        </div>
        <div className="form-footer">
          <div>
            <small>ค่าเช่ากล้องรวม</small>
            <strong>
              {money(
                selected.reduce(
                  (sum, id) => sum + (Number(priceFor(id)) || 0),
                  0,
                ),
              )}
            </strong>
          </div>
          <div className="button-row">
            <button
              type="button"
              className="button secondary"
              onClick={onClose}
              disabled={pending}
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              className="button primary"
              disabled={
                pending ||
                (!demoBookings &&
                  status !== "cancelled" &&
                  (checking || !!availabilityError))
              }
            >
              {pending ? "กำลังบันทึก…" : "บันทึกคิว"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
