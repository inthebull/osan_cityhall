import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { MODELS } from "@/lib/ai/models";
import { HANDOVER_DECK_PROMPT } from "@/lib/ai/prompts/handover-deck";
import { isUnlocked } from "@/lib/auth/demo";
import { buildDeck, buildPackDeck, MAX_TASK_SLIDES, sanitizeAi, type AiText, type ResolveSource } from "@/lib/handover/deck";
import { getPack, packFor } from "@/lib/handover/packs";
import { basisStrength, basisText, getSeat } from "@/lib/kb/duties";
import { loadManuals } from "@/lib/kb/manuals";
import { getDept } from "@/lib/map/data";

export const runtime = "nodejs";

// 맞춤 자료의 근거(doc_id·쪽·인용)를 문서 제목과 출처 주소로 바꾼다.
const resolve: ResolveSource = (src) => {
  const doc = loadManuals().docs.find((d) => d.doc_id === src.doc_id);
  return { title: doc?.title ?? src.doc_id, page: src.page, quote: src.quote, url: doc?.source_url ?? "" };
};

export async function POST(req: Request) {
  const { seat_id, pack_id }: { seat_id?: string; pack_id?: string } = await req.json().catch(() => ({}));

  if (pack_id) {
    const pack = getPack(pack_id);
    const pdept = pack ? getDept(pack.dept_id) : undefined;
    if (!pack || !pdept) return NextResponse.json({ error: "업무 자료를 찾을 수 없습니다." }, { status: 400 });
    return NextResponse.json({
      seat: { seat_id: pack.pack_id, label: pack.title, dept_id: pack.dept_id, dept_name: pdept.name },
      slides: buildPackDeck(pack, pdept.name, resolve),
      ai: false,
      locked: false,
      draft: true,
    });
  }

  const seat = seat_id ? getSeat(seat_id) : undefined;
  const dept = seat ? getDept(seat.dept_id) : undefined;
  if (!seat || !dept) return NextResponse.json({ error: "자리를 찾을 수 없습니다." }, { status: 400 });

  const canUseAi = Boolean(process.env.ANTHROPIC_API_KEY) && isUnlocked(req);
  let ai: AiText = {};
  if (canUseAi) {
    const input = {
      자리: seat.label,
      업무: seat.tasks.slice(0, MAX_TASK_SLIDES).map((t) => ({
        task_id: t.task_id,
        업무명: t.title,
        구분: t.kind,
        근거: basisStrength(t) === "none" ? "찾지 못함" : basisText(t),
        근거확실성: basisStrength(t) === "direct" ? "확인" : basisStrength(t) === "review" ? "검토 필요" : "없음",
      })),
    };
    try {
      const msg = await new Anthropic().messages.create({
        model: MODELS.answer,
        max_tokens: 3000,
        system: HANDOVER_DECK_PROMPT.replace("{{dept_name}}", dept.name),
        messages: [{ role: "user", content: `<user_data>${JSON.stringify(input)}</user_data>` }],
      });
      const text = msg.content.map((c) => (c.type === "text" ? c.text : "")).join("");
      ai = sanitizeAi(JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)), seat);
    } catch {
      ai = {}; // AI 실패 시 기본 문장으로 만든다.
    }
  }

  return NextResponse.json({
    seat: { seat_id: seat.seat_id, label: seat.label, dept_id: seat.dept_id, dept_name: dept.name },
    slides: buildDeck(seat, dept.name, ai, (t) => packFor(t.title, seat.dept_id), resolve),
    ai: Object.keys(ai).length > 0,
    locked: Boolean(process.env.ANTHROPIC_API_KEY) && !canUseAi,
    draft: true,
  });
}
