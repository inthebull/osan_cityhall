"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ChevronLeft, ChevronRight, Download, Lock, MessageCircle, Sparkles } from "lucide-react";
import { OfficerChat } from "@/components/game/OfficerChat";
import type { Slide } from "@/lib/handover/deck";
import { BADGE, COVER_NOTE, HEADER, SLOGAN_LOGO, basisLabel, basisTone, bigNumber, chipsOf, gridOf, kpisOf, layoutOf, officialDate, sourceRefs, splitRow, withSections, type Tone } from "@/lib/handover/layout";

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
const KPI_CLASS: Record<Tone, string> = { ok: "border-osan-teal text-osan-teal-deep", warn: "border-wood text-[#7a4a12]", bad: "border-rose text-[#8a2e2a]", plain: "border-doc-line text-doc-ink" };
const PILL_CLASS: Record<Tone, string> = { ok: "bg-osan-teal-deep", warn: "bg-[#7a4a12]", bad: "bg-[#8a2e2a]", plain: "bg-doc-ink" };

// 색·서체는 DESIGN.md, PPT(lib/handover/pptx.ts)와 같은 배치 규칙(lib/handover/layout.ts), 패턴 번호는 osan-slide-references 스킬.
function Badge() {
  return <span className="rounded-sm border border-osan-teal bg-osan-tint px-2 py-0.5 text-[10px] font-semibold text-osan-teal-deep sm:text-xs">{BADGE}</span>;
}

function NumberedList({ items, numbered = true }: { items: string[]; numbered?: boolean }) {
  const { cols } = gridOf(items.length);
  return (
    <ol className={`grid min-h-0 flex-1 auto-rows-min gap-x-6 overflow-y-auto ${cols === 3 ? "sm:grid-cols-3" : cols === 2 ? "sm:grid-cols-2" : ""}`}>
      {items.map((b, i) => (
        <li key={i} className="flex gap-2 border-t border-doc-line py-1.5 text-xs sm:py-2 sm:text-sm">
          {numbered && <span className="w-5 shrink-0 font-bold text-osan-teal-deep">{i + 1}.</span>}
          <span>{b}</span>
        </li>
      ))}
    </ol>
  );
}

function BasisStrip({ slide }: { slide: Slide }) {
  if (!slide.basis) return null;
  const tone = basisTone(slide.basis.strength);
  return (
    <div className={`mt-2 flex shrink-0 items-center gap-2 border-l-4 p-2 text-xs sm:text-sm ${TONE_CLASS[tone]}`}>
      <span className={`shrink-0 rounded-sm px-2 py-0.5 text-[10px] font-bold text-white sm:text-xs ${PILL_CLASS[tone]}`}>근거 · {basisLabel(slide.basis.strength)}</span>
      <span className="text-doc-ink">{slide.basis.text}</span>
    </div>
  );
}

