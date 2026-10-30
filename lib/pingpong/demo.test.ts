import { describe, expect, it } from "vitest";
import { DEMO_CASES } from "./demo";
import { decide } from "./score";

describe("demo cases", () => {
  it("assigns the pension decision to 노인장애인과", () => {
    const d = decide(DEMO_CASES[0].candidates);
    expect(d.kind).toBe("assign");
    expect(d.kind === "assign" && d.lead.dept_id).toBe("D-ELDER");
  });
  it("flags the parking permit case for review", () => {
    expect(decide(DEMO_CASES[1].candidates)).toMatchObject({ kind: "needs_review", reason: "close_scores" });
  });
});
