import Link from "next/link";

export default function SiteLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <header className="border-b border-black/10 dark:border-white/10">
        <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between">
          <Link href="/" className="font-bold">오산시 AI 청사</Link>
          <span className="text-xs opacity-60">시연용 · AI 출력은 모두 초안이며 최종 판단은 담당자</span>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </>
  );
}
