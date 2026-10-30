import { describe, expect, it } from "vitest";
import { verifyPack, type Pack } from "./packs";

const pages: Record<string, string[]> = { "passport-act": ["제9조(여권의 발급 신청) 여권을 발급받으려는 사람은 외교부장관에게 신청하여야 한다."] };
const docPages = (id: string) => pages[id]?.length;
const pageText = (id: string, n: number) => pages[id]?.[n - 1];

const pack = (quote: string, page = 1): Pack => ({
  pack_id: "passport",
  dept_id: "D-CIVIL",
  title: "여권 접수",
  team: "여권팀",
  summary: { text: "여권 신청을 받습니다.", sources: [{ doc_id: "passport-act", page, quote }] },
  match: ["여권접수"],
  sections: [],
});

describe("맞춤 자료 인용 대조", () => {
  it("원문에 있는 인용은 통과한다(띄어쓰기 차이는 무시)", () => {
    expect(verifyPack(pack("여권을 발급받으려는  사람은"), docPages, pageText)).toEqual([]);
  });

  it("원문에 없는 인용, 없는 쪽, 없는 문서는 걸러 낸다", () => {
    expect(verifyPack(pack("여권은 우편으로만 신청한다"), docPages, pageText)[0]).toMatch(/없음/);
    expect(verifyPack(pack("여권을 발급받으려는", 3), docPages, pageText)[0]).toMatch(/3쪽 없음/);
    const p = pack("여권");
    p.summary.sources[0].doc_id = "nope";
    expect(verifyPack(p, docPages, pageText)[0]).toMatch(/문서 nope 없음/);
  });
});
