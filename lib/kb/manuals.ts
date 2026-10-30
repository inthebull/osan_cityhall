import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
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
};

const root = join(process.cwd(), "data", "manuals");

let cache: { docs: ManualDoc[]; index: PassageIndex } | null = null;

// 서버에서만 호출한다. data/manuals/index.json과 pages/<doc_id>.json을 읽어 색인을 만든다.
export function loadManuals() {
  if (cache) return cache;
  const docs: ManualDoc[] = JSON.parse(readFileSync(join(root, "index.json"), "utf8"));
  const passages: Passage[] = [];
  for (const d of docs) {
    const p = join(root, "pages", `${d.doc_id}.json`);
    if (!existsSync(p)) continue;
    passages.push(...toPassages(d.doc_id, JSON.parse(readFileSync(p, "utf8")) as ManualPage[]));
  }
  cache = { docs, index: new PassageIndex(passages) };
  return cache;
}
