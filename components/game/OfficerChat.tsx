"use client";

import { useEffect, useState, type FormEvent } from "react";
import { BookOpen, Lock, Send } from "lucide-react";

type Citation = { id: string; title: string; page: number; kind?: "manual" | "duty"; source_url: string; text: string };
type Answer = { found: boolean; answer: string; citations: Citation[]; locked?: boolean; error?: string };
type Turn = { q: string; a: Answer | null };

// 부서 방의 AI 주무관 대화창. 답은 모두 초안이며 근거 쪽을 함께 보여 준다.
export function OfficerChat({
  deptId,
  deptName,
  onClose,
  prefill,
}: {
  deptId: string;
  deptName: string;
  onClose?: () => void;
  prefill?: { text: string; n: number };
}) {
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [passcode, setPasscode] = useState("");
  const [passError, setPassError] = useState<string | null>(null);

  useEffect(() => {
    if (prefill) setQuestion(prefill.text);
  }, [prefill]);

  async function ask(q: string) {
    setBusy(true);
    setTurns((t) => [...t, { q, a: null }]);
    let a: Answer;
    try {
      const res = await fetch("/api/officer/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dept_id: deptId, question: q }),
      });
      const body = await res.json();
      a = res.ok ? body : { found: false, answer: "", citations: [], error: body.error ?? "요청을 처리하지 못했습니다." };
    } catch {
      a = { found: false, answer: "", citations: [], error: "연결이 끊겼습니다. 다시 시도해 주세요." };
    }
    setTurns((t) => t.map((turn, i) => (i === t.length - 1 ? { ...turn, a } : turn)));
    setBusy(false);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const q = question.trim();
    if (!q || busy) return;
    setQuestion("");
    void ask(q);
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
    const last = turns[turns.length - 1];
    if (last) void ask(last.q);
  }

  const locked = turns.some((t) => t.a?.locked);

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-2xl text-navy">{deptName} AI 주무관</h2>
        <span className="rounded-sm border-2 border-navy bg-paper-2 px-2 text-xs font-semibold text-navy">답변은 초안</span>
      </div>
      <p className="mt-1 text-sm leading-relaxed">자리별 업무 목록·분장사무와 내려받은 지침에서 근거를 찾아 답합니다. 자료에 없으면 없다고 말씀드리고, 최종 판단은 담당자가 합니다.</p>
      <a href={`/handover?dept=${deptId}`} className="mt-1 inline-block text-xs font-semibold text-mint underline">
        이 부서 인수인계 슬라이드 보기
      </a>

      <div className="mt-3 max-h-64 space-y-3 overflow-y-auto pr-1">
        {turns.map((turn, i) => (
          <div key={i} className="space-y-1">
            <p className="ml-auto w-fit max-w-[85%] rounded-md bg-navy px-3 py-2 text-sm text-foam">{turn.q}</p>
            {!turn.a && <p className="text-sm text-navy">지침을 찾는 중입니다…</p>}
            {turn.a?.error && <p className="rounded-md bg-red-100 px-3 py-2 text-sm text-red-800">{turn.a.error}</p>}
            {turn.a && !turn.a.error && (
              <div className="w-fit max-w-[95%] rounded-md bg-mint-2 px-3 py-2 text-sm leading-relaxed">
                <p className="whitespace-pre-line">{turn.a.answer}</p>
                {turn.a.citations.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {turn.a.citations.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => setOpen(open === `${i}:${c.id}` ? null : `${i}:${c.id}`)}
                          className="flex items-center gap-1 text-left text-xs font-semibold text-mint"
                        >
                          <BookOpen size={14} />
                          {c.title}{c.kind === "duty" ? "" : ` ${c.page}쪽`}
                        </button>
                        {open === `${i}:${c.id}` && (
                          <div className="mt-1 rounded-sm bg-foam p-2 text-xs leading-relaxed">
                            <p className="whitespace-pre-line">{c.text}</p>
                            <a href={c.source_url} target="_blank" rel="noreferrer" className="mt-1 inline-block font-semibold text-navy underline">
                              원문 출처
                            </a>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {locked && (
        <form onSubmit={unlock} className="mt-3 flex items-center gap-2 rounded-md bg-paper-2 p-2">
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
          {passError && <span className="text-xs text-red-800">{passError}</span>}
        </form>
      )}

      <form onSubmit={submit} className="mt-3 flex gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={500}
          placeholder="업무 질문을 입력하세요 (개인정보 입력 금지)"
          className="min-w-0 flex-1 rounded-md border-2 border-navy bg-foam px-3 py-2 text-sm"
        />
        <button type="submit" disabled={busy} className="rounded-md border-2 border-navy bg-mint px-3 py-2 text-foam disabled:opacity-50" aria-label="질문 보내기">
          <Send size={18} />
        </button>
        {onClose && (
          <button type="button" onClick={onClose} className="rounded-md border-2 border-navy bg-foam px-3 py-2 text-sm font-semibold text-navy">
            닫기
          </button>
        )}
      </form>
    </>
  );
}
