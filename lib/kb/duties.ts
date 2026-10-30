import duties from "@/data/kb/duties.json";
import type { ManualPage } from "./search";

export type DutyTask = {
  task_id: string;
  title: string;
  kind: string;
  label: string;
  basis: { law: string; article: string; item_no: number; item: string; score: number } | null;
  other_dept: string | null;
};

export type Seat = {
  seat_id: string;
  dept_id: string;
  team: string | null;
  role: string;
  label: string;
  tasks: DutyTask[];
};

export const DUTIES = duties as { source: string; source_url: string; law_url: string; fetched_at: string; seats: Seat[] };

export function seatsOf(deptId: string): Seat[] {
  return DUTIES.seats.filter((s) => s.dept_id === deptId);
}

export function getSeat(seatId: string): Seat | undefined {
  return DUTIES.seats.find((s) => s.seat_id === seatId);
}

// pingpong_zero 점수 문턱값: 0.45 이상은 거의 맞고, 0.15~0.45는 검토 필요.
export function basisStrength(t: DutyTask): "direct" | "review" | "none" {
  if (!t.basis || t.basis.score < 0.15) return "none";
  return t.basis.score >= 0.45 ? "direct" : "review";
}

export function basisText(t: DutyTask): string | null {
  return t.basis ? `${t.basis.law} ${t.basis.article} ${t.basis.item_no}. ${t.basis.item}` : null;
}

// 검색 색인용: 자리 하나를 한 쪽짜리 문서로 만든다.
export function seatPage(seat: Seat): ManualPage {
  const lines = seat.tasks.map((t, i) => {
    const b = basisStrength(t) !== "none" ? basisText(t) : null;
    return `${i + 1}) ${t.title}${b ? ` (근거: ${b})` : ""}${t.other_dept ? ` [관련 부서 근거: ${t.other_dept}]` : ""}`;
  });
  return { page: 1, text: `${seat.label} 자리의 담당 업무.\n${lines.join("\n")}` };
}
