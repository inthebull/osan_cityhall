// 업무적합도 점수: LLM이 아닌 이 결정적 함수만 점수를 만든다.
export type Weights = { duty: number; case: number; semantic: number; target: number; org: number };

export const DEFAULT_WEIGHTS: Weights = { duty: 40, case: 25, semantic: 20, target: 10, org: 5 };

// 각 항목은 0~1 사이 비율
export type Signals = { duty: number; case: number; semantic: number; target: number; org: number };

export type Candidate = { dept_id: string; signals: Signals; hasDirectEvidence: boolean };

export type Scored = Candidate & { score: number; breakdown: Signals };

export type Decision =
  | { kind: "assign"; lead: Scored; ranked: Scored[] }
  | { kind: "needs_review"; reason: "close_scores" | "no_evidence" | "no_candidates"; ranked: Scored[] };

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

export function scoreCandidate(c: Candidate, w: Weights = DEFAULT_WEIGHTS): Scored {
  const breakdown: Signals = {
    duty: w.duty * clamp01(c.signals.duty),
    case: w.case * clamp01(c.signals.case),
    semantic: w.semantic * clamp01(c.signals.semantic),
    target: w.target * clamp01(c.signals.target),
    org: w.org * clamp01(c.signals.org),
  };
  const score = Math.round(breakdown.duty + breakdown.case + breakdown.semantic + breakdown.target + breakdown.org);
  return { ...c, score, breakdown };
}

export const REVIEW_GAP = 10;

export function decide(candidates: Candidate[], w: Weights = DEFAULT_WEIGHTS): Decision {
  // 동점이면 dept_id 순으로 정렬해 같은 입력에 항상 같은 결과를 낸다.
  const ranked = candidates
    .map((c) => scoreCandidate(c, w))
    .sort((a, b) => b.score - a.score || a.dept_id.localeCompare(b.dept_id));
  if (ranked.length === 0) return { kind: "needs_review", reason: "no_candidates", ranked };
  const [top, second] = ranked;
  if (!top.hasDirectEvidence) return { kind: "needs_review", reason: "no_evidence", ranked };
  if (second && top.score - second.score < REVIEW_GAP) return { kind: "needs_review", reason: "close_scores", ranked };
  return { kind: "assign", lead: top, ranked };
}

// A→B→A 순환이나 2회 이상 이송이면 조정 담당자 회부
export function needsEscalation(transfers: string[]): boolean {
  if (transfers.length >= 3) return true; // 최초 배정 + 이송 2회
  for (let i = 2; i < transfers.length; i++) {
    if (transfers[i] === transfers[i - 2] && transfers[i] !== transfers[i - 1]) return true;
  }
  return false;
}
