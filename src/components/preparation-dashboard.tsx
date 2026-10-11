"use client";
import { useEffect, useState } from "react";
import { Check, RefreshCw } from "lucide-react";
import { addDays, thaiDate, todayBangkok } from "@/lib/dates";
import type { PreparationData, PreparationTask } from "@/lib/preparation";
import { Notice } from "./ui";

export function PreparationColumns({
  data,
  pending,
  onToggle,
  onOpen,
  loading = false,
}: {
  data: PreparationData;
  pending: string | null;
  onToggle: (task: PreparationTask, checked: boolean) => void;
  onOpen: (bookingId: string) => void;
  loading?: boolean;
}) {
  return (
    <div className="preparation-grid">
      {[
        [data.today, "ต้องส่งวันนี้"],
        [addDays(data.today, 1), "เตรียมพรุ่งนี้"],
      ].map(([date, heading]) => {
        const tasks = data.tasks.filter((task) => task.date === date);
        return (
          <section
            className="preparation-column"
            key={heading}
            aria-label={heading}
          >
            <div className="preparation-heading">
              <h2>{heading}</h2>
              <span>{thaiDate(date, true)}</span>
            </div>
            <div
              className="panel preparation-container"
              aria-busy={loading || pending !== null}
            >
              {tasks.length ? (
                tasks.map((task) => (
                  <div
                    key={task.id}
                    className={`preparation-card ${task.completed ? "is-completed" : ""}`}
                    data-task-id={task.id}
                  >
                    <div className="preparation-camera">
                      <button
                        type="button"
                        onClick={() => onOpen(task.bookingId)}
                      >
                        {task.modelName}
                      </button>
                      <span>
                        ตัวที่ {task.unitNumber} · {task.color} ·{" "}
                        {task.unitCode}
                      </span>
                      <small>
                        MQS-{String(task.reference).padStart(5, "0")}
                      </small>
                    </div>
                    <div className="preparation-details">
                      <p>
                        <span>ส่งแบบ:</span> {task.deliveryName}
                      </p>
                      <p>
                        <span>วันที่ต้องส่ง:</span> {thaiDate(task.date, true)}
                      </p>
                      {task.usesBuffer && (
                        <small className="preparation-buffer">
                          วันเผื่อส่ง
                        </small>
                      )}
                      {task.showAppointment && (
                        <p>
                          <span>เวลานัด:</span>{" "}
                          {task.appointmentTime
                            ? `${task.appointmentTime} น.`
                            : "ยังไม่ระบุ"}
                        </p>
                      )}
                      {task.returnDate && (
                        <p>
                          <span>นัดส่งคืน:</span>{" "}
                          {thaiDate(task.returnDate, true)} ·{" "}
                          {task.returnTime
                            ? `${task.returnTime} น.`
                            : "ยังไม่ระบุเวลา"}
                        </p>
                      )}
                    </div>
                    <label className="preparation-check">
                      <input
                        type="checkbox"
                        checked={task.completed}
                        disabled={pending !== null || loading}
                        aria-label={`ดำเนินการแล้ว ${task.modelName} ${task.unitCode} คิว ${task.reference}`}
                        onChange={(event) =>
                          onToggle(task, event.target.checked)
                        }
                      />
                      <span>
                        {pending === task.id ? (
                          "กำลังบันทึก"
                        ) : task.completed ? (
                          <>
                            <Check size={12} /> เรียบร้อย
                          </>
                        ) : (
                          "เสร็จแล้ว"
                        )}
                      </span>
                    </label>
                  </div>
                ))
              ) : (
                <div className="preparation-empty" role="status">
                  {loading
                    ? "กำลังโหลดรายการ…"
                    : "ไม่มีกล้องที่ต้องจัดส่งหรือเตรียมในวันนี้"}
                </div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function PreparationDashboard({
  reloadKey,
  demo = false,
  onOpen,
  onChanged,
}: {
  reloadKey: number;
  demo?: boolean;
  onOpen: (bookingId: string) => void;
  onChanged: () => void;
}) {
  const [data, setData] = useState<PreparationData>(() => ({
    today: todayBangkok(),
    tasks: [],
  }));
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(!demo);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  useEffect(() => {
    const refreshVisible = () => {
      if (document.visibilityState === "visible") setRefresh((n) => n + 1);
    };
    const interval = window.setInterval(refreshVisible, 60_000);
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, []);
  useEffect(() => {
    // The public demo must never fetch private bookings or invent daily tasks.
    if (demo) return;
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      try {
        const response = await fetch("/api/preparation", {
          cache: "no-store",
          signal: controller.signal,
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        if (!controller.signal.aborted) {
          setData(result);
          setLoadError("");
        }
      } catch (e) {
        if (!controller.signal.aborted)
          setLoadError(e instanceof Error ? e.message : "โหลดรายการไม่สำเร็จ");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [reloadKey, refresh, demo]);
  async function toggle(task: PreparationTask, completed: boolean) {
    if (pending || demo) return;
    setPending(task.id);
    setSaveError("");
    try {
      const response = await fetch("/api/preparation", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: task.id, version: task.version, completed }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setData((previous) => ({
        ...previous,
        tasks: previous.tasks.map((item) =>
          item.bookingId === task.bookingId
            ? {
                ...item,
                version: task.version + 1,
                completed: item.id === task.id ? completed : item.completed,
              }
            : item,
        ),
      }));
      onChanged();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "บันทึกสถานะไม่สำเร็จ");
    } finally {
      setPending(null);
      setRefresh((n) => n + 1);
    }
  }
  return (
    <section
      className="preparation-dashboard"
      aria-label="เตรียมกล้องวันนี้และพรุ่งนี้"
    >
      {(loadError || saveError) && (
        <Notice kind="error">
          {loadError || saveError}{" "}
          <button
            className="text-button"
            onClick={() => {
              setSaveError("");
              setRefresh((n) => n + 1);
            }}
          >
            <RefreshCw size={13} /> โหลดรายการใหม่
          </button>
        </Notice>
      )}
      <PreparationColumns
        data={data}
        loading={loading}
        pending={pending}
        onToggle={(task, checked) => void toggle(task, checked)}
        onOpen={onOpen}
      />
      {demo && (
        <p className="help preparation-demo-note">
          ส่วนเตรียมกล้องจะแสดงคิวจริงเมื่อเข้าสู่ระบบแอดมิน
        </p>
      )}
    </section>
  );
}
