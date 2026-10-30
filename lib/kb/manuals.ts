import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DUTIES, seatPage } from "./duties";
import { PassageIndex, toPassages, type ManualPage, type Passage } from "./search";

export type ManualDoc = {
  doc_id: string;
  dept_id: string;
  title: string;
  year?: number;
  publisher?: string;
  source_url: string;
  fetched_at: string;
  pages: number;
  kind?: "manual" | "duty";
};

const root = join(process.cwd(), "data", "manuals");

let cache: { docs: ManualDoc[]; index: PassageIndex } | null = null;

// 서버에서만 호출한다. data/manuals/index.json과 pages/<doc_id>.json을 읽어 색인을 만든다.
// 자리별 업무 목록(data/kb/duties.json)도 한 쪽짜리 문서로 같은 색인에 넣는다.
export function loadManuals() {
  if (cache) return cache;
  const docs: ManualDoc[] = JSON.parse(readFileSync(join(root, "index.json"), "utf8"));
  const passages: Passage[] = [];
  for (const d of docs) {
    const p = join(root, "pages", `${d.doc_id}.json`);
    if (!existsSync(p)) continue;
    passages.push(...toPassages(d.doc_id, JSON.parse(readFileSync(p, "utf8")) as ManualPage[]));
  }
  for (const seat of DUTIES.seats) {
    docs.push({
      doc_id: seat.seat_id,
      dept_id: seat.dept_id,
      title: `${seat.label} 업무 목록`,
      source_url: DUTIES.source_url,
      fetched_at: DUTIES.fetched_at,
      pages: 1,
      kind: "duty",
    });
    passages.push(...toPassages(seat.seat_id, [seatPage(seat)]));
  }
  cache = { docs, index: new PassageIndex(passages) };
  return cache;
}
