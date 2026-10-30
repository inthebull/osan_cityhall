import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { MODELS } from "@/lib/ai/models";
import { OFFICER_ASK_PROMPT } from "@/lib/ai/prompts/officer-ask";
import { loadManuals } from "@/lib/kb/manuals";
import { getDept } from "@/lib/map/data";

export const runtime = "nodejs";

type Body = { dept_id?: string; question?: string };

const PII = /\b\d{6}-[1-4]\d{6}\b|\b01[016789]-?\d{3,4}-?\d{4}\b/;
const NOT_FOUND = "인수인계 자료에 없습니다. 전임자나 팀장 확인이 필요합니다.";

export async function POST(req: Request) {
  const { dept_id, question }: Body = await req.json().catch(() => ({}));
  const dept = dept_id ? getDept(dept_id) : undefined;
  const q = (question ?? "").trim();
  if (!dept || !q || q.length > 500) return NextResponse.json({ error: "부서와 500자 이하 질문이 필요합니다." }, { status: 400 });
  if (PII.test(q)) return NextResponse.json({ error: "주민번호·전화번호 같은 개인정보는 입력하지 마세요." }, { status: 400 });

  const { docs, index } = loadManuals();
  const deptDocs = new Set(docs.filter((d) => d.dept_id === dept.dept_id).map((d) => d.doc_id));
  const hits = index.search(q, 6, (p) => deptDocs.has(p.doc_id));
  const cite = (id: string) => {
    const p = index.get(id);
    const doc = p && docs.find((d) => d.doc_id === p.doc_id);
    return p && doc ? { id, title: doc.title, page: p.page, source_url: doc.source_url, text: p.text } : null;
  };

  if (hits.length === 0) return NextResponse.json({ found: false, answer: NOT_FOUND, citations: [], draft: true });
  if (!process.env.ANTHROPIC_API_KEY) {
    // 키가 없으면 검색 결과만 돌려준다.
    return NextResponse.json({
      found: true,
      answer: "관련 지침 단락을 찾았습니다. (AI 요약은 API 키 등록 후 동작합니다)",
      citations: hits.slice(0, 3).map((h) => cite(h.passage.id)),
      draft: true,
    });
  }

  const system = OFFICER_ASK_PROMPT.replace("{{dept_name}}", dept.name);
  const kb = hits.map((h) => `<passage id="${h.passage.id}">${h.passage.text}</passage>`).join("\n");
  const msg = await new Anthropic().messages.create({
    model: MODELS.answer,
    max_tokens: 1024,
    system,
    messages: [{ role: "user", content: `<kb>\n${kb}\n</kb>\n<user_data>${q}</user_data>` }],
  });
  const text = msg.content.map((c) => (c.type === "text" ? c.text : "")).join("");
  let parsed: { found?: boolean; answer?: string; cite_ids?: string[] };
  try {
    parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  } catch {
    return NextResponse.json({ error: "AI 응답을 읽지 못했습니다. 다시 시도해 주세요." }, { status: 502 });
  }
  // 검색된 단락 밖의 인용은 버린다(지어낸 근거 차단).
  const allowed = new Set(hits.map((h) => h.passage.id));
  const citations = (parsed.cite_ids ?? []).filter((id) => allowed.has(id)).map(cite).filter(Boolean);
  const found = Boolean(parsed.found) && citations.length > 0;
  return NextResponse.json({ found, answer: found ? parsed.answer : NOT_FOUND, citations: found ? citations : [], draft: true });
}
