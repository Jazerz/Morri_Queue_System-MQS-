"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Package, Pencil, Truck, Plus, Tag } from "lucide-react";
import type { Catalog } from "@/lib/types";
import { money } from "@/lib/dates";
import { saveCatalog } from "@/app/actions";
import { AddButton, Empty, Modal, Notice, PageHeading } from "./ui";
type Table =
  | "camera_models"
  | "camera_units"
  | "rental_rates"
  | "gadgets"
  | "delivery_methods";
type Row = Record<string, string | number | boolean>;
const tableLabels: Record<Table, string> = {
  camera_models: "รุ่นกล้อง",
  camera_units: "กล้องรายตัว",
  rental_rates: "ราคาเช่า",
  gadgets: "อุปกรณ์",
  delivery_methods: "วิธีส่ง",
};
const initial: Record<Table, Row> = {
  camera_models: { name: "", active: true },
  camera_units: { model_id: "", code: "", number: "", color: "", active: true },
  rental_rates: { model_id: "", days: 1, price: "" },
  gadgets: { name: "", active: true },
  delivery_methods: {
    name: "",
    days_before: 0,
    days_after: 0,
    requires_address: true,
    active: true,
  },
};
function CatalogEditor({
  table,
  row,
  catalog,
  demo,
  onClose,
  onSaved,
}: {
  table: Table;
  row?: Row;
  catalog: Catalog;
  demo: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<Row>(row ?? initial[table]),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const set = (key: string, value: string | number | boolean) =>
    setValues((v) => ({ ...v, [key]: value }));
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (demo) {
      setError("โหมดตัวอย่างไม่บันทึกข้อมูล");
      return;
    }
    setPending(true);
    setError("");
    try {
      const result = await saveCatalog(
        table,
        row?.id as string | undefined,
        values,
      );
      if (!result.ok) setError(result.error);
      else onSaved();
    } catch {
      setError("ไม่สามารถเชื่อมต่อได้ กรุณาลองใหม่");
    } finally {
      setPending(false);
    }
  }
  return (
    <Modal
      title={`${row?.id ? "แก้ไข" : "เพิ่ม"}${tableLabels[table]}`}
      onClose={() => {
        if (!pending) onClose();
      }}
    >
      <form onSubmit={submit}>
        <div className="form-body stack">
          {"name" in values && (
            <label>
              ชื่อ{tableLabels[table]} *
              <input
                value={String(values.name)}
                onChange={(e) => set("name", e.target.value)}
                maxLength={120}
                required
              />
            </label>
          )}
          {"model_id" in values && (
            <label>
              รุ่นกล้อง *
              <select
                value={String(values.model_id)}
                onChange={(e) => set("model_id", e.target.value)}
                required
              >
                <option value="" disabled>
                  เลือกรุ่นกล้อง
                </option>
                {catalog.models
                  .filter((m) => m.active || m.id === values.model_id)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
          {table === "camera_units" && (
            <>
              <label>
                รหัสกล้อง (ไม่ซ้ำ) *
                <input
                  value={String(values.code)}
                  onChange={(e) => set("code", e.target.value)}
                  required
                  maxLength={40}
                  placeholder="เช่น CAN-01"
                />
              </label>
              <div className="form-grid">
                <label>
                  หมายเลขตัว *
                  <input
                    value={String(values.number)}
                    onChange={(e) => set("number", e.target.value)}
                    required
                    maxLength={40}
                    placeholder="01"
                  />
                </label>
                <label>
                  สี *
                  <input
                    value={String(values.color)}
                    onChange={(e) => set("color", e.target.value)}
                    required
                    maxLength={60}
                    placeholder="ดำ"
                  />
                </label>
              </div>
            </>
          )}
          {table === "rental_rates" && (
            <div className="form-grid">
              <label>
                จำนวนวัน *
                <input
                  type="number"
                  min="1"
                  max="3660"
                  step="1"
                  value={Number(values.days)}
                  onChange={(e) => set("days", Number(e.target.value))}
                  required
                />
              </label>
              <label>
                ราคารวม (บาท) *
                <input
                  type="number"
                  min="0"
                  max="9999999999.99"
                  step="0.01"
                  value={String(values.price)}
                  onChange={(e) =>
                    set(
                      "price",
                      e.target.value === "" ? "" : Number(e.target.value),
                    )
                  }
                  required
                />
              </label>
            </div>
          )}
          {table === "delivery_methods" && (
            <>
              <div className="form-grid">
                <label>
                  เผื่อก่อนเช่า (วัน)
                  <input
                    type="number"
                    min="0"
                    max="365"
                    step="1"
                    value={Number(values.days_before)}
                    onChange={(e) => set("days_before", Number(e.target.value))}
                    required
                  />
                </label>
                <label>
                  เผื่อหลังเช่า (วัน)
                  <input
                    type="number"
                    min="0"
                    max="365"
                    step="1"
                    value={Number(values.days_after)}
                    onChange={(e) => set("days_after", Number(e.target.value))}
                    required
                  />
                </label>
              </div>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={!!values.requires_address}
                  onChange={(e) => set("requires_address", e.target.checked)}
                />
                ต้องกรอกที่อยู่ลูกค้า
              </label>
              <Notice>
                การเปลี่ยนจำนวนวันเผื่อจะใช้กับคิวใหม่ คิวเดิมเก็บค่าเดิมไว้
              </Notice>
            </>
          )}
          {"active" in values && (
            <label className="check-label">
              <input
                type="checkbox"
                checked={!!values.active}
                onChange={(e) => set("active", e.target.checked)}
              />
              เปิดใช้งานสำหรับคิวใหม่
            </label>
          )}
          {error && <Notice kind="error">{error}</Notice>}
        </div>
        <div className="form-footer">
          <button
            type="button"
            className="button secondary"
            disabled={pending}
            onClick={onClose}
          >
            ยกเลิก
          </button>
          <button className="button primary" disabled={pending}>
            {pending ? "กำลังบันทึก…" : "บันทึกข้อมูล"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function CatalogView({
  catalog,
  settings = false,
  demo = false,
}: {
  catalog: Catalog;
  settings?: boolean;
  demo?: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState("cameras"),
    [search, setSearch] = useState(""),
    [editor, setEditor] = useState<{ table: Table; row?: Row } | null>(null),
    [success, setSuccess] = useState("");
  const edit = (table: Table, row?: object) =>
    setEditor({ table, row: row as Row | undefined });
  const matches = (v: string) => v.toLowerCase().includes(search.toLowerCase());
  return (
    <>
      <PageHeading
        eyebrow={settings ? "DELIVERY SETTINGS" : "YOUR CAMERA COLLECTION"}
        title={settings ? "ตั้งค่าการจัดส่ง" : "กล้องและอุปกรณ์"}
        description={
          settings
            ? "กำหนดวิธีส่งและวันเผื่อ ให้ทุกคิวมีเวลาพร้อมเสมอ"
            : "ดูแลกล้องทุกตัว พร้อมสำหรับความทรงจำครั้งต่อไป"
        }
      >
        <AddButton
          onClick={() =>
            edit(
              settings
                ? "delivery_methods"
                : tab === "gadgets"
                  ? "gadgets"
                  : "camera_models",
            )
          }
        >
          {settings
            ? "เพิ่มวิธีส่ง"
            : tab === "gadgets"
              ? "เพิ่มอุปกรณ์"
              : "เพิ่มรุ่นกล้อง"}
        </AddButton>
      </PageHeading>
      {success && <Notice kind="success">{success}</Notice>}
      {!settings && (
        <div className="inventory-toolbar">
          <div className="tabs">
            <button
              className={tab === "cameras" ? "active" : ""}
              onClick={() => setTab("cameras")}
            >
              <Camera size={18} />
              กล้อง <span>{catalog.units.length}</span>
            </button>
            <button
              className={tab === "gadgets" ? "active" : ""}
              onClick={() => setTab("gadgets")}
            >
              <Package size={18} />
              อุปกรณ์ <span>{catalog.gadgets.length}</span>
            </button>
          </div>
          <input
            className="search"
            aria-label="ค้นหากล้องหรืออุปกรณ์"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหารุ่น รหัส หรืออุปกรณ์…"
          />
        </div>
      )}
      {settings ? (
        <div className="delivery-grid">
          {catalog.deliveries.map((d) => (
            <section className="panel delivery-card" key={d.id}>
              <div className="section-heading">
                <span className="stat-icon pink">
                  <Truck size={23} />
                </span>
                <button
                  className="icon-button"
                  aria-label={`แก้ไข ${d.name}`}
                  onClick={() => edit("delivery_methods", d)}
                >
                  <Pencil size={17} />
                </button>
              </div>
              <h2>{d.name}</h2>
              <span className={`availability ${d.active ? "" : "inactive"}`}>
                {d.active ? "เปิดใช้งาน" : "ปิดใช้งาน"}
              </span>
              <div className="delivery-days">
                <div>
                  <small>ก่อนวันเช่า</small>
                  <b>
                    {d.days_before}
                    <em> วัน</em>
                  </b>
                </div>
                <span>→</span>
                <div>
                  <small>หลังวันเช่า</small>
                  <b>
                    {d.days_after}
                    <em> วัน</em>
                  </b>
                </div>
              </div>
              <p className="help left">
                {d.requires_address
                  ? "ต้องมีที่อยู่สำหรับจัดส่ง"
                  : "ไม่บังคับที่อยู่ลูกค้า"}
              </p>
            </section>
          ))}
        </div>
      ) : tab === "cameras" ? (
        <>
          {catalog.models.length === 0 ? (
            <Empty
              title="เริ่มสร้างคอลเลกชันกล้อง"
              description="เพิ่มรุ่นกล้อง แล้วเพิ่มกล้องรายตัวพร้อมสีและราคาเช่า"
            >
              <AddButton onClick={() => edit("camera_models")}>
                เพิ่มรุ่นกล้อง
              </AddButton>
            </Empty>
          ) : (
            <div className="model-list">
              {catalog.models
                .filter(
                  (m) =>
                    matches(m.name) ||
                    catalog.units.some(
                      (u) => u.model_id === m.id && matches(u.code + u.color),
                    ),
                )
                .map((m) => (
                  <section className="panel model-card" key={m.id}>
                    <div className="model-header">
                      <span className="camera-art">
                        <Camera size={34} strokeWidth={1.3} />
                      </span>
                      <div>
                        <span className="eyebrow">CAMERA MODEL</span>
                        <h2>{m.name}</h2>
                        <span
                          className={`availability ${m.active ? "" : "inactive"}`}
                        >
                          {m.active ? "เปิดใช้งาน" : "ปิดใช้งาน"}
                        </span>
                      </div>
                      <button
                        className="icon-button"
                        aria-label={`แก้ไขรุ่น ${m.name}`}
                        onClick={() => edit("camera_models", m)}
                      >
                        <Pencil size={17} />
                      </button>
                    </div>
                    <div className="rate-strip">
                      <Tag size={16} />
                      {catalog.rates
                        .filter((r) => r.model_id === m.id)
                        .map((r) => (
                          <button
                            className="rate-pill"
                            key={r.id}
                            onClick={() => edit("rental_rates", r)}
                          >
                            {r.days} วัน <b>{money(r.price)}</b>
                            <Pencil size={11} />
                          </button>
                        ))}
                      <button
                        className="text-button"
                        onClick={() =>
                          edit("rental_rates", {
                            ...initial.rental_rates,
                            model_id: m.id,
                          })
                        }
                      >
                        <Plus size={14} />
                        เพิ่ม rate
                      </button>
                    </div>
                    <div className="unit-table">
                      <div className="unit-table-heading">
                        <span>กล้องในรุ่นนี้</span>
                        <button
                          className="text-button"
                          onClick={() =>
                            edit("camera_units", {
                              ...initial.camera_units,
                              model_id: m.id,
                            })
                          }
                        >
                          <Plus size={15} />
                          เพิ่มกล้องรายตัว
                        </button>
                      </div>
                      {catalog.units
                        .filter((u) => u.model_id === m.id)
                        .map((u) => (
                          <div className="unit-row" key={u.id}>
                            <span className="unit-code">{u.code}</span>
                            <span>ตัวที่ {u.number}</span>
                            <span>สี{u.color}</span>
                            <span
                              className={`availability ${u.active ? "" : "inactive"}`}
                            >
                              {u.active ? "เปิดใช้งาน" : "ปิดใช้งาน"}
                            </span>
                            <button
                              className="icon-button"
                              aria-label={`แก้ไขกล้อง ${u.code}`}
                              onClick={() => edit("camera_units", u)}
                            >
                              <Pencil size={15} />
                            </button>
                          </div>
                        ))}
                      {!catalog.units.some((u) => u.model_id === m.id) && (
                        <p className="quiet-empty">
                          ยังไม่มีกล้องรายตัวในรุ่นนี้
                        </p>
                      )}
                    </div>
                  </section>
                ))}
            </div>
          )}
        </>
      ) : (
        <section className="panel">
          <div className="panel-heading">
            <h2>รายการอุปกรณ์</h2>
            <span className="subtle">บันทึกจำนวนที่แนบกับคิว ไม่กันสต็อก</span>
          </div>
          {!catalog.gadgets.length ? (
            <Empty title="ยังไม่มีอุปกรณ์" />
          ) : (
            catalog.gadgets
              .filter((g) => matches(g.name))
              .map((g) => (
                <div className="gadget-row" key={g.id}>
                  <span className="stat-icon lavender">
                    <Package size={20} />
                  </span>
                  <strong>{g.name}</strong>
                  <span
                    className={`availability ${g.active ? "" : "inactive"}`}
                  >
                    {g.active ? "เปิดใช้งาน" : "ปิดใช้งาน"}
                  </span>
                  <button
                    className="icon-button"
                    aria-label={`แก้ไขอุปกรณ์ ${g.name}`}
                    onClick={() => edit("gadgets", g)}
                  >
                    <Pencil size={16} />
                  </button>
                </div>
              ))
          )}
        </section>
      )}
      {editor && (
        <CatalogEditor
          key={`${editor.table}-${editor.row?.id ?? "new"}`}
          table={editor.table}
          row={editor.row}
          catalog={catalog}
          demo={demo}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            setSuccess("บันทึกข้อมูลเรียบร้อยแล้ว");
            router.refresh();
          }}
        />
      )}
    </>
  );
}
