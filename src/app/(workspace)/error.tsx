"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="empty">
      <h2>โหลดข้อมูลไม่สำเร็จ</h2>
      <p>
        ตรวจการเชื่อมต่อและลองอีกครั้ง หากยังไม่ได้
        โปรดตรวจว่าติดตั้งฐานข้อมูลแล้ว
      </p>
      <button className="button primary" onClick={reset}>
        ลองอีกครั้ง
      </button>
    </div>
  );
}
