import { describe, expect, it } from "vitest";
import { DEMO_CASES } from "./demo";
import { judgeLobby } from "./lobby";

const lead = (text: string) => {
  const r = judgeLobby(text);
  return r.decision.kind === "assign" ? r.decision.lead.dept_id : r.decision.kind;
};

describe("1층 로비 업무 판정", () => {
  it("시연 사례 문장은 미리 정한 결과와 같다", () => {
    const r = judgeLobby(DEMO_CASES[0].input);
    expect(r.source).toBe("demo");
    expect(lead(DEMO_CASES[0].input)).toBe("D-ELDER");
  });
  it("여권은 민원여권과로", () => {
    expect(lead("여권 재발급하려면 어디로 가야 하나요?")).toBe("D-CIVIL");
  });
  it("전입신고는 동 행정복지센터로", () => {
    expect(lead("이사 와서 전입신고를 하려고요")).toBe("D-DONG");
  });
  it("단서가 없으면 AI가 정하지 않고 검토로 넘긴다", () => {
    const r = judgeLobby("오늘 날씨가 좋네요");
    expect(r.decision).toMatchObject({ kind: "needs_review", reason: "no_candidates" });
  });
  it("같은 입력은 늘 같은 점수", () => {
    expect(judgeLobby("장애인 주차표지 변경 신청")).toEqual(judgeLobby("장애인 주차표지 변경 신청"));
  });
});
