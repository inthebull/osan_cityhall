import { describe, expect, it } from "vitest";
import { getSeat, seatsOf } from "@/lib/kb/duties";
import { buildDeck, MAX_TASK_SLIDES, sanitizeAi } from "./deck";

const seat = seatsOf("D-CIVIL").find((s) => s.team === "여권팀" && s.role === "주무관")!;

describe("인수인계 슬라이드", () => {
  it("표지·개요·업무별·함께 일하는 곳·첫 주·묻기 순서로 만든다", () => {
    const deck = buildDeck(seat, "민원여권과");
    expect(deck[0].kind).toBe("cover");
    expect(deck[1].title).toBe(`맡게 될 업무 ${seat.tasks.length}건`);
    expect(deck.filter((s) => s.kind === "task").length).toBe(Math.min(seat.tasks.length, MAX_TASK_SLIDES));
    expect(deck.slice(-3).map((s) => s.kind)).toEqual(["partners", "firstweek", "ask"]);
  });

  it("근거 문장은 데이터에서만 가져온다", () => {
    const deck = buildDeck(seat, "민원여권과");
    for (const s of deck.filter((x) => x.basis)) {
      expect(s.basis!.text).toMatch(/^오산시 행정기구 및 정원 조례 시행규칙/);
    }
  });

  it("모든 자리에 대해 슬라이드를 만들 수 있다", () => {
    for (const d of ["D-CIVIL", "D-ELDER", "D-DONG"]) {
      for (const s of seatsOf(d)) expect(buildDeck(s, d).length).toBeGreaterThanOrEqual(5);
    }
    expect(getSeat("S-CIVIL-01")).toBeDefined();
  });
});

describe("AI 문장 검사", () => {
  it("모르는 업무 ID와 입력에 없는 조문 인용을 버린다", () => {
    const t = seat.tasks[0];
    const ai = sanitizeAi(
      {
        welcome: "여권법 제99조에 따라 환영합니다",
        first_week: ["문서철 보기", "권한 신청", "팀장 면담"],
        tasks: [
          { task_id: t.task_id, easy: "여권 신청을 받는 일입니다.", tip: "여권법 시행령 제17조를 보세요" },
          { task_id: "T99999", easy: "없는 업무" },
        ],
      },
      seat,
    );
    expect(ai.welcome).toBeUndefined();
    expect(ai.first_week).toHaveLength(3);
    expect(ai.tasks?.[t.task_id]).toEqual({ easy: "여권 신청을 받는 일입니다.", tip: undefined });
    expect(ai.tasks?.T99999).toBeUndefined();
    expect(buildDeck(seat, "민원여권과", ai).find((s) => s.id === `task-${t.task_id}`)?.bullets[0]).toBe("여권 신청을 받는 일입니다.");
  });
});
