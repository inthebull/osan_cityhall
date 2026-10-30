import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "오산시 AI 청사",
  description: "AI 주무관이 근무하는 오산시청 디지털 트윈 (F4O 시정연구모임)",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <head>
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;600;700&family=Jua&display=swap" />
      </head>
      <body className="antialiased min-h-screen">{children}</body>
    </html>
  );
}
