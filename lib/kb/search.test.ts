import { describe, expect, it } from "vitest";
import { PassageIndex, toPassages, tokenize } from "./search";

// 테스트용 가상 문장 (실제 지침 인용 아님)
const pages = [
  { page: 3, text: "여권 재발급 신청은 본인이 직접 방문하여야 합니다.\n\n신청 시 여권용 사진 1매와 신분증을 지참합니다." },
  { page: 7, text: "기초연금 신청은 주소지 읍면동 행정복지센터 또는 국민연금공단 지사에서 할 수 있습니다." },
  { page: 9, text: "장애인 등록 신청을 받은 읍면동은 서류를 확인한 뒤 시군구로 송부합니다." },
];

describe("tokenize", () => {
  it("makes character bigrams", () => {
    expect(tokenize("여권 신청")).toEqual(["여권", "신청"]);
    expect(tokenize("재발급")).toEqual(["재발", "발급"]);
  });
});

describe("toPassages", () => {
  it("keeps page numbers and stable ids", () => {
    const ps = toPassages("demo", pages);
    expect(ps.map((p) => p.id)).toEqual(["demo#3-0", "demo#7-0", "demo#9-0"]);
    expect(ps[0].text).toContain("신분증");
  });
  it("splits very long paragraphs", () => {
    const ps = toPassages("long", [{ page: 1, text: "가".repeat(1500) }]);
    expect(ps.length).toBe(3);
  });
});

describe("PassageIndex", () => {
  const idx = new PassageIndex(toPassages("demo", pages));
  it("finds the passport passage", () => {
    expect(idx.search("여권 다시 발급받으려면 뭐가 필요해요?")[0].passage.page).toBe(3);
  });
  it("finds the pension passage even with different endings", () => {
    expect(idx.search("기초연금은 어디서 신청하나요")[0].passage.page).toBe(7);
  });
  it("returns nothing for unrelated questions", () => {
    expect(idx.search("주차 단속 과태료")).toEqual([]);
  });
  it("looks up passages by id", () => {
    expect(idx.get("demo#9-0")?.page).toBe(9);
  });
});
