import { describe, expect, it } from "vitest";
import { decide, needsEscalation, scoreCandidate } from "./score";

const full = { duty: 1, case: 1, semantic: 1, target: 1, org: 1 };
const none = { duty: 0, case: 0, semantic: 0, target: 0, org: 0 };

describe("scoreCandidate", () => {
  it("gives 100 for full signals and 0 for none", () => {
    expect(scoreCandidate({ dept_id: "A", signals: full, hasDirectEvidence: true }).score).toBe(100);
    expect(scoreCandidate({ dept_id: "A", signals: none, hasDirectEvidence: true }).score).toBe(0);
  });
  it("clamps out-of-range signals", () => {
    const s = scoreCandidate({ dept_id: "A", signals: { ...none, duty: 3, case: -1 }, hasDirectEvidence: true });
    expect(s.score).toBe(40);
  });
});

describe("decide", () => {
  it("assigns when the gap is 10 or more", () => {
    const d = decide([
      { dept_id: "D-ELDER", signals: { ...none, duty: 1, case: 1 }, hasDirectEvidence: true },
      { dept_id: "D-DONG", signals: { ...none, duty: 1 }, hasDirectEvidence: true },
    ]);
    expect(d.kind).toBe("assign");
  });
  it("flags close scores for review", () => {
    const d = decide([
      { dept_id: "D-ELDER", signals: { ...none, duty: 1 }, hasDirectEvidence: true },
      { dept_id: "D-DONG", signals: { ...none, duty: 0.9 }, hasDirectEvidence: true },
    ]);
    expect(d).toMatchObject({ kind: "needs_review", reason: "close_scores" });
  });
  it("flags a top candidate without direct evidence", () => {
    const d = decide([{ dept_id: "D-CIVIL", signals: full, hasDirectEvidence: false }]);
    expect(d).toMatchObject({ kind: "needs_review", reason: "no_evidence" });
  });
  it("is deterministic on ties", () => {
    const c = [
      { dept_id: "B", signals: full, hasDirectEvidence: true },
      { dept_id: "A", signals: full, hasDirectEvidence: true },
    ];
    expect(decide(c).ranked[0].dept_id).toBe("A");
  });
});

describe("needsEscalation", () => {
  it("detects A→B→A", () => expect(needsEscalation(["A", "B", "A"])).toBe(true));
  it("detects two transfers", () => expect(needsEscalation(["A", "B", "C"])).toBe(true));
  it("allows a single transfer", () => expect(needsEscalation(["A", "B"])).toBe(false));
});
