// 1층 로비 업무 안내: 시민·직원이 적은 업무 문장에서 단서를 뽑아 부서 후보를 만들고, 점수는 score.ts가 계산한다.
// 지금 단계의 단서 사전은 시연용 가정값이다. 부서 자료(data/intake)가 들어오면 사무분장 원문으로 바꾼다.
import { DEMO_CASES } from "./demo";
import { decide, type Candidate, type Decision } from "./score";

type Rule = {
  dept_id: string;
  duty: string[];
  stage?: string[];
  target?: string[];
};

const RULES: Rule[] = [
  {
    dept_id: "D-CIVIL",
    duty: ["여권", "무인민원", "무인발급", "가족관계", "제증명", "민원서류", "아포스티유"],
    target: ["해외", "출국", "외국"],
  },
  {
    dept_id: "D-ELDER",
    duty: ["기초연금", "노인", "어르신", "경로", "장애인", "장애", "활동지원", "주차표지", "노인일자리", "보청기"],
    stage: ["결정", "심사", "지급", "등급", "발급 관리"],
    target: ["어머니", "아버지", "부모님", "할머니", "할아버지", "어르신"],
  },
  {
    dept_id: "D-DONG",
    duty: ["전입", "주민등록", "등본", "초본", "인감", "행정복지센터", "주민센터", "동사무소", "기초생활", "복지 상담", "이사"],
    stage: ["신청", "접수", "변경", "바꾸"],
    target: ["어머니", "아버지", "부모님", "할머니", "할아버지", "주민"],
  },
];

export type LobbyCandidate = Candidate & { note: string; clues: string[] };

export type LobbyResult = {
  candidates: LobbyCandidate[];
  decision: Decision;
  source: "demo" | "clues";
};

const hits = (text: string, words: string[] = []) => words.filter((w) => text.includes(w));

export function judgeLobby(input: string): LobbyResult {
  const text = input.replace(/\s+/g, " ").trim();
  // 시연 사례 문장은 미리 정한 신호값을 그대로 써서 발표 때 같은 결과가 나오게 한다.
  const demo = DEMO_CASES.find((c) => c.input === text);
  if (demo) {
    const candidates = demo.candidates.map((c) => ({ ...c, clues: [] }));
    return { candidates, decision: decide(candidates), source: "demo" };
  }
  const compact = text.replace(/\s/g, "");
  const candidates: LobbyCandidate[] = [];
  for (const rule of RULES) {
    const duty = hits(compact, rule.duty.map((w) => w.replace(/\s/g, "")));
    const stage = hits(compact, rule.stage);
    const target = hits(compact, rule.target);
    if (!duty.length && !stage.length) continue;
    const dutyScore = Math.min(1, duty.length * 0.45 + (duty.length ? stage.length * 0.25 : 0));
    candidates.push({
      dept_id: rule.dept_id,
      hasDirectEvidence: duty.length > 0,
      signals: {
        duty: dutyScore,
        case: Math.min(1, duty.length * 0.3),
        semantic: duty.length ? Math.min(1, 0.5 + duty.length * 0.2) : 0.3,
        target: target.length ? 0.9 : duty.length ? 0.4 : 0.2,
        org: 0.6,
      },
      clues: [...duty, ...stage, ...target],
      note: duty.length ? `단서: ${[...duty, ...stage].join(", ")}` : `절차 단서만 있음: ${stage.join(", ")}`,
    });
  }
  return { candidates, decision: decide(candidates), source: "clues" };
}

export const LOBBY_EXAMPLES = [
  ...DEMO_CASES.map((c) => c.input),
  "여권 재발급하려면 어디로 가야 하나요?",
  "이사 와서 전입신고를 하려고요",
];
