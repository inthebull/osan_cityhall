// AI 주무관 한 명의 정의(data/officers/*.json)와 답변 근거 대조.
// 담당 자리와 지침만 검색 범위로 삼아, 다른 업무 근거가 섞이지 않게 한다.
import passport from "@/data/officers/passport.json";

export type OfficerMode = "ask" | "notice" | "roleplay";

export type Scenario = { scenario_id: string; title: string; persona: string; opening: string; facts: string };

export type Officer = {
  officer_id: string;
  dept_id: string;
  team: string;
  name: string;
  title: string;
  room_id?: string;
  intro: string;
  seat_ids: string[];
  doc_ids: string[];
  modes: Record<OfficerMode, { label: string; hint: string; samples: string[] }>;
  scenarios: Scenario[];
};

export const OFFICERS = [passport] as Officer[];
export const MODES: OfficerMode[] = ["ask", "notice", "roleplay"];

export function getOfficer(id: string): Officer | undefined {
  return OFFICERS.find((o) => o.officer_id === id);
}

export function officerForDept(deptId: string): Officer | undefined {
  return OFFICERS.find((o) => o.dept_id === deptId);
}

// 검색 대상: 담당 지침 문서와 담당 자리 업무 목록
export function inScope(officer: Officer, doc_id: string): boolean {
  return officer.doc_ids.includes(doc_id) || officer.seat_ids.includes(doc_id);
}

// 대화가 이어질 때 "그럼 수수료는요?"처럼 짧은 질문도 앞 질문 맥락으로 찾도록 최근 사용자 발화를 합친다.
export function searchQuery(userTurns: string[], max = 2): string {
  return userTurns.slice(-max).join(" ");
}

const squash = (s: string) => s.replace(/\s+/g, "");

export type CiteIn = { id: string; quote: string };
export type CiteCheck = { id: string; quote: string; verified: boolean };

// 근거 대조: 인용 ID가 이번에 찾은 단락이어야 하고, 인용문이 그 단락에 그대로 있어야 한다.
// 대조에 실패한 인용은 버리지 않고 "확인 필요"로 표시한다(검색 밖 ID는 원문을 보여 줄 수 없어 버린다).
export function checkCites(cites: CiteIn[], passages: Map<string, string>): CiteCheck[] {
  const out: CiteCheck[] = [];
  const seen = new Set<string>();
  for (const c of cites) {
    const text = passages.get(c.id);
    if (text === undefined || seen.has(c.id)) continue;
    seen.add(c.id);
    const q = squash(c.quote ?? "");
    out.push({ id: c.id, quote: c.quote ?? "", verified: q.length >= 4 && squash(text).includes(q) });
  }
  return out;
}
