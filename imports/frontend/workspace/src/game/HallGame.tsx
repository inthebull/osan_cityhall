import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Building2, MessageCircle } from "lucide-react";
import { unlockAudio } from "./audio";
import { HallEngine, type Hud } from "./engine";
import { directory, floorList, type FloorId, type Spot } from "./world";

type Overlay =
  | { kind: "talk"; spot: Spot; page: number }
  | { kind: "floors" }
  | { kind: "pingpong"; phase: "ask" | "result" }
  | { kind: "tool"; hours: number }
  | { kind: "market" }
  | { kind: "roof" }
  | { kind: "minwon"; spot: Spot };

const BARS = [
  { name: "기후환경정책과", score: 78, note: "가로수·낙엽 · 사무분장" },
  { name: "안전정책과", score: 54, note: "배수구 · 보도" },
  { name: "민원여권과", score: 31, note: "접수 창구" },
];

const SHOPS = [
  { name: "행사 준비 체크리스트", blurb: "시민의 날, 월례회, 현수막" },
  { name: "예산 집행 점검표", blurb: "원인행위 전에 확인하는 한 장" },
  { name: "협조 공문 서식", blurb: "주관·협조·근거가 빈칸으로 남음" },
];

const emptyHud: Hud = {
  floorName: "본관 1층",
  prompt: null,
  stamps: [],
  tools: [],
  hint: "1층 안내데스크에서 청사 안내를 받으세요",
  toast: null,
  pingpongs: 0,
};