function SlideBody({ slide }: { slide: Slide }) {
  const layout = layoutOf(slide);
  if (layout === "overview") {
    return (
      <div className="flex min-h-0 flex-1 gap-4">
        <div className="w-1/3 shrink-0 border-r border-doc-line pr-4">
          <p className="font-bold text-osan-navy">
            <span className="text-5xl sm:text-7xl">{bigNumber(slide.title) ?? slide.bullets.length}</span>
            <span className="text-lg sm:text-2xl"> 건</span>
          </p>
          <p className="mt-1 text-xs text-[#6b7280] sm:text-sm">이 자리에서 맡게 될 업무</p>
          <dl className="mt-3 flex gap-2">
            {kpisOf(slide.subtitle).map((k) => (
              <div key={k.label} className={`flex-1 border-t-2 pt-1 ${KPI_CLASS[k.tone]}`}>
                <dd className="text-lg font-bold sm:text-2xl">{k.value}</dd>
                <dt className="text-[10px] text-[#6b7280] sm:text-xs">{k.label}</dt>
              </div>
            ))}
          </dl>
          <p className="mt-2 hidden text-xs leading-relaxed sm:block">&apos;검토 필요&apos;·&apos;못 찾음&apos; 업무는 팀장과 범위를 확인하세요.</p>
        </div>
        <NumberedList items={slide.bullets} />
      </div>
    );
  }
  if (layout === "explain") {
    const [main, ...rest] = slide.bullets;
    return (
      <>
        <div className="flex min-h-0 flex-1 gap-4 overflow-y-auto">
          <div className={rest.length ? "basis-2/3" : "flex-1"}>
            <p className="text-xs font-bold text-osan-teal-deep">{slide.id === "summary" ? "한눈에 보기" : "이 업무는"}</p>
            <p className="mt-1 text-sm leading-relaxed sm:text-xl">{main}</p>
          </div>
          {rest.length > 0 && (
            <div className="flex-1 border-l border-doc-line pl-4">
              <p className="text-xs font-bold text-[#7a4a12]">{slide.id === "summary" ? "이어서 볼 내용" : "유의할 점"}</p>
              {rest.map((r, i) => (
                <p key={i} className="mt-1 text-xs leading-relaxed sm:text-sm">{r}</p>
              ))}
            </div>
          )}
        </div>
        <BasisStrip slide={slide} />
      </>
    );
  }
  if (layout === "steps") {
    return (
      <ol className="relative flex min-h-0 flex-1 gap-3 pt-1">
        <span aria-hidden className="absolute left-0 right-0 top-[14px] h-px bg-doc-line sm:top-[17px]" />
        {slide.bullets.map((b, i) => (
          <li key={i} className="relative flex min-w-0 flex-1 flex-col gap-1">
            <span className={`inline-flex size-7 items-center justify-center rounded-full border-2 text-xs font-bold sm:size-9 sm:text-sm ${i === 0 ? "border-osan-teal-deep bg-osan-teal-deep text-white" : "border-osan-navy bg-white text-osan-navy"}`}>{i + 1}</span>
            <span className={`text-[10px] font-bold sm:text-xs ${i === 0 ? "text-osan-teal-deep" : "text-[#6b7280]"}`}>{i === 0 ? "먼저" : `${i + 1}단계`}</span>
            <span className="text-xs leading-relaxed sm:text-sm">{b}</span>
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
            <tr className="border-b-2 border-osan-navy bg-doc-card text-left text-osan-navy">
              <th className="w-1/3 py-1 pl-1 pr-2">자리·부서</th>
              <th className="py-1">함께 볼 내용</th>
            </tr>
          </thead>
          <tbody>
            {slide.bullets.map(splitRow).map(([a, b], i) => (
              <tr key={i} className="border-b border-doc-line align-top">
                <td className="py-1 pr-2 font-semibold text-osan-navy">{a || "관련"}</td>
                <td className="py-1">{b}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (layout === "questions") {
    return (
      <div className="flex min-h-0 flex-1 gap-4">
        <ul className="flex basis-2/3 flex-col overflow-y-auto">
          {slide.bullets.map((q, i) => (
            <li key={i} className="flex items-center gap-2 border-b border-doc-line py-2 text-sm sm:text-base">
              <span className="text-lg font-bold text-osan-teal sm:text-2xl">Q</span>
              <span>{q}</span>
            </li>
          ))}
        </ul>
        <div className="hidden flex-1 bg-osan-tint p-3 text-xs leading-relaxed sm:block">
          <p className="font-bold text-osan-teal-deep">AI 주무관 답변 원칙</p>
          <p className="mt-2">내려받은 지침·분장사무 안에서만 답합니다.</p>
          <p className="mt-2">답에는 근거 문서와 쪽을 함께 붙입니다.</p>
          <p className="mt-2">근거를 못 찾으면 &apos;확인 필요&apos;로 남깁니다.</p>
        </div>
      </div>
    );
  }
  return (
    <>
      <NumberedList items={slide.bullets} numbered={slide.bullets.length <= 16} />
      <BasisStrip slide={slide} />
    </>
  );
}

function Footer({ slide, index, total, dark = false }: { slide: Slide; index: number; total: number; dark?: boolean }) {
  const refs = sourceRefs(slide);
  return (
    <>
      {slide.sources && slide.sources.length > 0 && (
        <details className="mt-2 shrink-0 text-[10px] sm:text-xs">
          <summary className="cursor-pointer">
            <b className="text-osan-teal-deep">근거</b> {refs.slice(0, 2).join(" · ")}
            {refs.length > 2 ? " 외" : ""}
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
      <p className={`mt-1 shrink-0 border-t pt-1 text-center text-[10px] font-semibold ${dark ? "border-[#3a4ba6] text-white" : "border-doc-line text-osan-navy"}`}>
        {index + 1} / {total}
      </p>
    </>
  );
}

function SlideView({ slide, index, total }: { slide: Slide; index: number; total: number }) {
  const layout = layoutOf(slide);
  if (layout === "cover") {
    return (
      <div className="relative flex aspect-video w-full flex-col overflow-hidden rounded-md border border-doc-line bg-white pl-6 text-doc-ink sm:pl-10">
        <span aria-hidden className="absolute inset-y-0 left-0 w-2 bg-osan-navy sm:w-3" />
        <span aria-hidden className="absolute inset-y-0 left-2 w-0.5 bg-osan-teal sm:left-3 sm:w-1" />
        <div className="flex items-start justify-between gap-2 px-3 pt-3 sm:px-5 sm:pt-5">
          <span className="text-xs font-bold text-osan-teal-deep sm:text-sm">업무 인수인계 안내</span>
          <Badge />
        </div>
        <div className="my-auto px-3 sm:px-5">
          <h2 className="text-2xl font-bold text-osan-navy sm:text-5xl">{slide.title}</h2>
          <span aria-hidden className="mt-2 block h-1 w-16 bg-osan-teal" />
          {slide.subtitle && <p className="mt-2 text-sm sm:text-lg">{slide.subtitle}</p>}
          {slide.bullets.map((b, i) => (
            <p key={i} className="mt-2 text-xs leading-relaxed text-[#6b7280] sm:text-sm">{b}</p>
          ))}
        </div>
        <div className="mx-3 flex items-end justify-between gap-2 border-t border-doc-line pb-1 pt-2 sm:mx-5">
          <p className="text-[10px] sm:text-xs">
            <b className="text-osan-navy">{officialDate()}</b>
            <br />
            <span className="text-[#6b7280]">{COVER_NOTE}</span>
          </p>
          {/* 시정슬로건 원본 이미지: 비율·색 변경 금지(DESIGN.md 0절) */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={SLOGAN_LOGO} alt="시민과 함께 여는 성장도시 오산" className="h-4 w-auto sm:h-7" />
        </div>
        <p className="pb-1 text-center text-[10px] font-semibold text-osan-navy">
          {index + 1} / {total}
        </p>
      </div>
    );
  }
  if (layout === "section") {
    return (
      <div className="flex aspect-video w-full flex-col overflow-hidden rounded-md bg-osan-navy px-3 pt-2 text-white sm:px-5 sm:pt-3">
        <div className="flex items-center justify-between gap-2 text-[10px] sm:text-xs">
          <span className="text-[#c9cfea]">{HEADER}</span>
          <Badge />
        </div>
        <div className="flex min-h-0 flex-1 items-center gap-4">
          <div className="basis-7/12">
            <p className="text-4xl font-bold text-osan-teal sm:text-7xl">{slide.tag}</p>
            <h2 className="mt-1 text-xl font-bold sm:text-4xl">{slide.title}</h2>
            <span aria-hidden className="mt-2 block h-1 w-10 bg-osan-teal" />
          </div>
          <ul className="flex-1 text-xs sm:text-base">
            {slide.bullets.map((b, i) => (
              <li key={i} className="flex gap-2 border-t border-[#3a4ba6] py-1 sm:py-2">
                <span className="w-6 shrink-0 font-bold text-osan-teal">{String(i + 1).padStart(2, "0")}</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>
        <Footer slide={slide} index={index} total={total} dark />
      </div>
    );
  }
  const chips = slide.kind === "overview" ? chipsOf(slide.subtitle) : [];
  const head = [slide.tag, slide.subtitle].filter(Boolean).join(" · ");
  return (
    <div className="flex aspect-video w-full flex-col overflow-hidden rounded-md border border-doc-line bg-white text-doc-ink">
      <span aria-hidden className="h-1 shrink-0 bg-osan-navy" />
      <div className="flex min-h-0 flex-1 flex-col px-3 pb-1 pt-2 sm:px-5 sm:pt-3">
        <div className="flex items-center justify-between gap-2 text-[10px] sm:text-xs">
          <span className="text-[#6b7280]">{HEADER}</span>
          <Badge />
        </div>
        <h2 className="mt-1 text-lg font-bold text-osan-navy sm:text-3xl">{slide.title}</h2>
        {chips.length > 0 ? (
          <div className="mt-1 flex flex-wrap gap-2">
            {chips.map((c) => (
              <span key={c.text} className={`rounded-sm border px-1.5 text-[10px] font-semibold sm:text-xs ${TONE_CLASS[c.tone]}`}>
                {c.text}
              </span>
            ))}
          </div>
        ) : head ? (
          <p className="mt-1 border-l-4 border-osan-teal bg-doc-card px-2 py-1 text-xs font-semibold text-osan-teal-deep sm:text-sm">{head}</p>
        ) : (
          <span aria-hidden className="mt-1 block h-1 w-10 bg-osan-teal" />
        )}
        <div className="mt-2 flex min-h-0 flex-1 flex-col sm:mt-4">
          <SlideBody slide={slide} />
        </div>
        <Footer slide={slide} index={index} total={total} />
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

  // 화면 장 목록: PPT와 같이 장 구분을 끼운다
  const pages = useMemo(() => (deck ? withSections(deck.slides) : []), [deck]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (!deck || (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA"))) return;
      if (e.key === "ArrowRight") setPage((p) => Math.min(pages.length - 1, p + 1));
      if (e.key === "ArrowLeft") setPage((p) => Math.max(0, p - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deck, pages.length]);

  const slide = pages[page];

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
              <SlideView slide={slide} index={page} total={pages.length} />
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => setPage((p) => Math.max(0, p - 1))} className="rounded-md border-2 border-navy bg-foam p-2 text-navy" aria-label="이전 장">
                  <ChevronLeft size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(pages.length - 1, p + 1))}
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
                {pages.map((s, i) => (
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
