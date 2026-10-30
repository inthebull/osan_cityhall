"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Download, Lock, MessageCircle, Sparkles } from "lucide-react";
import { OfficerChat } from "@/components/game/OfficerChat";
import type { Slide } from "@/lib/handover/deck";
import { BADGE, COVER_NOTE, HEADER, SLOGAN_LOGO, basisLabel, basisTone, chipsOf, gridOf, layoutOf, sourceRefs, splitRow, type Tone } from "@/lib/handover/layout";

export type SeatSummary = { seat_id: string; dept_id: string; team: string | null; label: string; count: number; packs: number };
export type PackSummary = { pack_id: string; dept_id: string; title: string; team: string };
type Dept = { dept_id: string; name: string };
type Deck = { seat: { seat_id: string; label: string; dept_name: string }; slides: Slide[]; ai: boolean; locked: boolean };

const SOURCE_NOTE = "출처: 오산시 홈페이지 직원 업무 목록(성명 가림), 오산시 행정기구 및 정원 조례 시행규칙 분장사무";

const TONE_CLASS: Record<Tone, string> = {
  ok: "border-osan-teal bg-osan-tint text-osan-teal-deep",
  warn: "border-wood bg-[#fcebd3] text-[#7a4a12]",
  bad: "border-rose bg-[#fde2e1] text-[#8a2e2a]",
  plain: "border-doc-line bg-doc-card text-doc-ink",
};

