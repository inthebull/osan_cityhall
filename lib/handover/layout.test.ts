import { describe, expect, it } from "vitest";
import type { Slide } from "./deck";
import { bigNumber, chipsOf, kpisOf, gridOf, layoutOf, officialDate, splitRow, withSections } from "./layout";

const slide = (kind: Slide["kind"], bullets: string[], id: string = kind): Slide => ({ id, kind, title: "제목", bullets });

describe("인수인계 장 배치", () => {
  it("장 종류별 배치를 고른다", () => {
    expect(layoutOf(slide("cover", ["환영"]))).toBe("cover");
    expect(layoutOf(slide("task", ["설명", "유의점"]))).toBe("explain");
    expect(layoutOf(slide("task", ["가", "나"], "task-more"))).toBe("cards");
    expect(layoutOf(slide("firstweek", ["1", "2", "3", "4", "5"]))).toBe("steps");
    expect(layoutOf(slide("firstweek", Array(8).fill("일")))).toBe("cards");
    expect(layoutOf(slide("partners", ["팀장: 총괄"]))).toBe("table");
    expect(layoutOf(slide("partners", []))).toBe("cards");
    expect(layoutOf(slide("ask", ["질문?"]))).toBe("questions");
    expect(layoutOf(slide("overview", ["가", "나"]))).toBe("overview");
    expect(layoutOf(slide("overview", ["가"], "section-1"))).toBe("section");
  });

  it("글머리표 수에 따라 1~3단으로 나눈다", () => {
    expect(gridOf(4)).toEqual({ cols: 1, rows: 4 });
    expect(gridOf(6)).toEqual({ cols: 2, rows: 3 });
    expect(gridOf(20).cols).toBe(3);
  });

  it("요약 칩과 표 칸을 나눈다", () => {
    expect(chipsOf("근거 확인 1건 · 검토 필요 3건 · 근거 못 찾음 2건").map((c) => c.tone)).toEqual(["ok", "warn", "bad"]);
    expect(splitRow("관련 부서 근거: 회계과")).toEqual(["관련 부서 근거", "회계과"]);
    expect(splitRow("쌍점 없음")).toEqual(["", "쌍점 없음"]);
    expect(kpisOf("근거 확인 1건 · 검토 필요 3건 · 메모")).toEqual([
      { label: "근거 확인", value: "1", tone: "ok" },
      { label: "검토 필요", value: "3", tone: "warn" },
    ]);
  });

  it("업무 장과 마무리 장 앞에 구분 장을 넣는다", () => {
    const deck = [
      slide("cover", ["환영"]),
      slide("overview", ["가", "나", "다"]),
      slide("task", ["설명"], "t1"),
      slide("task", ["설명"], "t2"),
      slide("task", ["설명"], "t3"),
      slide("partners", ["팀장: 총괄"]),
      slide("firstweek", ["1", "2"]),
      slide("ask", ["질문?"]),
    ];
    const out = withSections(deck);
    expect(out.map((s) => s.id)).toEqual(["cover", "overview", "section-1", "t1", "t2", "t3", "section-2", "partners", "firstweek", "ask"]);
    expect(out[2].tag).toBe("01");
    expect(withSections(deck.slice(0, 4)).some((s) => s.id.startsWith("section-"))).toBe(false);
  });

  it("공문서 날짜와 큰 숫자를 만든다", () => {
    expect(officialDate(new Date(2026, 9, 30))).toBe("2026. 10. 30.");
    expect(bigNumber("맡게 될 업무 6건")).toBe("6");
    expect(bigNumber("제목")).toBeNull();
  });
});
