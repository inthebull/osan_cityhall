import { describe, expect, it } from "vitest";
import { checkCites, getOfficer, inScope, officerForDept, searchQuery } from "./officer";
import { DUTIES } from "@/lib/kb/duties";
import manuals from "@/data/manuals/index.json";

// 테스트용 가상 단락 (실제 지침 인용 아님)
const passages = new Map([
  ["demo#1-0", "재발급 신청 시 여권용 사진 1매와 신분증을 지참합니다."],
  ["demo#2-0", "분실 신고된 여권은 다시 찾더라도 사용할 수 없습니다."],
]);

describe("checkCites", () => {
  it("marks quotes found in the passage as verified, ignoring spaces", () => {
    const out = checkCites([{ id: "demo#1-0", quote: "여권용 사진 1매와  신분증" }], passages);
    expect(out).toEqual([{ id: "demo#1-0", quote: "여권용 사진 1매와  신분증", verified: true }]);
  });

  it("keeps a wrong quote but flags it for review", () => {
    const out = checkCites([{ id: "demo#2-0", quote: "다시 찾으면 사용할 수 있습니다" }], passages);
    expect(out[0].verified).toBe(false);
  });

  it("drops ids outside the retrieved passages and duplicates", () => {
    const out = checkCites(
      [
        { id: "other#9-9", quote: "지어낸 문장" },
        { id: "demo#1-0", quote: "신분증을 지참" },
        { id: "demo#1-0", quote: "신분증을 지참" },
      ],
      passages,
    );
    expect(out.map((c) => c.id)).toEqual(["demo#1-0"]);
  });

  it("does not verify very short quotes", () => {
    expect(checkCites([{ id: "demo#1-0", quote: "여권" }], passages)[0].verified).toBe(false);
  });
});

describe("passport officer", () => {
  const officer = getOfficer("passport")!;

  it("is the 민원여권과 officer", () => {
    expect(officer.dept_id).toBe("D-CIVIL");
    expect(officerForDept("D-CIVIL")?.officer_id).toBe("passport");
  });

  it("points only at existing seats and manuals of its own department", () => {
    for (const id of officer.seat_ids) expect(DUTIES.seats.find((s) => s.seat_id === id)?.dept_id).toBe("D-CIVIL");
    for (const id of officer.doc_ids) expect((manuals as { doc_id: string; dept_id: string }[]).find((d) => d.doc_id === id)?.dept_id).toBe("D-CIVIL");
  });

  it("limits search to its own documents", () => {
    expect(inScope(officer, "passport-act")).toBe(true);
    expect(inScope(officer, "family-register-act")).toBe(false);
  });
});

describe("searchQuery", () => {
  it("joins the last two user turns", () => {
    expect(searchQuery(["a", "여권 재발급", "수수료는요?"])).toBe("여권 재발급 수수료는요?");
  });
});
