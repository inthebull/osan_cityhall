// 업무별 맞춤 인수인계 자료 묶음(data/handover/packs.json).
// 모든 문장은 지침 원문의 쪽과 그 쪽에 실제로 있는 짧은 인용(quote)을 근거로 단다.
import packs from "@/data/handover/packs.json";

export type PackSource = { doc_id: string; page: number; quote: string };
export type PackItem = { text: string; sources: PackSource[] };
export type PackSectionKind = "law" | "process" | "documents" | "fees" | "pitfalls" | "partners" | "faq";
export type PackSection = { kind: PackSectionKind; title: string; items: PackItem[] };

export type Pack = {
  pack_id: string;
  dept_id: string;
  title: string;
  team: string;
  summary: PackItem;
  match: string[]; // 자리 업무명에 이 낱말이 들어 있으면 이 묶음을 붙인다
  sections: PackSection[];
};

export const PACKS = packs as Pack[];

export function getPack(id: string): Pack | undefined {
  return PACKS.find((p) => p.pack_id === id);
}

// 동 행정복지센터는 시청 과의 사무를 접수하므로 모든 과의 묶음을 붙일 수 있다.
export function packFor(taskTitle: string, deptId: string): Pack | undefined {
  const t = taskTitle.replace(/\s/g, "");
  return PACKS.find(
    (p) => (p.dept_id === deptId || deptId === "D-DONG") && p.match.some((m) => t.includes(m.replace(/\s/g, ""))),
  );
}

const squash = (s: string) => s.replace(/\s+/g, "");

// 인용 대조: 쪽이 있고, 인용문이 그 쪽 원문에 그대로 들어 있어야 한다.
export function verifyPack(
  pack: Pack,
  docPages: (doc_id: string) => number | undefined,
  pageText: (doc_id: string, page: number) => string | undefined,
): string[] {
  const errors: string[] = [];
  const items = [pack.summary, ...pack.sections.flatMap((s) => s.items)];
  for (const item of items) {
    const where = `${pack.pack_id} "${item.text.slice(0, 20)}…"`;
    if (item.sources.length === 0) errors.push(`${where}: 근거 없음`);
    for (const src of item.sources) {
      if (docPages(src.doc_id) === undefined) {
        errors.push(`${where}: 문서 ${src.doc_id} 없음`);
        continue;
      }
      // 발췌본은 원래 PDF 쪽 번호를 쓰므로 쪽 수가 아니라 실제 쪽이 있는지로 본다.
      const text = pageText(src.doc_id, src.page);
      if (text === undefined) {
        errors.push(`${where}: ${src.doc_id} ${src.page}쪽 없음`);
        continue;
      }
      const q = squash(src.quote);
      if (q.length < 4 || q.length > 300) errors.push(`${where}: 인용 길이 ${q.length}자`);
      if (!squash(text).includes(q)) errors.push(`${where}: ${src.doc_id} ${src.page}쪽에 "${src.quote.slice(0, 30)}" 없음`);
    }
  }
  return errors;
}
