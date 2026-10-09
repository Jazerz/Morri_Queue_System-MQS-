"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import thLocale from "@fullcalendar/core/locales/th";
import type { DatesSetArg, EventInput } from "@fullcalendar/core";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Camera,
  PackageCheck,
  RefreshCw,
  ArrowUpRight,
} from "lucide-react";
import type { Booking, Catalog } from "@/lib/types";
import { statuses } from "@/lib/types";
import {
  addDays,
  monthChanged,
  monthRange,
  overlaps,
  thaiDate,
  todayBangkok,
} from "@/lib/dates";
import { AddButton, Notice, PageHeading, StatusBadge } from "./ui";
import { BookingForm } from "./booking-form";
import { cameraColors } from "@/lib/calendar-colors";
export function CalendarView({
  catalog,
  demoBookings,
}: {
  catalog: Catalog;
  demoBookings?: Booking[];
}) {
  const calendar = useRef<FullCalendar>(null),
    clock = useRef(todayBangkok());
  const [range, setRange] = useState(() => monthRange()),
    [bookings, setBookings] = useState<Booking[]>(demoBookings ?? []),
    [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(!demoBookings),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const [model, setModel] = useState(""),
    [unit, setUnit] = useState(""),
    [method, setMethod] = useState(""),
    [status, setStatus] = useState("");
  const [view, setView] = useState("dayGridMonth"),
    [title, setTitle] = useState("");
  const [editor, setEditor] = useState<{
    booking?: Booking;
    date?: string;
  } | null>(null);
  const [opening, setOpening] = useState(false);
  useEffect(() => {
    const check = () => {
      const today = todayBangkok();
      if (monthChanged(clock.current, today))
        calendar.current?.getApi().gotoDate(today);
      clock.current = today;
      if (document.visibilityState === "visible") setReload((n) => n + 1);
    };
    const timer = window.setInterval(check, 60_000);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setError("");
      setLoading(true);
      try {
        if (demoBookings) {
          setBookings(
            demoBookings.filter((b) =>
              b.booking_cameras.some((c) =>
                overlaps(
                  c.blocked_start,
                  c.blocked_end,
                  range.start,
                  range.end,
                ),
              ),
            ),
          );
          return;
        }
        const response = await fetch(
          `/api/bookings?start=${range.start}&end=${range.end}`,
          { signal: controller.signal, cache: "no-store" },
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setBookings(data);
      } catch (e) {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : "โหลดคิวไม่สำเร็จ");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [range.start, range.end, reload, demoBookings]);
  const datesSet = useCallback((arg: DatesSetArg) => {
    const start = arg.startStr.slice(0, 10),
      end = addDays(arg.endStr.slice(0, 10), -1);
    setRange((old) =>
      old.start === start && old.end === end ? old : { start, end },
    );
    setTitle(arg.view.title);
    setView(arg.view.type);
  }, []);
  const filtered = bookings.filter(
    (b) =>
      (!method || b.delivery_method_id === method) &&
      (status === "all" ||
        (status ? b.status === status : b.status !== "cancelled")),
  );
  const unitColors = cameraColors(catalog.units.map((u) => u.id));
  const visibleCameras = [
    ...new Map(
      filtered
        .flatMap((b) => b.booking_cameras)
        .filter(
          (c) =>
            (!model || c.model_id === model) && (!unit || c.unit_id === unit),
        )
        .map((c) => [c.unit_id, c]),
    ).values(),
  ];
  const events: EventInput[] = filtered.flatMap((b) =>
    b.booking_cameras
      .filter(
        (c) =>
          (!model || c.model_id === model) && (!unit || c.unit_id === unit),
      )
      .flatMap((c) => {
        const colors =
          unitColors.get(c.unit_id) ??
          cameraColors([c.unit_id]).get(c.unit_id)!;
        const title = `${c.model_name} · ${c.unit_number} ${c.color} · ${b.delivery_name} · ${statuses[b.status]}`;
        const base = {
          backgroundColor: colors.rental,
          borderColor: colors.accent,
          textColor: colors.text,
          extendedProps: {
            bookingId: b.id,
            unitId: c.unit_id,
            modelName: c.model_name,
            detail: `${c.unit_number} ${c.color} · ${b.delivery_name}`,
            statusLabel: statuses[b.status],
          },
          allDay: true,
        };
        const result: EventInput[] = [
          {
            ...base,
            id: `${c.id}-rent`,
            title,
            start: b.start_date,
            end: addDays(b.end_date, 1),
            classNames: ["event-camera", `event-${b.status}`],
          },
        ];
        if (b.status !== "cancelled" && c.blocked_start < b.start_date)
          result.push({
            ...base,
            backgroundColor: colors.buffer,
            id: `${c.id}-before`,
            title: `เผื่อส่ง · ${c.model_name} ${c.unit_number} · ${b.delivery_name}`,
            start: c.blocked_start,
            end: b.start_date,
            classNames: ["event-camera", "event-buffer"],
          });
        if (b.status !== "cancelled" && c.blocked_end > b.end_date)
          result.push({
            ...base,
            backgroundColor: colors.buffer,
            id: `${c.id}-after`,
            title: `เผื่อคืน · ${c.model_name} ${c.unit_number} · ${b.delivery_name}`,
            start: addDays(b.end_date, 1),
            end: addDays(c.blocked_end, 1),
            classNames: ["event-camera", "event-buffer"],
          });
        return result;
      }),
  );
  async function openBooking(id: string) {
    setOpening(true);
    try {
      if (demoBookings) {
        setEditor({ booking: demoBookings.find((b) => b.id === id) });
        return;
      }
      const response = await fetch(`/api/bookings?id=${id}`, {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setEditor({ booking: data });
    } catch (e) {
      setError(e instanceof Error ? e.message : "เปิดคิวไม่สำเร็จ");
    } finally {
      setOpening(false);
    }
  }
  const today = todayBangkok(),
    todayBookings = bookings.filter(
      (b) =>
        b.status !== "cancelled" &&
        overlaps(b.start_date, b.end_date, today, today),
    ),
    blockedIds = new Set(
      bookings
        .filter((b) => b.status !== "cancelled")
        .flatMap((b) =>
          b.booking_cameras
            .filter((c) =>
              overlaps(c.blocked_start, c.blocked_end, today, today),
            )
            .map((c) => c.unit_id),
        ),
    );
  const isTodayLoaded = range.start <= today && range.end >= today;
  const upcoming = filtered
    .filter(
      (b) =>
        b.end_date >= today &&
        b.booking_cameras.some(
          (c) =>
            (!model || c.model_id === model) && (!unit || c.unit_id === unit),
        ),
    )
    .slice(0, 4);
  return (
    <>
      <PageHeading
        eyebrow="YOUR RENTAL WORKSPACE"
        title="ปฏิทินคิวเช่ากล้อง"
        description="ทุกคิวอยู่ตรงนี้ วางแผนการเช่าได้อย่างสบายใจ"
      >
        <AddButton
          onClick={() => {
            setSuccess("");
            setEditor({});
          }}
        />
      </PageHeading>
      <div className="stat-grid">
        <div className="stat-card">
          <span className="stat-icon pink">
            <CalendarDays size={21} />
          </span>
          <div>
            <small>คิวเช่าวันนี้</small>
            <strong>
              {isTodayLoaded ? todayBookings.length : "—"}
              <em>คิว</em>
            </strong>
          </div>
          <span className="stat-foot">{thaiDate(today)}</span>
        </div>
        <div className="stat-card">
          <span className="stat-icon mint">
            <Camera size={21} />
          </span>
          <div>
            <small>กล้องพร้อมเช่าวันนี้</small>
            <strong>
              {isTodayLoaded
                ? catalog.units.filter(
                    (u) =>
                      u.active &&
                      catalog.models.some(
                        (m) => m.id === u.model_id && m.active,
                      ) &&
                      !blockedIds.has(u.id),
                  ).length
                : "—"}
              <em>ตัว</em>
            </strong>
          </div>
          <span className="stat-foot">รวมวันเผื่อจัดส่ง</span>
        </div>
        <div className="stat-card">
          <span className="stat-icon lavender">
            <PackageCheck size={21} />
          </span>
          <div>
            <small>คิวในช่วงที่แสดง</small>
            <strong>
              {
                filtered.filter((b) =>
                  b.booking_cameras.some(
                    (c) =>
                      (!model || c.model_id === model) &&
                      (!unit || c.unit_id === unit),
                  ),
                ).length
              }
              <em>คิว</em>
            </strong>
          </div>
          <span className="stat-foot">ตามตัวกรอง</span>
        </div>
      </div>
      {success && <Notice kind="success">{success}</Notice>}
      {error && (
        <Notice kind="error">
          {error}{" "}
          <button
            className="text-button"
            onClick={() => setReload((n) => n + 1)}
          >
            ลองอีกครั้ง
          </button>
        </Notice>
      )}
      <section className="panel calendar-panel">
        <div className="calendar-toolbar">
          <div className="calendar-navigation">
            <h2>{title || thaiDate(monthRange().start, true)}</h2>
            <div className="button-row">
              <button
                className="icon-button bordered"
                aria-label="ก่อนหน้า"
                onClick={() => calendar.current?.getApi().prev()}
              >
                <ChevronLeft size={18} />
              </button>
              <button
                className="icon-button bordered"
                aria-label="ถัดไป"
                onClick={() => calendar.current?.getApi().next()}
              >
                <ChevronRight size={18} />
              </button>
              <button
                className="button small secondary"
                onClick={() =>
                  calendar.current?.getApi().gotoDate(todayBangkok())
                }
              >
                วันนี้
              </button>
            </div>
          </div>
          <div className="segmented" aria-label="มุมมองปฏิทิน">
            {[
              ["dayGridMonth", "เดือน"],
              ["dayGridWeek", "สัปดาห์"],
            ].map(([v, label]) => (
              <button
                key={v}
                className={view === v ? "selected" : ""}
                onClick={() => calendar.current?.getApi().changeView(v)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="filter-row">
          <label className="sr-only" htmlFor="model-filter">
            กรองรุ่นกล้อง
          </label>
          <select
            id="model-filter"
            value={model}
            onChange={(e) => {
              setModel(e.target.value);
              setUnit("");
            }}
          >
            <option value="">ทุกรุ่นกล้อง</option>
            {catalog.models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <select
            aria-label="กรองกล้อง"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
          >
            <option value="">กล้องทุกตัว</option>
            {catalog.units
              .filter((u) => !model || u.model_id === model)
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.code} · {u.color}
                </option>
              ))}
          </select>
          <select
            aria-label="กรองวิธีส่ง"
            value={method}
            onChange={(e) => setMethod(e.target.value)}
          >
            <option value="">ทุกวิธีส่ง</option>
            {catalog.deliveries.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <select
            aria-label="กรองสถานะ"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">คิวที่ไม่ยกเลิก</option>
            <option value="all">ทุกสถานะ</option>
            {Object.entries(statuses).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
          <button
            className={`icon-button ${loading ? "refreshing" : ""}`}
            aria-label="โหลดคิวล่าสุด"
            onClick={() => setReload((n) => n + 1)}
          >
            <RefreshCw size={17} />
          </button>
        </div>
        <div className="calendar-surface" aria-busy={loading || opening}>
          <FullCalendar
            key="grid-calendar"
            ref={calendar}
            plugins={[dayGridPlugin, interactionPlugin]}
            locale={thLocale}
            initialView="dayGridMonth"
            initialDate={today}
            now={() => todayBangkok()}
            headerToolbar={false}
            height="auto"
            fixedWeekCount={false}
            firstDay={1}
            // A per-day cap can hide the start of a multi-day rental while
            // showing its continuation, making the rental look shifted.
            dayMaxEvents={false}
            dayMaxEventRows={false}
            eventOrder="start,-duration,allDay,title,id"
            eventOrderStrict
            events={events}
            datesSet={datesSet}
            eventClick={(info) =>
              void openBooking(info.event.extendedProps.bookingId)
            }
            eventContent={(info) =>
              info.event.classNames.includes("event-buffer") ? (
                <span className="fc-event-title">{info.event.title}</span>
              ) : (
                <div className="event-lines">
                  <strong>{info.event.extendedProps.modelName}</strong>
                  <span>{info.event.extendedProps.detail}</span>
                  <small>{info.event.extendedProps.statusLabel}</small>
                </div>
              )
            }
            dateClick={(info) => setEditor({ date: info.dateStr })}
            eventDidMount={(info) => {
              info.el.dataset.unitId = info.event.extendedProps.unitId;
              info.el.setAttribute("title", info.event.title);
              info.el.setAttribute("tabindex", "0");
              info.el.setAttribute("role", "button");
              info.el.addEventListener("keydown", (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  void openBooking(info.event.extendedProps.bookingId);
                }
              });
            }}
          />
        </div>
        <div className="calendar-legend">
          <span>
            <i className="calendar-swatch rental-swatch" />
            สีประจำกล้อง · วันเช่า
          </span>
          <span>
            <i className="calendar-swatch buffer-swatch" />
            สีอ่อนลายเฉียง · วันเผื่อส่ง–คืน
          </span>
          <small>
            {loading
              ? "กำลังโหลดคิว…"
              : "คลิกวันที่เพื่อเพิ่มคิว · คลิกชื่อกล้องเพื่อแก้ไข"}
          </small>
        </div>
        <div className="camera-color-key" aria-label="สีประจำกล้อง">
          {visibleCameras.map((c) => (
            <span key={c.unit_id}>
              <i
                className="calendar-swatch"
                style={{
                  backgroundColor: unitColors.get(c.unit_id)?.rental,
                  borderColor: unitColors.get(c.unit_id)?.accent,
                }}
              />
              {c.model_name} · {c.unit_number} {c.color} ({c.unit_code})
            </span>
          ))}
        </div>
      </section>
      <section className="upcoming">
        <div className="section-heading">
          <h2>คิวที่กำลังจะมาถึง</h2>
          <span>ในช่วงปฏิทินที่แสดง</span>
        </div>
        {upcoming.length ? (
          <div className="upcoming-grid">
            {upcoming.map((b) => (
              <button
                key={b.id}
                className="upcoming-card"
                onClick={() => void openBooking(b.id)}
              >
                <div className="upcoming-top">
                  <span className="date-tile">
                    <b>{Number(b.start_date.slice(8))}</b>
                    <small>
                      {new Intl.DateTimeFormat("th-TH", {
                        month: "short",
                        timeZone: "UTC",
                      }).format(new Date(b.start_date))}
                    </small>
                  </span>
                  <StatusBadge status={b.status} />
                </div>
                <strong>
                  {b.booking_cameras[0]?.model_name}
                  {b.booking_cameras.length > 1
                    ? ` +${b.booking_cameras.length - 1}`
                    : ""}
                </strong>
                <p>{b.customer_name}</p>
                <div className="upcoming-bottom">
                  <span>
                    {b.delivery_name} · {thaiDate(b.start_date)}–
                    {thaiDate(b.end_date)}
                  </span>
                  <ArrowUpRight size={16} />
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="quiet-empty">ยังไม่มีคิวที่กำลังจะมาถึงในช่วงนี้</div>
        )}
      </section>
      {editor && (
        <BookingForm
          key={
            editor.booking
              ? `${editor.booking.id}-${editor.booking.version}`
              : (editor.date ?? "new")
          }
          catalog={catalog}
          booking={editor.booking}
          initialDate={editor.date}
          onClose={() => setEditor(null)}
          onReload={
            editor.booking
              ? () => void openBooking(editor.booking!.id)
              : undefined
          }
          onSaved={() => {
            setEditor(null);
            setSuccess("บันทึกคิวเรียบร้อยแล้ว");
            setReload((n) => n + 1);
          }}
          demoBookings={demoBookings}
        />
      )}
    </>
  );
}
