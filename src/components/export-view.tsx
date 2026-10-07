"use client";
import { useState } from "react";
import { FileSpreadsheet, FileText, Download, Check } from "lucide-react";
import type { Catalog } from "@/lib/types";
import { statuses } from "@/lib/types";
import { monthRange } from "@/lib/dates";
import { Notice, PageHeading } from "./ui";
export function ExportView({
  catalog,
  demo = false,
}: {
  catalog: Catalog;
  demo?: boolean;
}) {
  const [format, setFormat] = useState("xlsx"),
    [range, setRange] = useState(() => monthRange()),
    [model, setModel] = useState(""),
    [status, setStatus] = useState(""),
    [pending, setPending] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  async function download(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    if (demo) {
      setError("การส่งออกพร้อมใช้งานเมื่อเชื่อม Supabase และเข้าสู่ระบบแอดมิน");
      return;
    }
    if (range.end < range.start) {
      setError("ช่วงวันที่ไม่ถูกต้อง");
      return;
    }
    setPending(true);
    try {
      const query = new URLSearchParams({
        format,
        start: range.start,
        end: range.end,
        model,
        status,
      });
      const response = await fetch(`/api/export?${query}`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error);
      }
      const url = URL.createObjectURL(await response.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `MQS_${range.start}_${range.end}.${format}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setMessage("ดาวน์โหลดไฟล์เรียบร้อยแล้ว");
    } catch (e) {
      setError(e instanceof Error ? e.message : "ดาวน์โหลดไม่สำเร็จ");
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="TAKE YOUR DATA WITH YOU"
        title="ส่งออกข้อมูล"
        description="เก็บทุกคิวไว้ในไฟล์ พร้อมเปิดใน Excel หรือ Google Sheets"
      />
      <form onSubmit={download} className="export-layout">
        <section className="panel export-main">
          <h2>เลือกรูปแบบไฟล์</h2>
          <div className="format-options">
            {[
              {
                id: "xlsx",
                icon: FileSpreadsheet,
                title: "Excel workbook",
                tag: ".XLSX",
                text: "หนึ่งไฟล์ แยกแต่ละรุ่นกล้องเป็นคนละชีต",
              },
              {
                id: "csv",
                icon: FileText,
                title: "CSV document",
                tag: ".CSV",
                text: "รวมทุกรุ่นในตารางเดียว รองรับภาษาไทย",
              },
            ].map((f) => (
              <button
                className={`format-card ${format === f.id ? "selected" : ""}`}
                key={f.id}
                type="button"
                onClick={() => setFormat(f.id)}
                aria-pressed={format === f.id}
              >
                <f.icon size={30} />
                <span className="format-tag">{f.tag}</span>
                <strong>{f.title}</strong>
                <p>{f.text}</p>
                {format === f.id && (
                  <Check className="format-check" size={18} />
                )}
              </button>
            ))}
          </div>
          <h2>เลือกข้อมูลที่ต้องการ</h2>
          <div className="form-grid">
            <label>
              วันเริ่มเช่าตั้งแต่
              <input
                type="date"
                value={range.start}
                onChange={(e) => setRange({ ...range, start: e.target.value })}
                required
              />
            </label>
            <label>
              ถึงวันที่
              <input
                type="date"
                min={range.start}
                value={range.end}
                onChange={(e) => setRange({ ...range, end: e.target.value })}
                required
              />
            </label>
            <label>
              รุ่นกล้อง
              <select value={model} onChange={(e) => setModel(e.target.value)}>
                <option value="">ทุกรุ่นกล้อง</option>
                {catalog.models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              สถานะคิว
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="">ทุกสถานะ</option>
                {Object.entries(statuses).map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {error && <Notice kind="error">{error}</Notice>}
          {message && <Notice kind="success">{message}</Notice>}
          <div className="export-footer">
            <span className="help">หนึ่งแถวต่อกล้องหนึ่งตัวในแต่ละคิว</span>
            <button className="button primary" disabled={pending}>
              <Download size={18} />
              {pending ? "กำลังสร้างไฟล์…" : "ดาวน์โหลดไฟล์"}
            </button>
          </div>
        </section>
        <aside className="export-aside">
          <span className="stat-icon pink">
            <FileSpreadsheet size={25} />
          </span>
          <h2>
            ข้อมูลครบ
            <br />
            พร้อมนำไปใช้ต่อ
          </h2>
          <ul>
            <li>
              <Check size={16} />
              รายละเอียดกล้องและลูกค้า
            </li>
            <li>
              <Check size={16} />
              วันเช่าและช่วงเผื่อขนส่ง
            </li>
            <li>
              <Check size={16} />
              วิธีส่ง สถานะ และค่าเช่า
            </li>
            <li>
              <Check size={16} />
              เบอร์โทรครบ ไม่ตัดเลขศูนย์
            </li>
          </ul>
          <div className="aside-note">
            <strong>เปิดใน Google Sheets</strong>
            <p>
              เลือกไฟล์ → นำเข้า → อัปโหลด
              <br />
              แนะนำ XLSX เพื่อเก็บชีตและรูปแบบข้อความของเบอร์โทร หากใช้ CSV
              ให้ปิดการแปลงข้อความเป็นตัวเลข/วันที่/สูตร
            </p>
          </div>
        </aside>
      </form>
    </>
  );
}
