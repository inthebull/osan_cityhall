"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  ArrowUpDown,
  CircleCheck,
  FileText,
  Minus,
  MousePointerClick,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Shuffle,
  Wrench,
  X,
} from "lucide-react";
import { unlockAudio } from "./audio";
import { HallEngine, type Hud } from "./engine";
import { directory, floorList, QUEST, type FloorId, type RoomKind, type Spot } from "./world";
import { DEPT_NAMES } from "@/lib/pingpong/demo";
import { LOBBY_EXAMPLES, judgeLobby, type LobbyResult } from "@/lib/pingpong/lobby";

type Overlay =
  | { kind: "talk"; spot: Spot; page: number }
  | { kind: "floors" }
  | { kind: "lobby"; text: string; result: LobbyResult | null }
  | { kind: "minwon"; spot: Spot };

const KIND_LABEL: Record<RoomKind, string> = {
  ai: "AI 주무관",
  feature: "AI 주무관",
  planned: "채용 예정",
  place: "",
  utility: "",
  void: "",
  facility: "",
};

const KIND_BADGE: Record<RoomKind, string> = {
  ai: "bg-osan-teal-tint text-osan-teal-deep",
  feature: "bg-osan-teal-tint text-osan-teal-deep",
  planned: "bg-surface text-slate-muted",
  place: "bg-surface text-slate-muted",
  utility: "bg-surface text-slate-muted",
  void: "bg-surface text-slate-muted",
  facility: "bg-surface text-slate-muted",
};

const KIND_DOT: Record<RoomKind, string> = {
  ai: "bg-osan-teal",
  feature: "bg-osan-teal",
  planned: "bg-[#C3CAD6]",
  place: "bg-osan-navy/40",
  utility: "bg-[#C3CAD6]",
  void: "bg-[#C3CAD6]",
  facility: "bg-[#C3CAD6]",
};

const DEPT_LABEL: Record<string, string> = { ...DEPT_NAMES, "D-OTHER": "기타 시 부서" };

const emptyHud: Hud = {
  floorId: "f1",
  floorName: "본관 1층",
  prompt: null,
  stamps: [],
  tools: [],
  hint: QUEST[0]?.hint ?? "",
  toast: null,
  pingpongs: 0,
};

const btnPrimary =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-osan-navy px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1d33a8] disabled:opacity-50";
const btnSecondary =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-hairline bg-white px-4 py-2.5 text-sm font-semibold text-slate-ink transition hover:bg-surface disabled:opacity-50";

function Badge({ children, tone }: { children: ReactNode; tone: "draft" | "demo" | RoomKind }) {
  const cls =
    tone === "draft"
      ? "bg-osan-teal-deep text-white"
      : tone === "demo"
        ? "border border-[#C9843A] bg-warn-tint text-warn-ink"
        : KIND_BADGE[tone];
  return <span className={`inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${cls}`}>{children}</span>;
}