export function HallGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<HallEngine | null>(null);
  const overlayRef = useRef<Overlay | null>(null);
  const [hud, setHud] = useState<Hud>(emptyHud);
  const [started, setStarted] = useState(false);
  const [hasSave, setHasSave] = useState(false);
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [stick, setStick] = useState({ x: 0, y: 0, on: false });
  const [railOpen, setRailOpen] = useState(true);
  const [railFloor, setRailFloor] = useState<FloorId>("f1");
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
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) {
        event.preventDefault();
      }
      engine.keys.add(event.code);
      if (event.code === "KeyE" && !event.repeat) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const found = directory().find((floor) =>
      floor.id === "ax" ? hud.floorName.startsWith("별관") : hud.floorName === `본관 ${floor.name}`,
    );
    if (found) setRailFloor(found.id);
  }, [hud.floorName]);

  useEffect(() => {
    const apply = () => {
      const wide = window.matchMedia("(min-width: 640px)").matches;
      if (engineRef.current) engineRef.current.insetLeft = started && railOpen ? (wide ? 176 : 144) : 0;
    };
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, [started, railOpen]);

  const advanceRef = useRef(() => {});

  function close() {
    engineRef.current?.unlock();
    setOverlay(null);
  }

  function advance() {
    const current = overlayRef.current;
    if (!current) return;
    if (current.kind === "talk") {
      if (current.page < current.spot.lines.length - 1) {
        setOverlay({ ...current, page: current.page + 1 });
        return;
      }
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
    else if (spot.action === "pingpong") setOverlay({ kind: "pingpong", phase: "ask" });
    else if (spot.action === "tool") setOverlay({ kind: "tool", hours: 4 });
    else if (spot.action === "market") setOverlay({ kind: "market" });
    else if (spot.action === "roof") setOverlay({ kind: "roof" });
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

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-navy-2 text-ink select-none">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />

      <header className={`pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-3 p-3 sm:p-4 ${started && railOpen ? "pl-36 sm:pl-44" : ""}`}>
        <div className="pointer-events-none max-w-[70%] rounded-md border-2 border-navy bg-paper px-3 py-2 shadow-[3px_3px_0_#24344c]">
          <p className="font-display text-lg leading-none text-navy">{hud.floorName}</p>
          <p className="mt-1 text-sm leading-snug text-ink">{started ? hud.hint : "도트로 걷는 오산시청"}</p>
        </div>
        <div className="rounded-md border-2 border-navy bg-paper px-3 py-2 text-right shadow-[3px_3px_0_#24344c]">
          <p className="font-display text-lg leading-none text-navy">{hud.stamps.length}/6</p>
          <p className="text-xs text-ink">도장</p>
        </div>
      </header>

      {started && !railOpen && (
        <button
          type="button"
          onClick={() => setRailOpen(true)}
          className="absolute top-20 left-3 z-40 min-h-11 rounded-md border-2 border-navy bg-paper px-3 font-display text-lg text-navy shadow-[3px_3px_0_#24344c]"
        >
          부서
        </button>
      )}

      {started && railOpen && (
        <aside className="absolute top-0 bottom-0 left-0 z-40 flex w-36 flex-col border-r-2 border-navy bg-paper sm:w-44">
          <div className="flex items-center justify-between gap-1 border-b-2 border-navy px-2 py-2">
            <p className="font-display text-lg leading-none text-navy">바로 묻기</p>
            <button
              type="button"
              onClick={() => setRailOpen(false)}
              className="min-h-11 rounded-sm border-2 border-navy bg-foam px-2 text-sm font-semibold text-navy"
            >
              접기
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1 p-1.5">
            {directory().map((floor) => (
              <button
                key={floor.id}
                type="button"
                onClick={() => setRailFloor(floor.id)}
                className={`min-h-11 rounded-sm border-2 border-navy text-xs font-semibold ${railFloor === floor.id ? "bg-mint text-foam" : "bg-foam text-navy"}`}
              >
                {floor.name}
              </button>
            ))}
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-1.5 pb-3">
            {directory()
              .find((floor) => floor.id === railFloor)
              ?.places.map((place) => (
                <button
                  key={place.id}
                  type="button"
                  onClick={() => jump(railFloor, place.id)}
                  className="min-h-11 rounded-sm border-2 border-navy bg-foam px-2 py-1 text-left text-sm font-semibold leading-tight text-navy"
                >
                  {place.title}
                </button>
              ))}
          </div>
        </aside>
      )}

      {hud.toast && started && (
        <p className="pointer-events-none absolute top-24 left-1/2 z-10 -translate-x-1/2 rounded-md border-2 border-navy bg-mint-2 px-3 py-1.5 text-sm font-semibold text-navy">
          {hud.toast}
        </p>
      )}

      {started && hud.prompt && !overlay && (
        <button
          type="button"
          onClick={() => engineRef.current?.interact()}
          className={`absolute z-20 flex items-center gap-2 rounded-md border-2 border-navy bg-foam px-4 py-2 text-sm font-semibold text-navy shadow-[3px_3px_0_#24344c] bottom-28 md:bottom-8 ${railOpen ? "right-3 left-36 sm:right-auto sm:left-1/2 sm:-translate-x-1/2" : "left-1/2 -translate-x-1/2"}`}
        >
          <MessageCircle size={16} />
          {hud.prompt}
        </button>
      )}

      {started && hud.tools.length > 0 && (
        <ul className="pointer-events-none absolute top-20 right-3 z-10 hidden max-w-56 flex-col gap-1 sm:flex">
          {hud.tools.map((tool) => (
            <li key={tool} className="rounded-sm border-2 border-navy bg-paper px-2 py-1 text-xs text-navy">
              {tool}
            </li>
          ))}
        </ul>
      )}

      {!started && (
        <div className="absolute inset-0 z-30 flex items-end justify-center bg-navy-2/35 p-4 sm:items-center">
          <section className="w-full max-w-md rounded-md border-4 border-navy bg-paper p-5 shadow-[6px_6px_0_#24344c]">
            <p className="text-xs font-semibold tracking-wide text-mint">F4O · 가상 청사</p>
            <h1 className="mt-1 font-display text-4xl leading-tight text-navy">오산시 AI 청사</h1>
            <p className="mt-2 text-sm leading-relaxed text-ink">
              공식 배치도를 따라 본관 1층부터 5층, 별관까지 걷습니다. 안내데스크, 민원 창구, 인수인계, 업무 핑퐁, 도구 상가가 한 판에 있습니다.
            </p>
            <ul className="mt-3 space-y-1 text-sm text-ink">
              <li>왼쪽에서 층을 고른 뒤 부서를 누르면 바로 가서 묻습니다</li>
              <li>방향키 또는 WASD로도 걸어갈 수 있습니다</li>
              <li>엘리베이터로 층 이동 · 3층 붉은 통로로 별관</li>
            </ul>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => start(true)}
                className="flex-1 rounded-md border-2 border-navy bg-mint px-4 py-3 font-display text-xl text-foam"
              >
                새로 입장
              </button>
              {hasSave && (
                <button
                  type="button"
                  onClick={() => start(false)}
                  className="flex-1 rounded-md border-2 border-navy bg-foam px-4 py-3 font-display text-xl text-navy"
                >
                  이어서
                </button>
              )}
            </div>
          </section>
        </div>
      )}

      {overlay && (
        <div className={`absolute inset-x-0 bottom-0 z-30 p-3 sm:p-5 ${railOpen ? "pl-36 sm:pl-44" : ""}`}>
          <section className="mx-auto w-full max-w-xl rounded-md border-4 border-navy bg-paper p-4 shadow-[6px_6px_0_#24344c]">
            {overlay.kind === "talk" && (
              <>
                <h2 className="font-display text-2xl text-navy">{overlay.spot.title}</h2>
                <p className="mt-2 min-h-16 text-sm leading-relaxed">{overlay.spot.lines[overlay.page]}</p>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="text-xs text-navy">
                    {overlay.page + 1}/{overlay.spot.lines.length}
                  </span>
                  <button type="button" onClick={advance} className="rounded-md border-2 border-navy bg-mint px-4 py-2 font-semibold text-foam">
                    {overlay.page < overlay.spot.lines.length - 1 ? "다음" : overlay.spot.action === "portal" ? "닫기" : "알겠어요"}
                  </button>
                  {overlay.spot.action === "portal" && overlay.spot.portal && (
                    <button
                      type="button"
                      onClick={() => travel(overlay.spot.portal as FloorId)}
                      className="rounded-md border-2 border-navy bg-navy px-4 py-2 font-semibold text-foam"
                    >
                      이동
                    </button>
                  )}
                </div>
              </>
            )}

            {overlay.kind === "floors" && (
              <>
                <h2 className="flex items-center gap-2 font-display text-2xl text-navy">
                  <Building2 size={22} />
                  엘리베이터
                </h2>
                <p className="mt-1 text-sm">본관 층을 고르세요. 별관은 3층 연결통로입니다.</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {floorList().map((floor) => (
                    <button
                      key={floor.id}
                      type="button"
                      onClick={() => travel(floor.id)}
                      className="rounded-md border-2 border-navy bg-foam px-3 py-3 text-left font-semibold text-navy"
                    >
                      {floor.name}
                    </button>
                  ))}
                </div>
                <button type="button" onClick={close} className="mt-3 text-sm font-semibold text-navy">
                  내리기
                </button>
              </>
            )}

            {overlay.kind === "minwon" && (
              <>
                <h2 className="font-display text-2xl text-navy">민원여권과</h2>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <article className="rounded-md bg-mint-2 p-3">
                    <p className="text-xs font-semibold text-mint">시민 언어</p>
                    <p className="mt-1 text-sm leading-relaxed">{overlay.spot.lines[0]}</p>
                  </article>
                  <article className="rounded-md bg-paper-2 p-3">
                    <p className="text-xs font-semibold text-navy">공무원 요약</p>
                    <p className="mt-1 text-sm leading-relaxed">{overlay.spot.lines[1]}</p>
                  </article>
                </div>
                <button type="button" onClick={close} className="mt-3 rounded-md border-2 border-navy bg-mint px-4 py-2 font-semibold text-foam">
                  창구 닫기
                </button>
              </>
            )}

            {overlay.kind === "tool" && (
              <>
                <h2 className="font-display text-2xl text-navy">자치행정과</h2>
                <p className="mt-2 text-sm leading-relaxed">
                  11월은 예산 편성 자료, 12월은 연말 정산 안내. 능력치는 사람이 아니라 업무입니다. 법률해석 4 · 복무인사 5 · 협업 4.
                </p>
                <label className="mt-3 block text-sm font-semibold text-navy">
                  초과 시간
                  <input
                    type="number"
                    min={0}
                    max={40}
                    value={overlay.hours}
                    onChange={(event) =>
                      setOverlay({ kind: "tool", hours: Math.max(0, Math.min(40, Number(event.target.value) || 0)) })
                    }
                    className="mt-1 w-full rounded-md border-2 border-navy bg-foam px-3 py-2"
                  />
                </label>
                <p className="mt-2 text-sm">
                  가산 1.5 × 시급 15,000원 ={" "}
                  <strong>{Math.round(overlay.hours * 1.5 * 15000).toLocaleString("ko-KR")}원</strong>
                  <span className="text-navy"> · 권고 초안, 처분 아님</span>
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => engineRef.current?.addTool("초과근무수당 계산기")}
                    className="rounded-md border-2 border-navy bg-mint px-4 py-2 font-semibold text-foam"
                  >
                    책상에 남기기
                  </button>
                  <button type="button" onClick={close} className="rounded-md border-2 border-navy bg-foam px-4 py-2 font-semibold text-navy">
                    나가기
                  </button>
                </div>
              </>
            )}

            {overlay.kind === "pingpong" && (
              <>
                <h2 className="font-display text-2xl text-navy">업무 핑퐁 제로</h2>
                <p className="mt-2 text-sm leading-relaxed">
                  「가로수가 간판을 가리고, 낙엽이 배수구를 막아요.」 점수는 사무분장 40, 과거 사례 25, 의미 유사 20, 대상 일치 10, 조직 관계 5로 계산합니다.
                </p>
                <ul className="mt-3 space-y-2">
                  {BARS.map((bar) => (
                    <li key={bar.name}>
                      <div className="flex items-baseline justify-between text-sm">
                        <span className="font-semibold">{bar.name}</span>
                        <span className="text-navy">{overlay.phase === "result" ? bar.score : "—"}</span>
                      </div>
                      <div className="mt-1 h-3 overflow-hidden rounded-sm border-2 border-navy bg-foam">
                        <div
                          className="h-full bg-mint transition-[width] duration-700 ease-out"
                          style={{ width: overlay.phase === "result" ? `${bar.score}%` : "0%" }}
                        />
                      </div>
                      <p className="text-xs text-navy">{bar.note}</p>
                    </li>
                  ))}
                </ul>
                {overlay.phase === "result" && (
                  <p className="mt-3 text-sm leading-relaxed">
                    주관은 기후환경정책과, 협조는 안전정책과. 1·2위 차이가 10점 이상이라 바로 배정 초안이 나갑니다. 확정은 권한자가 합니다. 봉투가 그 방으로 날아갑니다.
                  </p>
                )}
                <div className="mt-3 flex gap-2">
                  {overlay.phase === "ask" ? (
                    <button
                      type="button"
                      onClick={() => {
                        engineRef.current?.markPingpong();
                        setOverlay({ kind: "pingpong", phase: "result" });
                      }}
                      className="rounded-md border-2 border-navy bg-rose px-4 py-2 font-semibold text-foam"
                    >
                      판정하기
                    </button>
                  ) : (
                    <button type="button" onClick={close} className="rounded-md border-2 border-navy bg-mint px-4 py-2 font-semibold text-foam">
                      회의 끝내기
                    </button>
                  )}
                  <button type="button" onClick={close} className="rounded-md border-2 border-navy bg-foam px-4 py-2 font-semibold text-navy">
                    닫기
                  </button>
                </div>
              </>
            )}

            {overlay.kind === "market" && (
              <>
                <h2 className="font-display text-2xl text-navy">AI 도구 상가</h2>
                <p className="mt-2 text-sm leading-relaxed">
                  발표가 끝나도 흩어지지 않게, 도구와 서식을 가게 카드로 입주시킵니다.
                </p>
                <ul className="mt-3 space-y-2">
                  {SHOPS.map((shop) => {
                    const owned = hud.tools.includes(shop.name);
                    return (
                      <li key={shop.name} className="flex items-center justify-between gap-2 rounded-md bg-paper-2 px-3 py-2">
                        <div>
                          <p className="text-sm font-semibold">{shop.name}</p>
                          <p className="text-xs text-navy">{shop.blurb}</p>
                        </div>
                        <button
                          type="button"
                          disabled={owned}
                          onClick={() => engineRef.current?.addTool(shop.name)}
                          className="shrink-0 rounded-md border-2 border-navy bg-foam px-3 py-2 text-sm font-semibold text-navy disabled:opacity-50"
                        >
                          {owned ? "입주" : "받기"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <button type="button" onClick={close} className="mt-3 rounded-md border-2 border-navy bg-mint px-4 py-2 font-semibold text-foam">
                  상가 나가기
                </button>
              </>
            )}

            {overlay.kind === "roof" && (
              <>
                <h2 className="font-display text-2xl text-navy">옥상 상황판</h2>
                <p className="mt-2 text-sm leading-relaxed">
                  도장 {hud.stamps.length}/6 · 핑퐁 판정 {hud.pingpongs}건 · 남은 도구 {hud.tools.length}개. 핑퐁이 잦은 구간은 가로수·배수구 경계입니다.
                </p>
                <ul className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  {["안내데스크", "민원여권과", "자치행정과", "업무 핑퐁", "도구 상가", "옥상 상황판"].map((name, index) => {
                    const ids = ["guide", "minwon", "jachi", "ping", "market", "roof"];
                    const on = hud.stamps.includes(ids[index] ?? "");
                    return (
                      <li key={name} className={`rounded-md border-2 px-2 py-2 ${on ? "border-mint bg-mint-2" : "border-line bg-foam"}`}>
                        {on ? "받음" : "비어 있음"} · {name}
                      </li>
                    );
                  })}
                </ul>
                <button type="button" onClick={close} className="mt-3 rounded-md border-2 border-navy bg-mint px-4 py-2 font-semibold text-foam">
                  정원으로
                </button>
              </>
            )}
          </section>
        </div>
      )}

      {started && (
        <div className={`absolute right-0 bottom-0 z-20 flex items-end justify-between p-3 md:hidden ${railOpen ? "left-36 sm:left-44" : "left-0"}`}>
          <div
            className="relative h-28 w-28 rounded-full border-2 border-navy bg-paper/80"
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
              className="absolute h-10 w-10 rounded-full border-2 border-navy bg-mint"
              style={{
                left: `calc(50% - 20px + ${stick.x * 32}px)`,
                top: `calc(50% - 20px + ${stick.y * 32}px)`,
              }}
            />
          </div>
          <button
            type="button"
            onClick={() => engineRef.current?.interact()}
            className="h-16 w-16 rounded-full border-2 border-navy bg-foam font-display text-xl text-navy"
          >
            말
          </button>
        </div>
      )}
    </main>
  );
}
