"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { FileText, Lock, MessageCircle, Mic, Printer, RotateCcw, Send, Users, Volume2, VolumeX } from "lucide-react";
import type { Officer, OfficerMode, Scenario } from "@/lib/officers/officer";
import { Citations, type Citation } from "./Citations";
import { useDictation, useSpeech } from "./voice";

export type DeskProfile = Officer & {
  dept_name: string;
  seats: { seat_id: string; label: string; tasks: string[] }[];
  docs: { doc_id: string; title: string; pages: number; source_url: string }[];
};

type Res = {
  found: boolean;
  answer?: string;
  title?: string;
  items?: { text: string; cite_ids: string[]; verified: boolean }[];
  citizen?: string;
  done?: boolean;
  good?: string;
  improve?: string;
  citations: Citation[];
  locked?: boolean;
  error?: string;
};
type Turn = { role: "user" | "assistant"; text: string; res?: Res };

const MODE_ICON: Record<OfficerMode, ReactNode> = {
  ask: <MessageCircle size={16} />,
  notice: <FileText size={16} />,
  roleplay: <Users size={16} />,
};

async function call(officerId: string, body: object): Promise<Res> {
  try {
    const r = await fetch(`/api/officers/${officerId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    return r.ok ? j : { found: false, citations: [], error: j.error ?? "요청을 처리하지 못했습니다." };
  } catch {
    return { found: false, citations: [], error: "연결이 끊겼습니다. 다시 시도해 주세요." };
  }
}

// AI 주무관 한 명의 자리. 업무 묻기·안내문 만들기·응대 연습 세 가지로 소통하고, 모든 답에 근거를 붙인다.
export function OfficerDesk({ profile }: { profile: DeskProfile }) {
  const [mode, setMode] = useState<OfficerMode>("ask");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(false);
  const [retry, setRetry] = useState<(() => void) | null>(null);

  const [askTurns, setAskTurns] = useState<Turn[]>([]);
  const [notice, setNotice] = useState<{ situation: string; res: Res } | null>(null);
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [play, setPlay] = useState<Turn[]>([]);

  const speech = useSpeech();
  const dictation = useDictation(setInput);

  async function run(body: object, then: (res: Res) => void, again: () => void) {
    setBusy(true);
    const res = await call(profile.officer_id, body);
    setBusy(false);
    setLocked(Boolean(res.locked));
    setRetry(res.locked ? () => again : null);
    then(res);
  }

  function ask(q: string, prev: Turn[]) {
    const turns: Turn[] = [...prev, { role: "user", text: q }];
    setAskTurns(turns);
    const history = turns.filter((t) => !t.res?.error && !t.res?.locked).map(({ role, text }) => ({ role, text }));
    void run(
      { mode: "ask", turns: history.slice(-9) },
      (res) => {
        setAskTurns([...turns, { role: "assistant", text: res.answer ?? "", res }]);
        if (!res.error && !res.locked) speech.say(res.answer ?? "");
      },
      () => ask(q, prev),
    );
  }

  function makeNotice(situation: string) {
    setNotice(null);
    void run(
      { mode: "notice", turns: [{ role: "user", text: situation }] },
      (res) => setNotice({ situation, res }),
      () => makeNotice(situation),
    );
  }

  function startPlay(s: Scenario) {
    setScenario(s);
    setPlay([{ role: "assistant", text: s.opening }]);
    speech.say(s.opening);
  }

  function reply(text: string, prev: Turn[]) {
    const turns: Turn[] = [...prev, { role: "user", text }];
    setPlay(turns);
    void run(
      { mode: "roleplay", scenario_id: scenario?.scenario_id, turns: turns.filter((t) => !t.res?.error && !t.res?.locked).map(({ role, text }) => ({ role, text })).slice(-15) },
      (res) => {
        setPlay([...turns, { role: "assistant", text: res.citizen ?? "", res }]);
        if (!res.error && !res.locked) speech.say(res.citizen ?? "");
      },
      () => reply(text, prev),
    );
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const q = input.trim();
    if (!q || busy) return;
    setInput("");
    if (mode === "ask") ask(q, askTurns);
    else if (mode === "notice") makeNotice(q);
    else if (scenario) reply(q, play);
  }

  const m = profile.modes[mode];
  const playDone = play.some((t) => t.res?.done);
  const canType = mode !== "roleplay" || (scenario !== null && !playDone);

  return (
    <div className="-mx-4 -my-6 min-h-[calc(100vh-49px)] bg-paper px-4 py-6 text-ink">
      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="order-2 min-w-0 space-y-3 print:hidden lg:order-1">
          <section className="rounded-lg border-2 border-navy bg-foam p-4">
            <div className="flex items-center gap-3">
              <div className="grid size-14 shrink-0 place-items-center rounded-full border-2 border-navy bg-mint font-display text-2xl text-foam" aria-hidden>
                여
              </div>
              <div>
                <h1 className="font-display text-2xl leading-tight text-navy">{profile.name}</h1>
                <p className="text-xs">{profile.title}</p>
              </div>
            </div>
            <p className="mt-3 text-sm leading-relaxed">{profile.intro}</p>
            <span className="mt-3 inline-block rounded-sm border-2 border-navy bg-paper-2 px-2 text-xs font-semibold text-navy">
              AI 초안 · 최종 판단은 담당자
            </span>
            <a href={`/handover?dept=${profile.dept_id}`} className="mt-2 block text-xs font-semibold text-mint underline">
              이 업무 인수인계 자료 보기
            </a>
          </section>

          <details className="rounded-lg border border-line bg-foam p-3 text-sm" open>
            <summary className="font-semibold text-navy">맡은 업무 ({profile.seats.length}자리)</summary>
            <ul className="mt-2 space-y-2 text-xs">
              {profile.seats.map((s) => (
                <li key={s.seat_id}>
                  <p className="font-semibold">{s.label}</p>
                  <p className="text-ink/80">{s.tasks.join(", ")}</p>
                </li>
              ))}
            </ul>
          </details>

          <details className="rounded-lg border border-line bg-foam p-3 text-sm">
            <summary className="font-semibold text-navy">근거로 삼는 자료 ({profile.docs.length}건)</summary>
            <ul className="mt-2 space-y-1 text-xs">
              {profile.docs.map((d) => (
                <li key={d.doc_id}>
                  <a href={d.source_url} target="_blank" rel="noreferrer" className="underline">
                    {d.title}
                  </a>{" "}
                  <span className="text-ink/60">{d.pages}쪽</span>
                </li>
              ))}
            </ul>
          </details>
        </aside>

        <section className="order-1 flex min-h-[560px] min-w-0 flex-col rounded-lg border-2 border-navy bg-foam lg:order-2">
          <div className="flex flex-wrap items-center gap-1 border-b-2 border-navy p-2 print:hidden" role="tablist">
            {(Object.keys(profile.modes) as OfficerMode[]).map((k) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={mode === k}
                onClick={() => setMode(k)}
                className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-semibold ${mode === k ? "bg-navy text-foam" : "text-navy hover:bg-paper-2"}`}
              >
                {MODE_ICON[k]}
                {profile.modes[k].label}
              </button>
            ))}
            {speech.supported && (
              <button
                type="button"
                onClick={speech.toggle}
                className="ml-auto flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-semibold text-navy hover:bg-paper-2"
                aria-pressed={speech.on}
              >
                {speech.on ? <Volume2 size={16} /> : <VolumeX size={16} />}
                {speech.on ? "소리로 듣는 중" : "소리로 듣기"}
              </button>
            )}
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            <p className="text-sm text-ink/80 print:hidden">{m.hint}</p>

            {mode === "ask" && (
              <>
                {askTurns.length === 0 && <Samples items={m.samples} onPick={(q) => ask(q, askTurns)} disabled={busy} />}
                {askTurns.map((t, i) =>
                  t.role === "user" ? (
                    <Bubble key={i} me>
                      {t.text}
                    </Bubble>
                  ) : (
                    <Answer key={i} res={t.res!} />
                  ),
                )}
              </>
            )}

            {mode === "notice" && (
              <>
                {!notice && !busy && <Samples items={m.samples} onPick={makeNotice} disabled={busy} />}
                {notice && (
                  <>
                    <Bubble me>{notice.situation}</Bubble>
                    {notice.res.error || notice.res.locked || !notice.res.found ? (
                      <Answer res={notice.res} />
                    ) : (
                      <NoticeCard res={notice.res} />
                    )}
                  </>
                )}
              </>
            )}

            {mode === "roleplay" && (
              <>
                {!scenario && (
                  <div className="grid gap-2 sm:grid-cols-3">
                    {profile.scenarios.map((s) => (
                      <button
                        key={s.scenario_id}
                        type="button"
                        onClick={() => startPlay(s)}
                        className="rounded-md border-2 border-navy bg-paper-2 p-3 text-left text-sm hover:bg-mint-2"
                      >
                        <p className="font-semibold text-navy">{s.title}</p>
                        <p className="mt-1 text-xs">{s.persona}</p>
                      </button>
                    ))}
                  </div>
                )}
                {scenario && (
                  <>
                    <div className="flex items-center justify-between rounded-md bg-paper-2 px-3 py-2 text-xs">
                      <span>
                        <b className="text-navy">{scenario.title}</b> · {scenario.persona}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setScenario(null);
                          setPlay([]);
                        }}
                        className="flex items-center gap-1 font-semibold text-navy"
                      >
                        <RotateCcw size={14} />
                        다른 상황
                      </button>
                    </div>
                    {play.map((t, i) =>
                      t.role === "user" ? (
                        <Bubble key={i} me label="나(담당자)">
                          {t.text}
                        </Bubble>
                      ) : t.res?.error || t.res?.locked ? (
                        <Answer key={i} res={t.res} />
                      ) : (
                        <div key={i} className="space-y-2">
                          {t.res && (t.res.good || t.res.improve) && <Coach res={t.res} />}
                          <Bubble label="가상 민원인">{t.text}</Bubble>
                        </div>
                      ),
                    )}
                    {playDone && <p className="rounded-md bg-mint-2 px-3 py-2 text-sm font-semibold text-mint">민원인이 안내를 납득했습니다. 다른 상황으로 연습해 보세요.</p>}
                  </>
                )}
              </>
            )}

            {busy && <p className="text-sm text-navy">{profile.name}이(가) 지침을 찾고 있습니다…</p>}
          </div>

          {locked && <Unlock onDone={() => retry?.()} />}

          <form onSubmit={submit} className="flex gap-2 border-t-2 border-navy p-2 print:hidden">
            {dictation.supported && (
              <button
                type="button"
                onClick={dictation.toggle}
                disabled={!canType}
                className={`rounded-md border-2 border-navy px-3 py-2 disabled:opacity-40 ${dictation.listening ? "animate-pulse bg-rose text-foam" : "bg-foam text-navy"}`}
                aria-label={dictation.listening ? "듣기 멈추기" : "말로 입력하기"}
                aria-pressed={dictation.listening}
              >
                <Mic size={18} />
              </button>
            )}
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={500}
              disabled={!canType}
              placeholder={
                mode === "ask"
                  ? "여권 업무를 물어보세요 (개인정보 입력 금지)"
                  : mode === "notice"
                    ? "민원 상황을 적으세요 (가상 사례, 개인정보 금지)"
                    : scenario
                      ? "창구 담당자로서 답해 보세요"
                      : "먼저 연습할 상황을 고르세요"
              }
              className="min-w-0 flex-1 rounded-md border-2 border-navy bg-foam px-3 py-2 text-sm disabled:opacity-50"
            />
            <button type="submit" disabled={busy || !canType} className="rounded-md border-2 border-navy bg-mint px-3 py-2 text-foam disabled:opacity-50" aria-label="보내기">
              <Send size={18} />
            </button>
            {mode === "ask" && askTurns.length > 0 && (
              <button type="button" onClick={() => setAskTurns([])} className="rounded-md border-2 border-navy bg-foam px-3 py-2 text-sm font-semibold text-navy">
                새 대화
              </button>
            )}
          </form>
        </section>
      </div>
    </div>
  );
}

