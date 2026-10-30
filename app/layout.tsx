import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "오산시 AI 청사",
  description: "AI 주무관이 근무하는 오산시청 디지털 트윈 (F4O 시정연구모임)",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body className="antialiased min-h-screen">
        <header className="border-b border-black/10 dark:border-white/10">
          <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between">
            <Link href="/" className="font-bold">오산시 AI 청사</Link>
            <span className="text-xs opacity-60">시연용 · AI 출력은 모두 초안이며 최종 판단은 담당자</span>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
