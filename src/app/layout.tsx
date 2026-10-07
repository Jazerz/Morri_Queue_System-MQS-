import type { Metadata } from "next";
import "@fontsource/noto-sans-thai/400.css";
import "@fontsource/noto-sans-thai/500.css";
import "@fontsource/noto-sans-thai/600.css";
import "@fontsource/noto-sans-thai/700.css";
import "./globals.css";
export const metadata: Metadata = {
  title: "Morri — จัดการคิวเช่ากล้อง",
  description: "พื้นที่จัดการกล้อง คิวเช่า และความทรงจำดี ๆ สำหรับแอดมิน",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