function Samples({ items, onPick, disabled }: { items: string[]; onPick: (q: string) => void; disabled: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((q) => (
        <button
          key={q}
          type="button"
          disabled={disabled}
          onClick={() => onPick(q)}
          className="rounded-full border border-navy bg-paper-2 px-3 py-1 text-left text-xs text-navy hover:bg-mint-2 disabled:opacity-50"
        >
          {q}
        </button>
      ))}
    </div>
  );
}

function Bubble({ me, label, children }: { me?: boolean; label?: string; children: ReactNode }) {
  return (
    <div className={me ? "ml-auto w-fit max-w-[85%]" : "w-fit max-w-[90%]"}>
      {label && <p className={`text-xs font-semibold text-navy ${me ? "text-right" : ""}`}>{label}</p>}
      <p className={`whitespace-pre-line rounded-md px-3 py-2 text-sm ${me ? "bg-navy text-foam" : "bg-paper-2"}`}>{children}</p>
    </div>
  );
}

function Answer({ res }: { res: Res }) {
  if (res.error) return <p className="rounded-md bg-red-100 px-3 py-2 text-sm text-red-800">{res.error}</p>;
  return (
    <div className="w-fit max-w-[95%] rounded-md bg-mint-2 px-3 py-2 text-sm leading-relaxed">
      <p className="mb-1 text-xs font-semibold text-mint">AI 초안</p>
      <p className="whitespace-pre-line">{res.answer}</p>
      <Citations items={res.citations} />
    </div>
  );
}