export function HallGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<HallEngine | null>(null);
  const overlayRef = useRef<Overlay | null>(null);
  const pressRef = useRef<{ x: number; y: number } | null>(null);
  const [hud, setHud] = useState<Hud>(emptyHud);
  const [started, setStarted] = useState(false);
  const [hasSave, setHasSave] = useState(false);
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [stick, setStick] = useState({ x: 0, y: 0, on: false });
  const [railOpen, setRailOpen] = useState(true);
  const [wide, setWide] = useState(true);
  const [railFloor, setRailFloor] = useState<FloorId>("f1");
  const [pointer, setPointer] = useState(false);
  overlayRef.current = overlay;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new HallEngine(canvas, {
      onHud: (next) => setHud(next),
      onSpot: (spot) => openSpot(spot),
    });
    engineRef.current = engine;
    setHasSave(engine.hasSave);
    engine.start();

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) {
        event.preventDefault();
      }
      engine.keys.add(event.code);
      if (event.code === "Escape" && overlayRef.current) closeRef.current();
      if ((event.code === "KeyE" || event.code === "Enter") && !event.repeat) {
        if (overlayRef.current) advanceRef.current();
        else engine.interact();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => engine.keys.delete(event.code);
    const onBlur = () => engine.keys.clear();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      engine.stop();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
    // openSpot is stable enough via engineRef; listener is bound once.
  }, []);

  useEffect(() => {
    setRailFloor(hud.floorId);
  }, [hud.floorId]);

  useEffect(() => {
    const apply = () => {
      const isWide = window.matchMedia("(min-width: 768px)").matches;
      setWide(isWide);
      const engine = engineRef.current;
      if (!engine) return;
      engine.insetLeft = started && railOpen && isWide ? 296 : 0;
      engine.insetRight = overlay && isWide ? 432 : 0;
    };
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, [started, railOpen, overlay]);

  useEffect(() => {
    if (!wide) setRailOpen(false);
  }, [wide]);

  const advanceRef = useRef(() => {});
  const closeRef = useRef(() => {});

  function close() {
    engineRef.current?.unlock();
    setOverlay(null);
  }
  closeRef.current = close;

  function advance() {
    const current = overlayRef.current;
    if (!current) return;
    if (current.kind === "talk" && current.page < current.spot.lines.length - 1) {
      setOverlay({ ...current, page: current.page + 1 });
      return;
    }
    close();
  }
  advanceRef.current = advance;

  function openSpot(spot: Spot) {
    const engine = engineRef.current;
    if (!engine) return;
    engine.lock();
    if (spot.stamp && spot.action !== "pingpong") engine.grant(spot.stamp);
    if (spot.action === "floors") setOverlay({ kind: "floors" });
    else if (spot.action === "pingpong") setOverlay({ kind: "lobby", text: "", result: null });
    else if (spot.action === "minwon") setOverlay({ kind: "minwon", spot });
    else setOverlay({ kind: "talk", spot, page: 0 });
  }

  function start(fresh: boolean) {
    unlockAudio();
    engineRef.current?.begin(fresh);
    setStarted(true);
    setHasSave(!fresh || hasSave);
  }

  function travel(id: FloorId) {
    engineRef.current?.go(id);
    close();
  }

  function jump(floorId: FloorId, spotId: string) {
    engineRef.current?.unlock();
    setOverlay(null);
    engineRef.current?.visit(floorId, spotId);
    if (!wide) setRailOpen(false);
  }

  function local(event: { clientX: number; clientY: number; currentTarget: Element }) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function aim(event: ReactPointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    let x = event.clientX - (rect.left + rect.width / 2);
    let y = event.clientY - (rect.top + rect.height / 2);
    const len = Math.hypot(x, y) || 1;
    const max = 36;
    if (len > max) {
      x = (x / len) * max;
      y = (y / len) * max;
    }
    const nx = x / max;
    const ny = y / max;
    setStick({ x: nx, y: ny, on: true });
    if (engineRef.current) engineRef.current.joy = { x: nx, y: ny };
  }

  const progress = Math.round((hud.stamps.length / QUEST.length) * 100);
  const places = directory().find((floor) => floor.id === railFloor)?.places ?? [];

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-[#EEF1F6] font-sans text-slate-ink select-none">
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 h-full w-full touch-none ${pointer ? "cursor-pointer" : "cursor-default"}`}
        onPointerDown={(event) => {
          pressRef.current = local(event);
        }}
        onPointerMove={(event) => {
          const p = local(event);
          setPointer(Boolean(engineRef.current?.pointerMove(p.x, p.y)));
        }}
        onPointerUp={(event) => {
          const p = local(event);
          const down = pressRef.current;
          pressRef.current = null;
          if (!down || Math.hypot(p.x - down.x, p.y - down.y) > 8) return;
          if (overlayRef.current) close();
          engineRef.current?.pointerClick(p.x, p.y);
        }}
        onWheel={(event) => engineRef.current?.zoomBy(event.deltaY > 0 ? 0.9 : 1.1)}
      />

      {/* 위쪽 표시줄 */}
      <header
        className={`pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-3 p-3 md:p-4 ${started && railOpen && wide ? "md:pl-[312px]" : ""}`}
      >
        <div className="pointer-events-auto flex items-center gap-2">
          {started && (!railOpen || !wide) && (
            <button
              type="button"
              onClick={() => setRailOpen(true)}
              aria-label="부서 목록 열기"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-hairline bg-white/90 text-slate-ink shadow-sm backdrop-blur"
            >
              <PanelLeftOpen size={18} />
            </button>
          )}
          <div className="rounded-xl border border-hairline bg-white/90 px-3 py-2 shadow-sm backdrop-blur">
            <p className="text-[11px] font-medium text-slate-muted">오산시 AI 청사</p>
            <p className="text-base leading-tight font-bold text-osan-navy">{hud.floorName}</p>
          </div>
        </div>
        {started && (
          <div className="pointer-events-auto flex items-center gap-1 rounded-xl border border-hairline bg-white/90 p-1 shadow-sm backdrop-blur">
            <button type="button" aria-label="축소" onClick={() => engineRef.current?.zoomBy(0.85)} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-surface">
              <Minus size={16} />
            </button>
            <button type="button" aria-label="확대" onClick={() => engineRef.current?.zoomBy(1.18)} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-surface">
              <Plus size={16} />
            </button>
          </div>
        )}
      </header>

      {/* 오른쪽 층 버튼 */}
      {started && wide && !overlay && (
        <nav aria-label="층 이동" className="absolute top-1/2 right-4 z-10 flex -translate-y-1/2 flex-col gap-1 rounded-2xl border border-hairline bg-white/90 p-1.5 shadow-sm backdrop-blur">
          {[...floorList()].reverse().map((floor) => (
            <button
              key={floor.id}
              type="button"
              onClick={() => engineRef.current?.go(floor.id)}
              className={`h-10 w-12 rounded-xl text-sm font-semibold transition ${hud.floorId === floor.id ? "bg-osan-navy text-white" : "text-slate-ink hover:bg-surface"}`}
            >
              {floor.name.replace("본관 ", "").replace("층", "F")}
            </button>
          ))}
          <div className="mx-2 my-0.5 h-px bg-hairline" />
          <button
            type="button"
            onClick={() => engineRef.current?.go("ax")}
            className={`h-10 w-12 rounded-xl text-xs font-semibold transition ${hud.floorId === "ax" ? "bg-osan-navy text-white" : "text-slate-ink hover:bg-surface"}`}
          >
            별관
          </button>
        </nav>
      )}

      {/* 왼쪽 부서 목록 */}
      {started && railOpen && (
        <aside className="absolute top-0 bottom-0 left-0 z-40 flex w-[86%] max-w-[296px] flex-col border-r border-hairline bg-white/95 shadow-lg backdrop-blur md:top-3 md:bottom-3 md:left-3 md:w-[284px] md:rounded-2xl md:border md:shadow-md">
          <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-osan-navy">
                <span className="h-3 w-3 rotate-45 rounded-[3px] bg-osan-teal" />
              </span>
              <div>
                <p className="text-sm leading-tight font-bold text-osan-navy">오산시 AI 청사</p>
                <p className="text-[11px] text-slate-muted">F4O 시정연구모임 · 연구 시제품</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setRailOpen(false)}
              aria-label="부서 목록 접기"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-muted hover:bg-surface"
            >
              <PanelLeftClose size={18} />
            </button>
          </div>

          <div className="px-4">
            <p className="mb-1.5 text-[11px] font-semibold text-slate-muted">층 선택</p>
            <div className="grid grid-cols-6 gap-1 rounded-xl bg-surface p-1">
              {directory().map((floor) => (
                <button
                  key={floor.id}
                  type="button"
                  onClick={() => setRailFloor(floor.id)}
                  className={`relative h-8 rounded-lg text-xs font-semibold transition ${railFloor === floor.id ? "bg-white text-osan-navy shadow-sm" : "text-slate-muted hover:text-slate-ink"}`}
                >
                  {floor.name.replace("층", "F")}
                  {hud.floorId === floor.id && <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-osan-teal" />}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-3">
            {places.map((place) => (
              <button
                key={place.id}
                type="button"
                onClick={() => jump(railFloor, place.id)}
                className="group flex min-h-11 items-center gap-2.5 rounded-lg px-2 py-2 text-left transition hover:bg-surface"
              >
                <span className={`h-2 w-2 shrink-0 rounded-full ${KIND_DOT[place.kind]}`} />
                <span className={`flex-1 text-sm leading-tight ${place.kind === "planned" ? "text-slate-muted" : "font-semibold text-slate-ink"}`}>
                  {place.title}
                </span>
                {KIND_LABEL[place.kind] && <Badge tone={place.kind}>{KIND_LABEL[place.kind]}</Badge>}
              </button>
            ))}
          </div>

          <div className="border-t border-hairline px-4 py-3">
            <div className="flex items-baseline justify-between">
              <p className="text-xs font-semibold text-slate-ink">청사 둘러보기</p>
              <p className="text-xs text-slate-muted">
                {hud.stamps.length} / {QUEST.length}
              </p>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface">
              <div className="h-full rounded-full bg-osan-teal transition-[width] duration-500" style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-muted">{hud.hint}</p>
          </div>
        </aside>
      )}

      {/* 범례와 조작 안내 */}
      {started && wide && (
        <div className={`pointer-events-none absolute bottom-4 z-10 flex flex-col gap-1.5 ${railOpen ? "left-[312px]" : "left-4"}`}>
          <div className="flex items-center gap-3 rounded-xl border border-hairline bg-white/90 px-3 py-2 text-[11px] text-slate-muted shadow-sm backdrop-blur">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-osan-teal" />AI 주무관 근무</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-osan-navy/40" />기타 공간</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#C3CAD6]" />채용 예정</span>
          </div>
          <p className="flex items-center gap-1.5 px-1 text-[11px] text-slate-muted">
            <MousePointerClick size={12} /> 클릭하면 걸어갑니다 · 방향키/WASD 이동 · E 대화 · 휠 확대
          </p>
        </div>
      )}

      {hud.toast && started && (
        <p className="pointer-events-none absolute top-20 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full border border-hairline bg-white px-4 py-2 text-sm font-semibold text-slate-ink shadow-lg">
          <CircleCheck size={16} className="text-osan-teal" />
          {hud.toast}
        </p>
      )}

      {started && hud.prompt && !overlay && (
        <button
          type="button"
          onClick={() => engineRef.current?.interact()}
          className="absolute bottom-36 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2.5 rounded-full border border-hairline bg-white py-1.5 pr-4 pl-1.5 text-sm font-semibold text-slate-ink shadow-lg transition hover:border-osan-teal md:bottom-24"
        >
          <kbd className="flex h-7 min-w-7 items-center justify-center rounded-full bg-osan-navy px-2 font-sans text-xs font-bold text-white">E</kbd>
          {hud.prompt}
        </button>
      )}

      {/* 시작 화면 */}
      {!started && (
        <div className="absolute inset-0 z-50 flex items-end justify-center bg-[#EEF1F6]/55 p-4 backdrop-blur-[2px] sm:items-center">
          <section className="w-full max-w-lg rounded-2xl border border-hairline bg-white p-6 shadow-xl sm:p-7">
            <p className="text-xs font-semibold text-osan-teal-deep">2026 오산시 시정연구모임 F4O · 연구 시제품</p>
            <h1 className="mt-2 text-3xl leading-tight font-bold tracking-tight text-osan-navy">오산시 AI 청사</h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-muted">
              층별 안내도를 따라 옮긴 오산시청 안을 걸으며, 불 켜진 방의 AI 주무관에게 업무를 묻습니다. 담당자가 바뀌어도 업무 지식과 도구는 청사에 남습니다.
            </p>
            <ul className="mt-5 grid gap-2">
              {[
                { icon: <FileText size={16} />, title: "AI 인수인계", body: "업무 카드·달력·질의응답이 방에 쌓입니다" },
                { icon: <Shuffle size={16} />, title: "AI 업무배분", body: "1층 로비에서 업무를 물으면 담당 부서를 판정합니다" },
                { icon: <Wrench size={16} />, title: "업무도구 축적", body: "AI 주무관마다 만든 도구가 업무에 남습니다" },
              ].map((item) => (
                <li key={item.title} className="flex items-start gap-3 rounded-xl bg-surface px-3 py-2.5">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-osan-navy shadow-sm">{item.icon}</span>
                  <span>
                    <span className="block text-sm font-semibold text-slate-ink">{item.title}</span>
                    <span className="block text-xs text-slate-muted">{item.body}</span>
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <button type="button" onClick={() => start(true)} className={`${btnPrimary} flex-1 py-3 text-base`}>
                청사 입장
              </button>
              {hasSave && (
                <button type="button" onClick={() => start(false)} className={`${btnSecondary} flex-1 py-3 text-base`}>
                  이어서 보기
                </button>
              )}
            </div>
            <p className="mt-3 text-center text-[11px] text-slate-muted">공개 자료와 가상 사례만 씁니다 · AI 출력은 모두 초안이며 최종 판단은 담당자</p>
          </section>
        </div>
      )}

      {/* 상호작용 패널: 넓은 화면은 오른쪽 서랍, 좁은 화면은 아래 시트 */}
      {overlay && (
        <div className="absolute inset-x-0 bottom-0 z-40 p-3 md:inset-x-auto md:top-3 md:right-3 md:bottom-3 md:w-[416px] md:p-0">
          <section className="relative max-h-[70dvh] overflow-y-auto rounded-2xl border border-hairline bg-white p-5 shadow-xl md:h-full md:max-h-none">
            <button type="button" onClick={close} aria-label="닫기" className="absolute top-3 right-3 flex h-9 w-9 items-center justify-center rounded-lg text-slate-muted hover:bg-surface">
              <X size={18} />
            </button>

            {overlay.kind === "talk" && (
              <>
                <div className="flex items-center gap-2 pr-10">
                  <h2 className="text-lg font-bold text-osan-navy">{overlay.spot.title}</h2>
                  {KIND_LABEL[overlay.spot.kind] && <Badge tone={overlay.spot.kind}>{KIND_LABEL[overlay.spot.kind]}</Badge>}
                </div>
                <p className="mt-3 min-h-16 rounded-xl bg-surface p-4 text-sm leading-relaxed">{overlay.spot.lines[overlay.page]}</p>
                <div className="mt-4 flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-muted">
                    {overlay.page + 1} / {overlay.spot.lines.length}
                  </span>
                  <div className="flex gap-2">
                    {overlay.spot.action === "portal" && overlay.spot.portal && (
                      <button type="button" onClick={() => travel(overlay.spot.portal as FloorId)} className={btnPrimary}>
                        이동하기
                      </button>
                    )}
                    <button type="button" onClick={advance} className={overlay.spot.action === "portal" ? btnSecondary : btnPrimary}>
                      {overlay.page < overlay.spot.lines.length - 1 ? "다음" : overlay.spot.action === "portal" ? "닫기" : "확인"}
                    </button>
                  </div>
                </div>
              </>
            )}

            {overlay.kind === "floors" && (
              <>
                <h2 className="flex items-center gap-2 pr-10 text-lg font-bold text-osan-navy">
                  <ArrowUpDown size={18} />
                  엘리베이터
                </h2>
                <p className="mt-1 text-sm text-slate-muted">본관 층을 고르세요. 별관은 3층 연결통로로 갑니다.</p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {floorList().map((floor) => (
                    <button
                      key={floor.id}
                      type="button"
                      onClick={() => travel(floor.id)}
                      className={`rounded-xl border px-3 py-3 text-left text-sm font-semibold transition ${hud.floorId === floor.id ? "border-osan-navy bg-[#EBEEF9] text-osan-navy" : "border-hairline bg-white text-slate-ink hover:bg-surface"}`}
                    >
                      {floor.name}
                    </button>
                  ))}
                </div>
              </>
            )}

            {overlay.kind === "minwon" && (
              <>
                <div className="flex items-center gap-2 pr-10">
                  <h2 className="text-lg font-bold text-osan-navy">민원여권과</h2>
                  <Badge tone="draft">AI 초안 · 최종 판단은 담당자</Badge>
                </div>
                <div className="mt-4 grid gap-2">
                  <article className="rounded-xl border-l-4 border-osan-teal bg-osan-teal-tint p-3">
                    <p className="text-xs font-semibold text-osan-teal-deep">시민 언어</p>
                    <p className="mt-1 text-sm leading-relaxed">{overlay.spot.lines[0]}</p>
                  </article>
                  <article className="rounded-xl border-l-4 border-osan-navy bg-surface p-3">
                    <p className="text-xs font-semibold text-osan-navy">공무원 요약</p>
                    <p className="mt-1 text-sm leading-relaxed">{overlay.spot.lines[1]}</p>
                  </article>
                </div>
                <button type="button" onClick={close} className={`${btnPrimary} mt-4`}>
                  창구 닫기
                </button>
              </>
            )}

            {overlay.kind === "lobby" && (
              <>
                <div className="flex flex-wrap items-center gap-2 pr-10">
                  <h2 className="text-lg font-bold text-osan-navy">1층 로비 · AI 업무 안내</h2>
                  <Badge tone="demo">시연용</Badge>
                </div>
                <p className="mt-1 text-sm text-slate-muted">어떤 업무로 오셨는지 적어 주시면 담당 부서를 판정해 안내합니다.</p>
                <form
                  className="mt-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const text = overlay.text.trim();
                    if (!text) return;
                    const result = judgeLobby(text);
                    engineRef.current?.markPingpong(result.decision.kind === "assign" ? result.decision.lead.dept_id : undefined);
                    setOverlay({ kind: "lobby", text: overlay.text, result });
                  }}
                >
                  <textarea
                    value={overlay.text}
                    onChange={(event) => setOverlay({ kind: "lobby", text: event.target.value, result: null })}
                    rows={3}
                    placeholder="예) 어머니 기초연금을 신청하려는데, 결정은 어디서 하나요?"
                    className="w-full resize-none rounded-xl border border-hairline bg-white px-3 py-2.5 text-sm outline-none focus:border-osan-teal focus:ring-2 focus:ring-osan-teal-tint"
                  />
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {LOBBY_EXAMPLES.map((example) => (
                      <button
                        key={example}
                        type="button"
                        onClick={() => setOverlay({ kind: "lobby", text: example, result: null })}
                        className="rounded-full border border-hairline bg-surface px-2.5 py-1 text-left text-xs text-slate-ink hover:border-osan-teal"
                      >
                        {example}
                      </button>
                    ))}
                  </div>
                  <button type="submit" disabled={!overlay.text.trim()} className={`${btnPrimary} mt-3 w-full`}>
                    담당 부서 판정
                  </button>
                </form>

                {overlay.result &&
                  (() => {
                    const { decision, candidates } = overlay.result;
                    const notes = Object.fromEntries(candidates.map((c) => [c.dept_id, c.note]));
                    return (
                      <div className="mt-4 border-t border-hairline pt-4">
                        {decision.ranked.length > 0 && (
                          <>
                            <p className="text-xs text-slate-muted">
                              점수는 AI가 아니라 코드가 사무분장 40, 과거 사례 25, 의미 유사 20, 대상 일치 10, 조직 관계 5로 계산합니다.
                            </p>
                            <ul className="mt-3 space-y-3">
                              {decision.ranked.map((c) => (
                                <li key={c.dept_id}>
                                  <div className="flex items-baseline justify-between text-sm">
                                    <span className="font-semibold">{DEPT_LABEL[c.dept_id] ?? c.dept_id}</span>
                                    <span className="font-semibold text-osan-navy tabular-nums">{c.score}</span>
                                  </div>
                                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface">
                                    <div className="h-full rounded-full bg-osan-teal transition-[width] duration-700 ease-out" style={{ width: `${c.score}%` }} />
                                  </div>
                                  <p className="mt-1 text-xs text-slate-muted">
                                    {notes[c.dept_id]}
                                    {` · 사무분장 ${Math.round(c.breakdown.duty)} · 사례 ${Math.round(c.breakdown.case)} · 유사 ${Math.round(c.breakdown.semantic)} · 대상 ${Math.round(c.breakdown.target)} · 조직 ${Math.round(c.breakdown.org)}`}
                                    {!c.hasDirectEvidence && " · 직접 근거 없음"}
                                  </p>
                                </li>
                              ))}
                            </ul>
                          </>
                        )}
                        <div className="mt-4 rounded-xl border-l-4 border-osan-teal bg-osan-teal-tint p-3 text-sm leading-relaxed">
                          <Badge tone="draft">AI 초안 · 최종 판단은 담당자</Badge>
                          <p className="mt-1.5">
                            {decision.kind === "assign"
                              ? `${DEPT_LABEL[decision.lead.dept_id]}에서 처리하는 업무로 보입니다. 1·2위 차이가 10점 이상이고 직접 근거가 있습니다. 확정은 담당자가 합니다.`
                              : decision.reason === "close_scores"
                                ? "두 부서가 함께 걸려 있습니다. 1·2위 점수 차이가 10점 미만이라 AI가 정하지 않고 담당자 검토로 넘깁니다."
                                : decision.reason === "no_candidates"
                                  ? "담당 부서를 찾을 단서가 없습니다. 업무 내용을 조금 더 적어 주시거나 안내데스크 직원에게 문의해 주세요."
                                  : "직접 근거가 확인되지 않았습니다. 근거를 보강한 뒤 다시 판정합니다."}
                          </p>
                        </div>
                      </div>
                    );
                  })()}
              </>
            )}
          </section>
        </div>
      )}

      {/* 모바일 조작 */}
      {started && !overlay && (
        <div className="absolute right-0 bottom-0 left-0 z-20 flex items-end justify-between p-4 md:hidden">
          <div
            className="relative h-28 w-28 rounded-full border border-hairline bg-white/80 shadow-sm backdrop-blur"
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              aim(event);
            }}
            onPointerMove={(event) => {
              if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
              aim(event);
            }}
            onPointerUp={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
              setStick({ x: 0, y: 0, on: false });
              if (engineRef.current) engineRef.current.joy = { x: 0, y: 0 };
            }}
          >
            <span
              className={`absolute h-11 w-11 rounded-full shadow-md transition-colors ${stick.on ? "bg-osan-navy" : "bg-osan-navy/80"}`}
              style={{
                left: `calc(50% - 22px + ${stick.x * 32}px)`,
                top: `calc(50% - 22px + ${stick.y * 32}px)`,
              }}
            />
          </div>
          <button
            type="button"
            onClick={() => engineRef.current?.interact()}
            className="h-16 w-16 rounded-full border border-hairline bg-white text-sm font-bold text-osan-navy shadow-md"
          >
            대화
          </button>
        </div>
      )}
    </main>
  );
}
