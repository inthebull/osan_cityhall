import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { MODELS } from "@/lib/ai/models";
import { OFFICER_SCHEMAS, officerSystem } from "@/lib/ai/prompts/officer-desk";
import { isUnlocked } from "@/lib/auth/demo";
import { loadManuals } from "@/lib/kb/manuals";
import { getDept } from "@/lib/map/data";
import { checkCites, getOfficer, inScope, MODES, searchQuery, type CiteIn, type OfficerMode } from "@/lib/officers/officer";

export const runtime = "nodejs";

type Turn = { role: "user" | "assistant"; text: string };
type Body = { mode?: OfficerMode; turns?: Turn[]; scenario_id?: string };

const PII = /\b\d{6}-[1-4]\d{6}\b|\b01[016789]-?\d{3,4}-?\d{4}\b/;
const NOT_FOUND = "인수인계 자료에 없습니다. 전임자나 팀장 확인이 필요합니다.";
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(req: Request, { params }: { params: Promise<{ officerId: string }> }) {
  const officer = getOfficer((await params).officerId);
  if (!officer) return bad("없는 AI 주무관입니다.", 404);
  const dept = getDept(officer.dept_id);
  const { mode, turns = [], scenario_id }: Body = await req.json().catch(() => ({}));
  if (!mode || !MODES.includes(mode)) return bad("소통 방식을 고르세요.");
  if (!Array.isArray(turns) || turns.length === 0 || turns.length > 16) return bad("대화가 비었거나 너무 깁니다. 새로 시작해 주세요.");
  const userTexts = turns.filter((t) => t.role === "user").map((t) => String(t.text ?? "").trim());
  if (turns[turns.length - 1].role !== "user" || userTexts.some((t) => !t || t.length > 500)) return bad("500자 이하로 입력해 주세요.");
  if (userTexts.some((t) => PII.test(t))) return bad("주민번호·전화번호 같은 개인정보는 입력하지 마세요.");
  const scenario = mode === "roleplay" ? officer.scenarios.find((s) => s.scenario_id === scenario_id) : undefined;
  if (mode === "roleplay" && !scenario) return bad("응대 연습 상황을 고르세요.");

  // 담당 지침·자리 안에서만 근거를 찾는다.
  const { docs, index } = loadManuals();
  const last = userTexts[userTexts.length - 1];
  const query =
    mode === "roleplay"
      ? `${scenario!.facts} ${turns.filter((t) => t.role === "assistant").slice(-1)[0]?.text ?? ""} ${last}`
      : mode === "notice"
        ? last
        : searchQuery(userTexts);
  const hits = index.search(query, 8, (p) => inScope(officer, p.doc_id));
  const source = (id: string) => {
    const p = index.get(id);
    const doc = p && docs.find((d) => d.doc_id === p.doc_id);
    return p && doc ? { id, title: doc.title, page: p.page, kind: doc.kind ?? "manual", source_url: doc.source_url, text: p.text } : null;
  };

  const locked = !isUnlocked(req);
  if (!process.env.ANTHROPIC_API_KEY || locked) {
    // 키가 없거나 잠겨 있으면 찾은 근거 단락만 돌려준다(요금 없음).
    const why = process.env.ANTHROPIC_API_KEY ? "시연용 접속 암호를 입력하면" : "API 키 등록 후";
    return NextResponse.json({
      mode,
      draft: true,
      locked: Boolean(process.env.ANTHROPIC_API_KEY) && locked,
      found: hits.length > 0,
      answer: hits.length ? `관련 지침 단락을 찾았습니다. AI 주무관 답변은 ${why} 동작합니다.` : NOT_FOUND,
      citations: hits.slice(0, 3).map((h) => ({ ...source(h.passage.id)!, quote: "", verified: false })),
    });
  }
  if (hits.length === 0 && mode !== "roleplay") return NextResponse.json({ mode, draft: true, found: false, answer: NOT_FOUND, citations: [] });

  const kb = hits.map((h) => `<passage id="${h.passage.id}">${h.passage.text}</passage>`).join("\n");
  const system = officerSystem(mode, { dept_name: dept?.name ?? "", team: officer.team, officer_name: officer.name });
  let messages: Anthropic.Beta.BetaMessageParam[];
  if (mode === "roleplay") {
    const transcript = turns.map((t) => `${t.role === "assistant" ? "민원인" : "담당자"}: ${t.text}`).join("\n");
    messages = [
      {
        role: "user",
        content: `<kb>\n${kb}\n</kb>\n<scenario>\n인물: ${scenario!.persona}\n사실: ${scenario!.facts}\n</scenario>\n<user_data>\n${transcript}\n</user_data>`,
      },
    ];
  } else {
    // 앞 대화는 그대로 두고, 마지막 질문에만 이번에 찾은 근거를 붙인다.
    messages = turns.map((t, i) =>
      i === turns.length - 1
        ? { role: "user", content: `<kb>\n${kb}\n</kb>\n<user_data>${t.text}</user_data>` }
        : { role: t.role, content: t.role === "user" ? `<user_data>${t.text}</user_data>` : t.text },
    );
  }

  let msg: Anthropic.Beta.BetaMessage;
  try {
    msg = await new Anthropic().beta.messages.create({
      model: MODELS.answer,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: OFFICER_SCHEMAS[mode] } },
      system,
      messages,
    });
  } catch (e) {
    const status = e instanceof Anthropic.RateLimitError ? 429 : 502;
    return bad(status === 429 ? "요청이 몰렸습니다. 잠시 후 다시 시도해 주세요." : "AI 주무관과 연결하지 못했습니다. 다시 시도해 주세요.", status);
  }
  if (msg.stop_reason === "refusal") return bad("이 질문에는 답할 수 없습니다. 업무 질문으로 다시 물어 주세요.", 422);
  const text = msg.content.map((c) => (c.type === "text" ? c.text : "")).join("");
  let out: {
    found?: boolean;
    answer?: string;
    title?: string;
    items?: { text: string; cites: CiteIn[] }[];
    citizen?: string;
    done?: boolean;
    good?: string;
    improve?: string;
    cites?: CiteIn[];
  };
  try {
    out = JSON.parse(text);
  } catch {
    return bad("AI 응답을 읽지 못했습니다. 다시 시도해 주세요.", 502);
  }

  // 근거 대조: 이번에 찾은 단락 밖 인용은 버리고, 원문에 없는 인용문은 "확인 필요"로 남긴다.
  const allowed = new Map(hits.map((h) => [h.passage.id, h.passage.text]));
  const all = [...(out.cites ?? []), ...(out.items ?? []).flatMap((it) => it.cites)];
  const checked = checkCites(all, allowed);
  const citations = checked.map((c) => ({ ...source(c.id)!, quote: c.quote, verified: c.verified }));
  const ok = new Set(checked.map((c) => c.id));

  if (mode === "notice") {
    const items = (out.items ?? [])
      .map((it) => {
        const ids = [...new Set(it.cites.map((c) => c.id).filter((id) => ok.has(id)))];
        return { text: it.text, cite_ids: ids, verified: ids.length > 0 && ids.every((id) => checked.find((c) => c.id === id)?.verified) };
      })
      .filter((it) => it.cite_ids.length > 0);
    const found = Boolean(out.found) && items.length > 0;
    return NextResponse.json({ mode, draft: true, found, title: found ? out.title : "", items, answer: found ? "" : NOT_FOUND, citations: found ? citations : [] });
  }
  if (mode === "roleplay") {
    return NextResponse.json({
      mode,
      draft: true,
      found: true,
      citizen: out.citizen ?? "",
      done: Boolean(out.done),
      good: out.good ?? "",
      improve: out.improve ?? "",
      citations,
    });
  }
  const found = Boolean(out.found) && citations.length > 0;
  return NextResponse.json({ mode, draft: true, found, answer: found ? out.answer : NOT_FOUND, citations: found ? citations : [] });
}