function Coach({ res }: { res: Res }) {
  return (
    <div className="rounded-md border-l-4 border-mint bg-foam px-3 py-2 text-sm">
      <p className="text-xs font-semibold text-mint">선배 주무관 코칭 · 판정 참고</p>
      {res.good && <p className="mt-1">👍 {res.good}</p>}
      {res.improve && <p className="mt-1">✍️ {res.improve}</p>}
      <Citations items={res.citations} />
    </div>
  );
}

function NoticeCard({ res }: { res: Res }) {
  const byId = new Map(res.citations.map((c) => [c.id, c]));
  return (
    <article className="rounded-md border-2 border-navy bg-white p-4 text-sm print:border-0">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-mint">오산시 민원여권과 · 민원인 안내문 초안</p>
          <h2 className="font-display text-xl text-navy">{res.title}</h2>
        </div>
        <button type="button" onClick={() => window.print()} className="flex items-center gap-1 rounded-md border-2 border-navy px-2 py-1 text-xs font-semibold text-navy print:hidden">
          <Printer size={14} />
          인쇄
        </button>
      </div>
      <ol className="mt-3 list-decimal space-y-2 pl-5">
        {res.items!.map((it, i) => (
          <li key={i}>
            {it.text}
            <span className="ml-1 text-xs text-ink/60">
              [{it.cite_ids.map((id) => byId.get(id)?.title.split(" ")[0] ?? id).join(", ")}]
            </span>
            {!it.verified && <span className="ml-1 rounded-sm bg-red-100 px-1 text-xs font-semibold text-red-800">확인 필요</span>}
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-ink/70">이 안내문은 AI가 만든 초안입니다. 담당자가 확인한 뒤 드립니다.</p>
      <div className="print:hidden">
        <Citations items={res.citations} label="근거 원문" />
      </div>
    </article>
  );
}

function Unlock({ onDone }: { onDone: () => void }) {
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const r = await fetch("/api/unlock", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ passcode }) });
    if (!r.ok) {
      setError((await r.json().catch(() => ({}))).error ?? "접속 암호를 확인해 주세요.");
      return;
    }
    setPasscode("");
    onDone();
  }
  return (
    <form onSubmit={submit} className="mx-2 mb-2 flex items-center gap-2 rounded-md bg-paper-2 p-2 print:hidden">
      <Lock size={16} className="shrink-0 text-navy" />
      <input
        type="password"
        value={passcode}
        onChange={(e) => setPasscode(e.target.value)}
        placeholder="시연용 접속 암호"
        className="min-w-0 flex-1 rounded-md border-2 border-navy bg-foam px-2 py-1 text-sm"
      />
      <button type="submit" className="rounded-md border-2 border-navy bg-navy px-3 py-1 text-sm font-semibold text-foam">
        열기
      </button>
      {error && <span className="text-xs text-red-800">{error}</span>}
    </form>
  );
}
