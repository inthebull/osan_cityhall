// 인수인계 장의 모양 규칙. 화면 미리보기(SlideView)와 PPT 저장(pptx.ts)이 같은 규칙을 쓴다.
// 내용(deck.ts)은 건드리지 않고, 장 종류와 글머리표 수만 보고 배치를 고른다.
import type { Slide } from "./deck";

export const BADGE = "AI 초안 · 최종 판단은 담당자";
export const HEADER = "오산시 AI 청사 · 업무 인수인계";
// 공식 서비스로 오인되지 않도록 표지에 적는다(DESIGN.md 0절).
export const COVER_NOTE = "2026 오산시 시정연구모임 F4O · 연구 시제품";
// 민선9기 시정슬로건 가로형 로고타입 원본(DESIGN.md 0절)
export const SLOGAN_LOGO = "/brand/osan-slogan-h.png";

export type Layout = "cover" | "section" | "overview" | "explain" | "cards" | "steps" | "table" | "questions";

// 장 종류별 배치. 글머리표가 많으면 카드 격자로 돌린다.
export function layoutOf(s: Slide): Layout {
  const n = s.bullets.length;
  if (s.id.startsWith("section-")) return "section";
  switch (s.kind) {
    case "cover":
      return "cover";
    case "overview":
      return n > 0 && n <= 16 ? "overview" : "cards";
    case "task":
      return n <= 3 && s.id !== "task-more" ? "explain" : "cards";
    case "firstweek":
      return n >= 2 && n <= 6 ? "steps" : "cards";
    case "partners":
      return n > 0 && s.bullets.some((b) => b.includes(": ")) ? "table" : "cards";
    case "ask":
      return n > 0 ? "questions" : "cards";
    default:
      return "cards";
  }
}

// 카드 격자: 개수에 따라 1~3단
export function gridOf(n: number): { cols: number; rows: number } {
  const cols = n > 16 ? 3 : n > 5 ? 2 : 1;
  return { cols, rows: Math.max(1, Math.ceil(n / cols)) };
}

// "자리: 업무" → [자리, 업무]. 쌍점이 없으면 앞 칸을 비운다.
export function splitRow(b: string): [string, string] {
  const i = b.indexOf(": ");
  return i < 0 ? ["", b] : [b.slice(0, i), b.slice(i + 2)];
}

// 요약 장의 "근거 확인 3건 · 검토 필요 2건 · 근거 못 찾음 1건"을 칩으로 나눈다.
export type Tone = "ok" | "warn" | "bad" | "plain";
export function chipsOf(subtitle?: string): { text: string; tone: Tone }[] {
  if (!subtitle) return [];
  return subtitle.split(" · ").map((text) => ({
    text,
    tone: text.startsWith("근거 확인") ? "ok" : text.startsWith("검토") ? "warn" : text.includes("못 찾") ? "bad" : "plain",
  }));
}

// 요약 장 왼쪽의 작은 수치 칸(P09): 칩 중 "n건"이 있는 것만 숫자와 이름으로 나눈다.
export function kpisOf(subtitle?: string): { label: string; value: string; tone: Tone }[] {
  return chipsOf(subtitle).flatMap(({ text, tone }) => {
    const m = text.match(/^(.*?)\s*(\d+)\s*건$/);
    return m ? [{ label: m[1], value: m[2], tone }] : [];
  });
}

export function basisLabel(strength: "direct" | "review" | "none"): string {
  return strength === "direct" ? "근거 확인" : strength === "review" ? "근거 검토 필요" : "확인 필요";
}

export function basisTone(strength: "direct" | "review" | "none"): Tone {
  return strength === "direct" ? "ok" : strength === "review" ? "warn" : "bad";
}

// 같은 문서·쪽은 한 번만 적는다.
export function sourceRefs(s: Slide): string[] {
  return [...new Set((s.sources ?? []).map((x) => `${x.title} ${x.page}쪽`))];
}

// 장 구분(P07): 업무 장이 3장 이상이면 그 앞에, 협업·첫 주 장 앞에 남색 구분 장을 넣는다.
// 내용은 바꾸지 않고 기존 장 제목만 모아 목차로 보여 준다. 화면과 PPT가 같은 함수를 쓴다.
const BODY: Slide["kind"][] = ["task", "pack"];
const WRAP: Slide["kind"][] = ["partners", "firstweek", "ask"];

export function withSections(slides: Slide[]): Slide[] {
  const body = slides.filter((s) => BODY.includes(s.kind));
  const wrap = slides.filter((s) => WRAP.includes(s.kind));
  const firstBody = slides.findIndex((s) => BODY.includes(s.kind));
  const firstWrap = slides.findIndex((s) => s.kind === "partners" || s.kind === "firstweek");
  const out: Slide[] = [];
  let no = 0;
  const section = (title: string, items: string[]): Slide => ({
    id: `section-${++no}`,
    kind: "overview",
    tag: String(no).padStart(2, "0"),
    title,
    bullets: [...new Set(items)].slice(0, 6),
  });
  slides.forEach((s, i) => {
    if (i === firstBody && body.length >= 3) out.push(section("업무별 안내", body.map((b) => b.title.split(" · ")[0])));
    if (i === firstWrap && wrap.length >= 2) out.push(section("함께 일하는 곳과 첫 주", wrap.map((w) => w.title)));
    out.push(s);
  });
  return out;
}

// 표지 날짜는 공문서 표기(2026. 10. 30.)로 쓴다(P13).
export function officialDate(d = new Date()): string {
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
}

// 요약 장의 큰 숫자(P09): "맡게 될 업무 6건" → "6"
export function bigNumber(title: string): string | null {
  return title.match(/(\d+)\s*건/)?.[1] ?? null;
}
