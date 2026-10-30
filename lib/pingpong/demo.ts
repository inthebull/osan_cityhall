// 시연용 경계 사례. 신호값은 지식 베이스가 채워지기 전까지 쓰는 가정값이며 화면에 '시연용'으로 표시한다.
import type { Candidate } from "./score";

export const DEPT_NAMES: Record<string, string> = {
  "D-CIVIL": "민원여권과",
  "D-ELDER": "노인장애인과",
  "D-DONG": "동 행정복지센터",
  "D-OTHER": "기타 시 부서",
  "D-EXTERNAL": "외부 기관",
};

export type DemoCase = {
  id: string;
  input: string;
  stage?: string;
  candidates: (Candidate & { note: string })[];
};

export const DEMO_CASES: DemoCase[] = [
  {
    id: "senior-pension",
    input: "어머니 기초연금을 신청하려는데, 결정은 어디서 하나요?",
    stage: "심사·결정 단계",
    candidates: [
      { dept_id: "D-ELDER", note: "기초연금 지급 결정 · 사무분장", hasDirectEvidence: true,
        signals: { duty: 0.9, case: 0.8, semantic: 0.85, target: 1, org: 0.6 } },
      { dept_id: "D-DONG", note: "신청 접수 창구", hasDirectEvidence: true,
        signals: { duty: 0.5, case: 0.6, semantic: 0.7, target: 0.8, org: 0.6 } },
      { dept_id: "D-EXTERNAL", note: "국민연금공단 지사 접수 가능", hasDirectEvidence: false,
        signals: { duty: 0.2, case: 0.3, semantic: 0.5, target: 0.6, org: 0 } },
    ],
  },
  {
    id: "parking-permit",
    input: "아버지 장애인 주차표지를 새 차로 바꾸려면 어디로 가요?",
    candidates: [
      { dept_id: "D-DONG", note: "변경 신청 접수", hasDirectEvidence: true,
        signals: { duty: 0.7, case: 0.5, semantic: 0.75, target: 0.9, org: 0.6 } },
      { dept_id: "D-ELDER", note: "표지 발급 관리", hasDirectEvidence: true,
        signals: { duty: 0.65, case: 0.55, semantic: 0.7, target: 0.9, org: 0.6 } },
      { dept_id: "D-CIVIL", note: "일반 민원 접수", hasDirectEvidence: false,
        signals: { duty: 0.1, case: 0.1, semantic: 0.3, target: 0.2, org: 0.4 } },
    ],
  },
];
