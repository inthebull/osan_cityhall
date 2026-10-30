// 지침 쪽 텍스트를 단락으로 나누고, 글자 2-gram BM25로 찾는다.
// 한국어 형태소 분석기 없이도 조사·어미 변화에 덜 민감하게 맞추기 위한 선택이다.

export type ManualPage = { page: number; text: string };

export type Passage = {
  id: string; // `${doc_id}#${page}-${n}` — 인용은 이 ID로만 한다
  doc_id: string;
  page: number;
  text: string;
};

export type Hit = { passage: Passage; score: number };

const MAX_PASSAGE = 700;

export function toPassages(doc_id: string, pages: ManualPage[]): Passage[] {
  const out: Passage[] = [];
  for (const { page, text } of pages) {
    const paras = text.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, " ").trim()).filter((p) => p.length >= 20);
    let buf = "";
    let n = 0;
    const flush = () => {
      if (buf) out.push({ id: `${doc_id}#${page}-${n++}`, doc_id, page, text: buf });
      buf = "";
    };
    for (const p of paras) {
      if (buf && buf.length + p.length + 1 > MAX_PASSAGE) flush();
      if (p.length > MAX_PASSAGE) {
        for (let i = 0; i < p.length; i += MAX_PASSAGE) {
          buf = p.slice(i, i + MAX_PASSAGE);
          flush();
        }
        continue;
      }
      buf = buf ? `${buf} ${p}` : p;
    }
    flush();
  }
  return out;
}

export function tokenize(text: string): string[] {
  const tokens: string[] = [];
  for (const word of text.toLowerCase().split(/[^0-9a-z가-힣]+/)) {
    if (!word) continue;
    if (word.length === 1) tokens.push(word);
    for (let i = 0; i + 1 < word.length; i++) tokens.push(word.slice(i, i + 2));
  }
  return tokens;
}

export class PassageIndex {
  private docs: { passage: Passage; tf: Map<string, number>; len: number }[] = [];
  private df = new Map<string, number>();
  private avgLen = 0;

  constructor(passages: Passage[], private k1 = 1.2, private b = 0.75) {
    for (const passage of passages) {
      const tf = new Map<string, number>();
      const toks = tokenize(passage.text);
      for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
      for (const t of tf.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
      this.docs.push({ passage, tf, len: toks.length });
    }
    this.avgLen = this.docs.reduce((s, d) => s + d.len, 0) / Math.max(1, this.docs.length);
  }

  get size() {
    return this.docs.length;
  }

  get(id: string): Passage | undefined {
    return this.docs.find((d) => d.passage.id === id)?.passage;
  }

  search(query: string, limit = 5, filter?: (p: Passage) => boolean): Hit[] {
    const q = [...new Set(tokenize(query))];
    const N = this.docs.length;
    const hits: Hit[] = [];
    for (const d of this.docs) {
      if (filter && !filter(d.passage)) continue;
      let score = 0;
      for (const t of q) {
        const f = d.tf.get(t);
        if (!f) continue;
        const n = this.df.get(t) ?? 0;
        const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
        score += (idf * f * (this.k1 + 1)) / (f + this.k1 * (1 - this.b + (this.b * d.len) / this.avgLen));
      }
      if (score > 0) hits.push({ passage: d.passage, score });
    }
    // 같은 점수면 ID 순으로 정렬해 결과를 고정한다.
    return hits.sort((a, b) => b.score - a.score || a.passage.id.localeCompare(b.passage.id)).slice(0, limit);
  }
}
