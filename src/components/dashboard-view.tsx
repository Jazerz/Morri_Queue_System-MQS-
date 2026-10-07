"use client";
import { useEffect, useState } from "react";
import { CalendarCheck, Camera, Clock3 } from "lucide-react";
import type { Booking } from "@/lib/types";
import { monthRange } from "@/lib/dates";
import { statistics } from "@/lib/statistics";
import { Empty, Notice, PageHeading } from "./ui";
export function DashboardView({ demoBookings }: { demoBookings?: Booking[] }) {
  const [range, setRange] = useState(() => monthRange()),
    [bookings, setBookings] = useState<Booking[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [reload, setReload] = useState(0);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") setReload((n) => n + 1);
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError("");
      try {
        if (range.end < range.start)
          throw new Error("วันสิ้นสุดต้องไม่ก่อนวันเริ่มต้น");
        if (demoBookings) {
          setBookings(
            demoBookings.filter(
              (b) => b.start_date >= range.start && b.start_date <= range.end,
            ),
          );
          return;
        }
        const response = await fetch(
          `/api/bookings?mode=report&start=${range.start}&end=${range.end}`,
          { signal: controller.signal, cache: "no-store" },
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setBookings(data);
      } catch (e) {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : "โหลดสถิติไม่สำเร็จ");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [range.start, range.end, demoBookings, reload]);
  const stats = statistics(bookings),
    max = Math.max(1, ...stats.models.map((m) => m.units));
  return (
    <>
      <PageHeading
        eyebrow="RENTAL INSIGHTS"
        title="ภาพรวมการเช่า"
        description="รู้จักกล้องตัวโปรดของลูกค้า ผ่านทุกคิวที่ผ่านมา"
      />
      <div className="report-filter panel">
        <label>
          วันเริ่มเช่าตั้งแต่
          <input
            type="date"
            value={range.start}
            onChange={(e) => {
              if (e.target.value) setRange({ ...range, start: e.target.value });
            }}
          />
        </label>
        <label>
          ถึงวันที่
          <input
            type="date"
            value={range.end}
            min={range.start}
            onChange={(e) => {
              if (e.target.value) setRange({ ...range, end: e.target.value });
            }}
          />
        </label>
        <button
          className="button secondary"
          onClick={() => setRange(monthRange())}
        >
          เดือนนี้
        </button>
        <span className="subtle">นับตามวันเริ่มเช่า</span>
      </div>
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
      <div aria-busy={loading} className="stat-grid">
        <div className="stat-card">
          <span className="stat-icon pink">
            <CalendarCheck />
          </span>
          <div>
            <small>คิวเช่าจริง</small>
            <strong>
              {loading ? "…" : stats.actualCount}
              <em>คิว</em>
            </strong>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icon mint">
            <Camera />
          </span>
          <div>
            <small>จำนวนครั้งเช่ากล้อง</small>
            <strong>
              {loading ? "…" : stats.unitCount}
              <em>ครั้ง</em>
            </strong>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icon lavender">
            <Clock3 />
          </span>
          <div>
            <small>คิวจองล่วงหน้า</small>
            <strong>
              {loading ? "…" : stats.bookedCount}
              <em>คิว</em>
            </strong>
          </div>
        </div>
      </div>
      <Notice>
        ยอดเช่าจริงนับคิวที่ส่งมอบแล้วหรือคืนแล้วเท่านั้น ไม่รวมคิวที่ยกเลิก
      </Notice>
      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-heading">
            <h2>กล้องยอดนิยม</h2>
            <span className="subtle">แยกตามรุ่น</span>
          </div>
          {stats.models.length ? (
            <div className="chart-list">
              {stats.models.map((m, i) => (
                <div key={m.id} className="chart-row">
                  <span className="chart-rank">0{i + 1}</span>
                  <div>
                    <div className="chart-label">
                      <strong>{m.name}</strong>
                      <b>{m.units} ครั้ง</b>
                    </div>
                    <div className="chart-track">
                      <div style={{ width: `${(m.units / max) * 100}%` }} />
                    </div>
                    <small>
                      {m.bookings} คิวที่ไม่ซ้ำ · กล้อง {m.units}{" "}
                      ตัวในคิวเหล่านั้น
                    </small>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              title={
                loading ? "กำลังโหลดสถิติ…" : "ยังไม่มีการเช่าจริงในช่วงนี้"
              }
              description="เมื่อคิวเปลี่ยนเป็นส่งมอบแล้ว สถิติจะปรากฏที่นี่"
            />
          )}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>สถิติกล้องรายตัว</h2>
            <span className="subtle">ครั้งต่อคิว</span>
          </div>
          {stats.units.length ? (
            <div className="unit-stats">
              {stats.units.map((u) => (
                <div key={u.id}>
                  <span className="stat-icon lavender">
                    <Camera size={18} />
                  </span>
                  <strong>{u.name}</strong>
                  <b>
                    {u.count}
                    <small> ครั้ง</small>
                  </b>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              title="ยังไม่มีข้อมูลรายตัว"
              description="เลือกช่วงวันที่มีคิวส่งมอบแล้วหรือคืนแล้ว"
            />
          )}
        </section>
      </div>
    </>
  );
}