// 색·서체는 DESIGN.md, PPT(lib/handover/pptx.ts)와 같은 배치 규칙(lib/handover/layout.ts)으로 그린다.
function Card({ tone = "plain", className = "", children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return <div className={`min-h-0 overflow-y-auto rounded-sm border border-l-4 p-2 sm:p-3 ${TONE_CLASS[tone]} ${className}`}>{children}</div>;
}

function Dot({ n, className = "" }: { n: number | string; className?: string }) {
  return (
    <span className={`inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-osan-teal-deep text-[10px] font-bold text-foam sm:size-6 sm:text-xs ${className}`}>{n}</span>
  );
}

function SlideBody({ slide }: { slide: Slide }) {
  const layout = layoutOf(slide);
  const basis = slide.basis && (
    <Card tone={basisTone(slide.basis.strength)} className="mt-2 shrink-0 text-xs sm:text-sm">
      <b>근거 · {basisLabel(slide.basis.strength)}</b>
      <p className="text-doc-ink">{slide.basis.text}</p>
    </Card>
  );
  if (layout === "explain") {
    const [main, ...rest] = slide.bullets;
    return (
      <>
        <div className="flex min-h-0 flex-1 gap-2">
          <Card tone="ok" className={rest.length ? "basis-3/5" : "flex-1"}>
            <p className="text-xs font-bold text-osan-teal-deep">이 업무는</p>
            <p className="text-sm leading-relaxed text-doc-ink sm:text-lg">{main}</p>
          </Card>
          {rest.length > 0 && (
            <Card className="flex-1">
              <p className="text-xs font-bold text-[#7a4a12]">{slide.id === "summary" ? "이어서 볼 내용" : "유의할 점"}</p>
              {rest.map((r, i) => (
                <p key={i} className="text-xs leading-relaxed sm:text-sm">{r}</p>
              ))}
            </Card>
          )}
        </div>
        {basis}
      </>
    );
  }
  if (layout === "steps") {
    return (
      <ol className="relative flex min-h-0 flex-1 gap-2 pt-1">
        <span aria-hidden className="absolute left-[8%] right-[8%] top-[18px] h-0.5 bg-osan-teal sm:top-[22px]" />
        {slide.bullets.map((b, i) => (
          <li key={i} className="flex min-w-0 flex-1 flex-col items-center gap-2">
            <Dot n={i + 1} className="relative size-7 text-sm sm:size-9" />
            <Card className="min-h-[40%] w-full text-xs leading-relaxed sm:text-sm">{b}</Card>
          </li>
        ))}
      </ol>
    );
  }
  if (layout === "table") {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto">
        <table className="w-full border-collapse text-xs sm:text-sm">
          <thead>
            <tr className="bg-osan-navy text-left text-foam">
              <th className="w-1/4 border border-doc-line px-2 py-1">자리·부서</th>
              <th className="border border-doc-line px-2 py-1">함께 볼 내용</th>
            </tr>
          </thead>
          <tbody>
            {slide.bullets.map(splitRow).map(([a, b], i) => (
              <tr key={i} className={i % 2 ? "bg-white" : "bg-doc-card"}>
                <td className="border border-doc-line px-2 py-1 font-semibold">{a || "관련"}</td>
                <td className="border border-doc-line px-2 py-1">{b}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (layout === "questions") {
    return (
      <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        {slide.bullets.map((q, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-osan-navy text-xs font-bold text-foam sm:size-9">Q</span>
            <span className="flex-1 rounded-lg border border-osan-teal bg-osan-tint px-3 py-2 text-sm sm:text-base">{q}</span>
          </li>
        ))}
      </ul>
    );
  }
  const { cols } = gridOf(slide.bullets.length);
  const numbered = slide.kind !== "overview" || slide.bullets.length <= 16;
  return (
    <>
      <ul className={`grid min-h-0 flex-1 auto-rows-min gap-1.5 overflow-y-auto ${cols === 3 ? "sm:grid-cols-3" : cols === 2 ? "sm:grid-cols-2" : ""}`}>
        {slide.bullets.map((b, i) => (
          <li key={i} className="flex items-center gap-2 rounded-sm border border-l-4 border-doc-line bg-doc-card p-1.5 text-xs sm:p-2 sm:text-sm">
            {numbered && <Dot n={i + 1} />}
            <span>{b}</span>
          </li>
        ))}
      </ul>
      {basis}
    </>
  );
}

function SlideView({ slide, index, total }: { slide: Slide; index: number; total: number }) {
  if (slide.kind === "cover") {
    return (
      <div className="relative flex aspect-video w-full flex-col overflow-hidden rounded-md border-4 border-osan-navy bg-white pl-8 text-doc-ink sm:pl-12">
        <span aria-hidden className="absolute inset-y-0 left-0 w-2 bg-osan-navy sm:w-3" />
        <span aria-hidden className="absolute inset-y-0 left-2 w-0.5 bg-osan-teal sm:left-3 sm:w-1" />
        <div className="flex items-start justify-between gap-2 px-3 pt-4 text-[10px] sm:px-5 sm:pt-6 sm:text-xs">
          <span className="font-semibold text-osan-navy">{HEADER}</span>
          <span className="rounded-sm bg-osan-teal-deep px-2 py-0.5 font-semibold text-white">{BADGE}</span>
        </div>
        <div className="my-auto px-3 sm:px-5">
          <h2 className="text-2xl font-bold text-osan-navy sm:text-5xl">{slide.title}</h2>
          <span aria-hidden className="mt-2 block h-1 w-16 bg-osan-teal" />
          {slide.subtitle && <p className="mt-2 text-sm text-osan-teal-deep sm:text-lg">{slide.subtitle}</p>}
          {slide.bullets.map((b, i) => (
            <p key={i} className="mt-3 text-xs leading-relaxed sm:text-base">{b}</p>
          ))}
        </div>
        <div className="flex items-end justify-between gap-2 px-3 pb-2 sm:px-5">
          <span className="text-[10px] text-[#6b7280] sm:text-xs">{COVER_NOTE}</span>
          {/* 시정슬로건 원본 이미지: 비율·색 변경 금지(DESIGN.md 0절) */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={SLOGAN_LOGO} alt="시민과 함께 여는 성장도시 오산" className="h-4 w-auto sm:h-7" />
        </div>
        <p className="bg-osan-navy px-3 py-1 text-right text-[10px] font-semibold text-white sm:px-5">
          {index + 1} / {total}
        </p>
      </div>
    );
  }
  const chips = slide.kind === "overview" ? chipsOf(slide.subtitle) : [];
  return (
    <div className="flex aspect-video w-full flex-col overflow-hidden rounded-md border-4 border-osan-navy bg-white text-doc-ink">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b-2 border-osan-teal bg-osan-navy px-3 py-1 text-[10px] sm:px-5 sm:text-xs">
        <span className="text-white">{HEADER}</span>
        <span className="rounded-sm bg-osan-teal-deep px-2 py-0.5 font-semibold text-foam">{BADGE}</span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col px-3 pb-2 pt-2 sm:px-5 sm:pt-3">
        <h2 className="text-lg font-bold text-osan-navy sm:text-3xl">{slide.title}</h2>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span aria-hidden className="h-1 w-10 bg-osan-teal" />
          {chips.length
            ? chips.map((c) => (
                <span key={c.text} className={`rounded-sm border px-1.5 text-[10px] font-semibold sm:text-xs ${TONE_CLASS[c.tone]}`}>
                  {c.text}
                </span>
              ))
            : (slide.tag || slide.subtitle) && (
                <span className="text-xs font-semibold text-osan-teal-deep sm:text-sm">{[slide.tag, slide.subtitle].filter(Boolean).join(" · ")}</span>
              )}
        </div>
        <div className="mt-2 flex min-h-0 flex-1 flex-col sm:mt-3">
          <SlideBody slide={slide} />
        </div>
        {slide.sources && slide.sources.length > 0 && (
          <details className="mt-2 shrink-0 text-[10px] sm:text-xs">
            <summary className="cursor-pointer">
              <b className="text-osan-teal-deep">근거</b> {sourceRefs(slide).slice(0, 2).join(" · ")}
              {sourceRefs(slide).length > 2 ? " 외" : ""}
            </summary>
            <ul className="mt-1 max-h-24 space-y-1 overflow-y-auto">
              {slide.sources.map((x, i) => (
                <li key={i}>
                  <b>
                    {x.title} {x.page}쪽
                  </b>{" "}
                  &ldquo;{x.quote}&rdquo;{" "}
                  {x.url && (
                    <a href={x.url} target="_blank" rel="noreferrer" className="underline">
                      원문
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}
        <p className="mt-1 shrink-0 border-t border-doc-line pt-1 text-right text-[10px] font-semibold">
          {index + 1} / {total}
        </p>
      </div>
    </div>
  );
}

export function HandoverStudio({
  depts,
  seats,
  packs,
  initialDept,
}: {
  depts: Dept[];
  seats: SeatSummary[];
  packs: PackSummary[];
  initialDept: string;
}) {
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

  async function load(id: string, kind: "seat" | "pack" = "seat") {
    setSeatId(id);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/handover/deck", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(kind === "pack" ? { pack_id: id } : { seat_id: id }),
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
    if (seatId) void load(seatId, packs.some((p) => p.pack_id === seatId) ? "pack" : "seat");
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
        <nav className="max-h-[32rem] space-y-3 overflow-y-auto rounded-md border-2 border-navy/20 p-2 text-sm">
          {packs.some((p) => p.dept_id === deptId) && (
            <div className="rounded-sm bg-mint-2 p-1">
              <p className="px-1 text-xs font-semibold text-mint">업무별 맞춤 자료 (시범)</p>
              {packs
                .filter((p) => p.dept_id === deptId)
                .map((p) => (
                  <button
                    key={p.pack_id}
                    type="button"
                    onClick={() => load(p.pack_id, "pack")}
                    className={`block w-full rounded-sm px-2 py-1 text-left ${p.pack_id === seatId ? "bg-foam font-semibold" : "hover:bg-foam/70"}`}
                  >
                    {p.title} <span className="opacity-60">· {p.team}</span>
                  </button>
                ))}
            </div>
          )}
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
                    {s.packs > 0 && <span className="ml-1 rounded-sm bg-mint px-1 text-[10px] text-foam">맞춤</span>}
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
