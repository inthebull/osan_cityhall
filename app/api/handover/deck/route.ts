import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { MODELS } from "@/lib/ai/models";
import { HANDOVER_DECK_PROMPT } from "@/lib/ai/prompts/handover-deck";
import { isUnlocked } from "@/lib/auth/demo";
import { buildDeck, MAX_TASK_SLIDES, sanitizeAi, type AiText } from "@/lib/handover/deck";
import { basisStrength, basisText, getSeat } from "@/lib/kb/duties";
import { getDept } from "@/lib/map/data";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { seat_id }: { seat_id?: string } = await req.json().catch(() => ({}));
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
    slides: buildDeck(seat, dept.name, ai),
    ai: Object.keys(ai).length > 0,
    locked: Boolean(process.env.ANTHROPIC_API_KEY) && !canUseAi,
    draft: true,
  });
}
