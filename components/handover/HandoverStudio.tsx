"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ChevronLeft, ChevronRight, Download, Lock, MessageCircle, Sparkles } from "lucide-react";
import { OfficerChat } from "@/components/game/OfficerChat";
import type { Slide } from "@/lib/handover/deck";

export type SeatSummary = { seat_id: string; dept_id: string; team: string | null; label: string; count: number };
type Dept = { dept_id: string; name: string };
type Deck = { seat: { seat_id: string; label: string; dept_name: string }; slides: Slide[]; ai: boolean; locked: boolean };

const SOURCE_NOTE = "출처: 오산시 홈페이지 직원 업무 목록(성명 가림), 오산시 행정기구 및 정원 조례 시행규칙 분장사무";

function SlideView({ slide, index, total }: { slide: Slide; index: number; total: number }) {
  const cover = slide.kind === "cover";
  return (
    <div className={`relative flex aspect-video w-full flex-col rounded-md border-4 border-navy p-5 sm:p-8 ${cover ? "bg-navy text-foam" : "bg-paper text-navy"}`}>
      <span className={`absolute right-3 top-3 rounded-sm px-2 py-0.5 text-[10px] font-semibold sm:text-xs ${cover ? "bg-paper text-navy" : "bg-mint text-foam"}`}>
        AI 초안 · 최종 판단은 담당자
      </span>
      <div className={cover ? "my-auto" : ""}>
        <h2 className={`font-display ${cover ? "text-3xl sm:text-5xl" : "text-xl sm:text-3xl"}`}>{slide.title}</h2>
        {(slide.tag || slide.subtitle) && (
          <p className={`mt-1 text-xs font-semibold sm:text-sm ${cover ? "text-mint-2" : "text-mint"}`}>
            {[slide.tag, slide.subtitle].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>
      <ul
        className={`mt-3 min-h-0 flex-1 space-y-1.5 overflow-y-auto text-sm leading-relaxed sm:text-base ${slide.kind === "firstweek" ? "list-decimal pl-5" : cover ? "" : "list-disc pl-5"} ${slide.bullets.length > 8 ? "sm:columns-2 sm:text-sm" : ""}`}
      >
        {slide.bullets.map((b, i) => (
          <li key={i}>{b}</li>
        ))}
      </ul>
      {slide.basis && (
        <div className={`mt-2 rounded-sm p-2 text-xs sm:text-sm ${slide.basis.strength === "direct" ? "bg-mint-2" : "bg-red-100 text-red-900"}`}>
          <b>근거 ({slide.basis.strength === "direct" ? "근거 확인" : slide.basis.strength === "review" ? "근거 검토 필요" : "확인 필요"})</b> {slide.basis.text}
        </div>
      )}
      <p className={`mt-2 text-[10px] ${cover ? "text-mint-2" : "text-navy/60"}`}>
        {index + 1}/{total}
      </p>
    </div>
  );
}

export function HandoverStudio({ depts, seats, initialDept }: { depts: Dept[]; seats: SeatSummary[]; initialDept: string }) {
  const [deptId, setDeptId] = useState(initialDept);
  const [seatId, setSeatId] = useState<string | null>(null);
  const [deck, setDeck] = useState<Deck | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [prefill, setPrefill] = useState<{ text: string; n: number } | undefined>();
  const [passcode, setPasscode] = useState("");
  const [passError, setPassError] = useState<string | null>(null);

  const dept = depts.find((d) => d.dept_id === deptId)!;
  const teams = [...new Set(seats.filter((s) => s.dept_id === deptId).map((s) => s.team ?? "부서장"))];

  async function load(id: string) {
    setSeatId(id);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/handover/deck", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ seat_id: id }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setDeck(body);
      setPage(0);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "슬라이드를 만들지 못했습니다.");
    }
    setLoading(false);
  }

  async function unlock(event: FormEvent) {
    event.preventDefault();
    setPassError(null);
    const res = await fetch("/api/unlock", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ passcode }),
    });
    if (!res.ok) {
      setPassError((await res.json().catch(() => ({}))).error ?? "접속 암호를 확인해 주세요.");
      return;
    }
    setPasscode("");
    if (seatId) void load(seatId);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (!deck || (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA"))) return;
      if (e.key === "ArrowRight") setPage((p) => Math.min(deck.slides.length - 1, p + 1));
      if (e.key === "ArrowLeft") setPage((p) => Math.max(0, p - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deck]);

  const slide = deck?.slides[page];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">AI 인수인계</h1>
        <p className="text-sm opacity-70">
          자리를 고르면 맡게 될 업무를 쉬운 말로 풀어 쓴 인수인계 슬라이드를 만들고, PPT로 내려받을 수 있습니다. 슬라이드를 보다가 모르는 점은 아래 AI 주무관에게 물어보세요.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {depts.map((d) => (
          <button
            key={d.dept_id}
            type="button"
            onClick={() => {
              setDeptId(d.dept_id);
              setDeck(null);
              setSeatId(null);
            }}
            className={`rounded-md border-2 border-navy px-3 py-1.5 text-sm font-semibold ${d.dept_id === deptId ? "bg-navy text-foam" : "bg-foam text-navy"}`}
          >
            {d.name}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[13rem_1fr]">
        <nav className="max-h-[28rem] space-y-3 overflow-y-auto rounded-md border-2 border-navy/20 p-2 text-sm">
          {teams.map((team) => (
            <div key={team}>
              <p className="px-1 text-xs font-semibold text-mint">{team}</p>
              {seats
                .filter((s) => s.dept_id === deptId && (s.team ?? "부서장") === team)
                .map((s) => (
                  <button
                    key={s.seat_id}
                    type="button"
                    onClick={() => load(s.seat_id)}
                    className={`block w-full rounded-sm px-2 py-1 text-left ${s.seat_id === seatId ? "bg-mint-2 font-semibold" : "hover:bg-paper-2"}`}
                  >
                    {s.label.replace(`${team} `, "")} <span className="opacity-60">· 업무 {s.count}건</span>
                  </button>
                ))}
            </div>
          ))}
        </nav>

        <div className="space-y-3">
          {!deck && !loading && <p className="rounded-md bg-paper-2 p-6 text-center text-sm text-navy">왼쪽에서 인수인계를 받을 자리를 고르세요.</p>}
          {loading && <p className="rounded-md bg-paper-2 p-6 text-center text-sm text-navy">인수인계 슬라이드를 만드는 중입니다…</p>}
          {error && <p className="rounded-md bg-red-100 p-3 text-sm text-red-800">{error}</p>}

          {deck && slide && !loading && (
            <>
              <SlideView slide={slide} index={page} total={deck.slides.length} />
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => setPage((p) => Math.max(0, p - 1))} className="rounded-md border-2 border-navy bg-foam p-2 text-navy" aria-label="이전 장">
                  <ChevronLeft size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(deck.slides.length - 1, p + 1))}
                  className="rounded-md border-2 border-navy bg-foam p-2 text-navy"
                  aria-label="다음 장"
                >
                  <ChevronRight size={18} />
                </button>
                {slide.question && (
                  <button
                    type="button"
                    onClick={() => setPrefill({ text: slide.question as string, n: Date.now() })}
                    className="flex items-center gap-1 rounded-md border-2 border-navy bg-foam px-3 py-2 text-sm font-semibold text-navy"
                  >
                    <MessageCircle size={16} />이 장에 대해 묻기
                  </button>
                )}
                <button
                  type="button"
                  onClick={async () => {
                    const { downloadPptx } = await import("@/lib/handover/pptx");
                    await downloadPptx(deck.slides, `인수인계_${deck.seat.dept_name}_${deck.seat.label}`.replace(/\s+/g, "_"), SOURCE_NOTE);
                  }}
                  className="flex items-center gap-1 rounded-md border-2 border-navy bg-mint px-3 py-2 text-sm font-semibold text-foam"
                >
                  <Download size={16} />
                  PPT 내려받기
                </button>
                <span className="text-xs opacity-70">
                  {deck.ai ? (
                    <span className="inline-flex items-center gap-1">
                      <Sparkles size={14} />
                      AI가 쉬운 말로 풀어 쓴 초안
                    </span>
                  ) : (
                    "기본 문장으로 만든 초안"
                  )}
                </span>
              </div>
              {deck.locked && (
                <form onSubmit={unlock} className="flex flex-wrap items-center gap-2 rounded-md bg-paper-2 p-2 text-sm">
                  <Lock size={16} className="text-navy" />
                  <span>시연용 접속 암호를 넣으면 AI가 업무 설명을 쉬운 말로 다시 씁니다.</span>
                  <input
                    type="password"
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value)}
                    placeholder="접속 암호"
                    className="min-w-0 flex-1 rounded-md border-2 border-navy bg-foam px-2 py-1"
                  />
                  <button type="submit" className="rounded-md border-2 border-navy bg-navy px-3 py-1 font-semibold text-foam">
                    열기
                  </button>
                  {passError && <span className="text-xs text-red-800">{passError}</span>}
                </form>
              )}
              <div className="flex gap-1 overflow-x-auto pb-1">
                {deck.slides.map((s, i) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setPage(i)}
                    className={`shrink-0 rounded-sm border-2 px-2 py-1 text-xs ${i === page ? "border-navy bg-navy text-foam" : "border-navy/30 bg-foam text-navy"}`}
                  >
                    {i + 1}. {s.title.length > 10 ? `${s.title.slice(0, 10)}…` : s.title}
                  </button>
                ))}
              </div>
            </>
          )}

          <section className="rounded-md border-4 border-navy bg-paper p-4">
            <OfficerChat key={deptId} deptId={deptId} deptName={dept.name} prefill={prefill} />
          </section>
        </div>
      </div>
    </div>
  );
}
