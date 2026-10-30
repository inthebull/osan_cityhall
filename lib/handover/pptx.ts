// 브라우저에서 인수인계 슬라이드를 .pptx로 저장한다.
// 색·서체·격자는 DESIGN.md, 배치 규칙은 layout.ts, 패턴 번호(P01…)는 osan-slide-references 스킬을 따른다.
// 여기서는 16:9(13.33 x 7.5 in) 좌표로 그리기만 한다.
import type PptxGenJS from "pptxgenjs";
import type { Slide } from "./deck";
import {
  BADGE,
  COVER_NOTE,
  HEADER,
  SLOGAN_LOGO,
  basisLabel,
  basisTone,
  bigNumber,
  chipsOf,
  gridOf,
  layoutOf,
  officialDate,
  sourceRefs,
  splitRow,
  withSections,
  type Tone,
} from "./layout";

// DESIGN.md 2절 문서 팔레트(60·30·10: 흰색·회색 / 남색 / 청록)
const NAVY = "16288B";
const TEAL = "00A0AD"; // 선·점·도형 전용(흰 바탕 3.2:1)
const TEAL_DEEP = "006B73"; // 작은 글자·흰 글자 바탕용(6.3:1)
const TINT = "E0F4F5";
const INK = "1F2937";
const CARD = "F4F5F6";
const LINE = "D9DEE7";
const MUTED = "6B7280";
const FONT = "맑은 고딕";

const TONE: Record<Tone, { fill: string; edge: string; ink: string }> = {
  ok: { fill: TINT, edge: TEAL, ink: TEAL_DEEP },
  warn: { fill: "FCEBD3", edge: "C9843A", ink: "7A4A12" },
  bad: { fill: "FDE2E1", edge: "B84B45", ink: "8A2E2A" },
  plain: { fill: CARD, edge: LINE, ink: INK },
};

// 격자(P04): 좌우 여백 0.6in, 12단, 단 사이 0.2in
const X = 0.6;
const W = 12.13;
const COL = (W - 0.2 * 11) / 12;
const span = (n: number) => COL * n + 0.2 * (n - 1);
const TOP = 2.35; // 본문 시작(제목·헤드메시지 아래)
const BOTTOM = 6.45; // 본문 끝(각주 위)

type PSlide = PptxGenJS.Slide;
type Shapes = PptxGenJS["ShapeType"];

const t = (o: PptxGenJS.TextPropsOptions): PptxGenJS.TextPropsOptions => ({ fontFace: FONT, margin: 0, ...o });
const rule = (slide: PSlide, S: Shapes, x: number, y: number, w: number, color = LINE, width = 0.75) =>
  slide.addShape(S.line, { x, y, w, h: 0, line: { color, width } });
const vrule = (slide: PSlide, S: Shapes, x: number, y: number, h: number) => slide.addShape(S.line, { x, y, w: 0, h, line: { color: LINE, width: 0.75 } });
const bar = (slide: PSlide, S: Shapes, x: number, y: number, w: number, h: number, color: string) =>
  slide.addShape(S.rect, { x, y, w, h, fill: { color }, line: { color, width: 0 } });

function badge(slide: PSlide, S: Shapes, x: number, y: number) {
  slide.addText(BADGE, t({ shape: S.roundRect, rectRadius: 0.04, x, y, w: 2.75, h: 0.3, fontSize: 10, bold: true, color: TEAL_DEEP, fill: { color: TINT }, line: { color: TEAL, width: 0.75 }, align: "center", valign: "middle" }));
}

// P01 세 구역 틀: 머리(제목·헤드메시지) / 본문 / 바닥(근거·출처·쪽)
function frame(slide: PSlide, S: Shapes, s: Slide) {
  slide.background = { color: "FFFFFF" };
  bar(slide, S, 0, 0, 13.33, 0.08, NAVY);
  slide.addText(HEADER, t({ x: X, y: 0.25, w: 7, h: 0.3, fontSize: 10, color: MUTED, valign: "middle" }));
  badge(slide, S, X + W - 2.75, 0.25);
  // P02 제목: 한 줄, 남색, 같은 자리
  slide.addText(s.title, t({ x: X, y: 0.7, w: W, h: 0.7, fontSize: 28, bold: true, color: NAVY, valign: "middle", fit: "shrink" }));

  const chips = s.kind === "overview" ? chipsOf(s.subtitle) : [];
  const head = [s.tag, s.subtitle].filter(Boolean).join("  ·  ");
  if (chips.length) {
    let cx = X;
    for (const c of chips) {
      const w = 0.3 + c.text.length * 0.15;
      slide.addText(c.text, t({ shape: S.roundRect, rectRadius: 0.04, x: cx, y: 1.55, w, h: 0.36, fontSize: 12, bold: true, color: TONE[c.tone].ink, fill: { color: TONE[c.tone].fill }, align: "center", valign: "middle" }));
      cx += w + 0.15;
    }
  } else if (head) {
    // P03 헤드메시지 상자: 연회색 바탕 + 청록 왼쪽 띠, 한 줄
    bar(slide, S, X, 1.5, W, 0.5, CARD);
    bar(slide, S, X, 1.5, 0.06, 0.5, TEAL);
    slide.addText(head, t({ x: X + 0.25, y: 1.5, w: W - 0.4, h: 0.5, fontSize: 14, bold: true, color: TEAL_DEEP, valign: "middle", fit: "shrink" }));
  } else {
    bar(slide, S, X, 1.55, 1.1, 0.06, TEAL);
  }
}

// P10 바닥: 근거 각주(왼쪽), 출처(왼쪽 아래), 쪽 번호(가운데 아래, 공문서 관례)
function footer(slide: PSlide, S: Shapes, s: Slide, i: number, total: number, note: string, dark = false) {
  const refs = sourceRefs(s);
  if (refs.length) {
    slide.addText(
      [{ text: "근거  ", options: { bold: true, color: TEAL_DEEP } }, { text: refs.join(" · "), options: { color: INK } }],
      t({ x: X, y: 6.52, w: W, h: 0.3, fontSize: 10, valign: "middle", fit: "shrink" }),
    );
  }
  rule(slide, S, X, 6.9, W, dark ? "3A4BA6" : LINE);
  slide.addText(note, t({ x: X, y: 6.97, w: 5.6, h: 0.3, fontSize: 8, color: dark ? "C9CFEA" : MUTED, valign: "middle", fit: "shrink" }));
  slide.addText(`${i + 1} / ${total}`, t({ x: 13.33 / 2 - 0.6, y: 6.97, w: 1.2, h: 0.3, fontSize: 10, bold: true, color: dark ? "FFFFFF" : NAVY, align: "center", valign: "middle" }));
}

// P05 선으로 나눈 번호 목록(상자 대신 여백과 가는 선)
function list(slide: PSlide, S: Shapes, items: string[], numbered: boolean, x: number, y: number, w: number, h: number) {
  const { cols, rows } = gridOf(items.length);
  const gap = 0.3;
  const cw = (w - gap * (cols - 1)) / cols;
  const rh = Math.min(0.85, h / rows);
  const fs = rh >= 0.75 ? 16 : rh >= 0.5 ? 14 : 12;
  items.forEach((text, k) => {
    const cx = x + (k % cols) * (cw + gap); // 화면 격자와 같이 행 우선
    const cy = y + Math.floor(k / cols) * rh;
    rule(slide, S, cx, cy, cw);
    if (numbered) slide.addText(`${k + 1}.`, t({ x: cx, y: cy, w: 0.5, h: rh, fontSize: fs, bold: true, color: TEAL_DEEP, valign: "middle" }));
    const pad = numbered ? 0.5 : 0.1;
    slide.addText(text, t({ x: cx + pad, y: cy, w: cw - pad, h: rh, fontSize: fs, color: INK, valign: "middle", fit: "shrink" }));
  });
  for (let c = 0; c < Math.min(cols, items.length); c++) rule(slide, S, x + c * (cw + gap), y + Math.ceil((items.length - c) / cols) * rh, cw);
}

// 근거 상자: 상태 색 연한 바탕 + 같은 색 띠 + 라벨 알약
function basisStrip(slide: PSlide, S: Shapes, s: Slide, y: number, h: number) {
  if (!s.basis) return;
  const tone = basisTone(s.basis.strength);
  const c = TONE[tone];
  bar(slide, S, X, y, W, h, c.fill);
  bar(slide, S, X, y, 0.06, h, c.edge);
  slide.addText(`근거 · ${basisLabel(s.basis.strength)}`, t({ shape: S.roundRect, rectRadius: 0.04, x: X + 0.25, y: y + (h - 0.32) / 2, w: 1.9, h: 0.32, fontSize: 11, bold: true, color: "FFFFFF", fill: { color: tone === "ok" ? TEAL_DEEP : c.ink }, align: "center", valign: "middle" }));
  slide.addText(s.basis.text, t({ x: X + 2.35, y, w: W - 2.55, h, fontSize: 12, color: INK, valign: "middle", fit: "shrink" }));
}

// P09 요약: 왼쪽 1/3 큰 숫자, 오른쪽 2/3 목록
function overview(slide: PSlide, S: Shapes, s: Slide) {
  const n = bigNumber(s.title) ?? String(s.bullets.length);
  const lw = span(4);
  slide.addText(
    [
      { text: n, options: { fontSize: 88, bold: true, color: NAVY } },
      { text: " 건", options: { fontSize: 28, bold: true, color: NAVY } },
    ],
    t({ x: X, y: TOP, w: lw, h: 1.6, valign: "bottom" }),
  );
  slide.addText("이 자리에서 맡게 될 업무", t({ x: X, y: TOP + 1.7, w: lw, h: 0.4, fontSize: 14, color: MUTED }));
  bar(slide, S, X, TOP + 2.25, 1.1, 0.06, TEAL);
  slide.addText("근거 상태는 위 칩으로 표시했습니다. '검토 필요'·'못 찾음' 업무는 팀장과 범위를 확인하세요.", t({ x: X, y: TOP + 2.5, w: lw - 0.2, h: 1.2, fontSize: 12, color: INK, valign: "top" }));
  const rx = X + lw + 0.4;
  vrule(slide, S, rx - 0.2, TOP, BOTTOM - TOP);
  list(slide, S, s.bullets, true, rx, TOP, X + W - rx, BOTTOM - TOP);
}

function explain(slide: PSlide, S: Shapes, s: Slide) {
  const basisH = s.basis ? 0.8 : 0;
  const h = BOTTOM - TOP - (basisH ? basisH + 0.25 : 0);
  const [main, ...rest] = s.bullets;
  const mw = rest.length ? span(8) : W;
  slide.addText(
    [
      { text: s.id === "summary" ? "한눈에 보기" : "이 업무는", options: { bold: true, color: TEAL_DEEP, fontSize: 12, breakLine: true } },
      { text: main ?? "", options: { color: INK, fontSize: (main ?? "").length > 160 ? 18 : 22, paraSpaceBefore: 8 } },
    ],
    t({ x: X, y: TOP, w: mw - 0.2, h, valign: "top", lineSpacingMultiple: 1.25, fit: "shrink" }),
  );
  if (rest.length) {
    const rx = X + mw + 0.2;
    vrule(slide, S, rx - 0.2, TOP, h);
    slide.addText(
      [
        { text: s.id === "summary" ? "이어서 볼 내용" : "유의할 점", options: { bold: true, color: TONE.warn.ink, fontSize: 12, breakLine: true } },
        ...rest.map((r, k) => ({ text: r, options: { color: INK, fontSize: 14, paraSpaceBefore: 8, breakLine: k < rest.length - 1 } })),
      ],
      t({ x: rx + 0.1, y: TOP, w: X + W - rx - 0.1, h, valign: "top", lineSpacingMultiple: 1.25, fit: "shrink" }),
    );
  }
  if (basisH) basisStrip(slide, S, s, BOTTOM - basisH, basisH);
}

// P08 왼쪽→오른쪽 시간표: 첫 단계만 청록으로 강조
function steps(slide: PSlide, S: Shapes, s: Slide) {
  const n = s.bullets.length;
  const gap = 0.3;
  const w = (W - gap * (n - 1)) / n;
  const lineY = TOP + 0.45;
  rule(slide, S, X, lineY, W, LINE, 1.5);
  rule(slide, S, X, lineY, w / 2 + 0.25, TEAL, 3);
  s.bullets.forEach((text, k) => {
    const x = X + k * (w + gap);
    const on = k === 0;
    slide.addText(String(k + 1), t({ shape: S.ellipse, x: x, y: lineY - 0.25, w: 0.5, h: 0.5, fill: { color: on ? TEAL_DEEP : "FFFFFF" }, line: { color: on ? TEAL_DEEP : NAVY, width: 1.5 }, color: on ? "FFFFFF" : NAVY, fontSize: 14, bold: true, align: "center", valign: "middle" }));
    slide.addText(on ? "먼저" : `${k + 1}단계`, t({ x, y: lineY + 0.45, w, h: 0.3, fontSize: 11, bold: true, color: on ? TEAL_DEEP : MUTED }));
    slide.addText(text, t({ x, y: lineY + 0.8, w: w - 0.1, h: BOTTOM - lineY - 0.8, fontSize: n > 4 ? 14 : 16, color: INK, valign: "top", lineSpacingMultiple: 1.2, fit: "shrink" }));
  });
}

// P06 표: 세로선 없음, 머리 아래 남색 굵은 선, 행은 가는 선
function table(slide: PSlide, s: Slide) {
  const rows = s.bullets.map(splitRow);
  const fs = rows.length > 8 ? 11 : 14;
  const none = { type: "none" as const };
  const thin = { type: "solid" as const, pt: 0.75, color: LINE };
  const headB: [PptxGenJS.BorderProps, PptxGenJS.BorderProps, PptxGenJS.BorderProps, PptxGenJS.BorderProps] = [none, none, { type: "solid", pt: 1.5, color: NAVY }, none];
  const rowB: typeof headB = [none, none, thin, none];
  const head = { bold: true, color: NAVY, border: headB, fontSize: 12 };
  slide.addTable(
    [
      [{ text: "자리·부서", options: head }, { text: "함께 볼 내용", options: head }],
      ...rows.map(([a, b]) => [
        { text: a || "관련", options: { bold: true, color: NAVY, border: rowB } },
        { text: b, options: { border: rowB } },
      ]),
    ],
    { x: X, y: TOP, w: W, colW: [span(4), W - span(4)], fontFace: FONT, fontSize: fs, color: INK, margin: [0.1, 0.1, 0.1, 0], valign: "top", autoPage: false },
  );
}

function questions(slide: PSlide, S: Shapes, s: Slide) {
  const n = s.bullets.length;
  const lw = span(8);
  const h = Math.min(1.0, (BOTTOM - TOP - 0.2 * (n - 1)) / n);
  s.bullets.forEach((q, k) => {
    const y = TOP + k * (h + 0.2);
    slide.addText("Q", t({ x: X, y, w: 0.5, h, fontSize: 24, bold: true, color: TEAL, valign: "middle" }));
    slide.addText(q, t({ x: X + 0.6, y, w: lw - 0.6, h, color: INK, fontSize: 18, valign: "middle", fit: "shrink" }));
    rule(slide, S, X, y + h + 0.1, lw);
  });
  const rx = X + lw + 0.4;
  bar(slide, S, rx, TOP, X + W - rx, BOTTOM - TOP, TINT);
  slide.addText(
    [
      { text: "AI 주무관 답변 원칙", options: { bold: true, color: TEAL_DEEP, fontSize: 13, breakLine: true } },
      { text: "내려받은 지침·분장사무 안에서만 답합니다.", options: { color: INK, fontSize: 13, paraSpaceBefore: 10, breakLine: true } },
      { text: "답에는 근거 문서와 쪽을 함께 붙입니다.", options: { color: INK, fontSize: 13, paraSpaceBefore: 10, breakLine: true } },
      { text: "근거를 못 찾으면 '확인 필요'로 남깁니다.", options: { color: INK, fontSize: 13, paraSpaceBefore: 10 } },
    ],
    t({ x: rx + 0.3, y: TOP + 0.3, w: X + W - rx - 0.6, h: BOTTOM - TOP - 0.6, valign: "top" }),
  );
}

// P07 장 구분: 남색 전면, 큰 번호, 이 장에서 다룰 제목 목록
function section(slide: PSlide, S: Shapes, s: Slide, i: number, total: number, note: string) {
  slide.background = { color: NAVY };
  slide.addText(HEADER, t({ x: X, y: 0.25, w: 7, h: 0.3, fontSize: 10, color: "C9CFEA", valign: "middle" }));
  badge(slide, S, X + W - 2.75, 0.25);
  slide.addText(s.tag ?? "", t({ x: X, y: 1.6, w: 3, h: 1.2, fontSize: 72, bold: true, color: TEAL, valign: "bottom" }));
  slide.addText(s.title, t({ x: X, y: 2.9, w: span(7), h: 0.9, fontSize: 36, bold: true, color: "FFFFFF", valign: "top", fit: "shrink" }));
  bar(slide, S, X, 3.95, 1.1, 0.06, TEAL);
  const rx = X + span(7) + 0.2;
  s.bullets.forEach((b, k) => {
    const y = 1.9 + k * 0.62;
    rule(slide, S, rx, y, X + W - rx, "3A4BA6");
    slide.addText(b, t({ x: rx, y, w: X + W - rx, h: 0.62, fontSize: 15, color: "FFFFFF", valign: "middle", fit: "shrink" }));
  });
  footer(slide, S, { ...s, sources: undefined }, i, total, note, true);
}

// P12 보고서 표지: 문서 종류 → 제목 → 부제 → 일자·작성 → 시정슬로건
function cover(slide: PSlide, S: Shapes, s: Slide, i: number, total: number, note: string, logo?: string) {
  slide.background = { color: "FFFFFF" };
  bar(slide, S, 0, 0, 0.3, 7.5, NAVY);
  bar(slide, S, 0.3, 0, 0.06, 7.5, TEAL);
  slide.addText("업무 인수인계 안내", t({ x: 1.0, y: 0.6, w: 6, h: 0.4, fontSize: 14, bold: true, color: TEAL_DEEP, valign: "middle" }));
  badge(slide, S, X + W - 2.75, 0.65);
  slide.addText(s.title, t({ x: 1.0, y: 1.6, w: 11.2, h: 1.5, fontSize: 40, bold: true, color: NAVY, valign: "bottom", fit: "shrink" }));
  bar(slide, S, 1.0, 3.3, 1.4, 0.08, TEAL);
  slide.addText(s.subtitle ?? "", t({ x: 1.0, y: 3.5, w: 11.2, h: 0.5, fontSize: 20, color: INK }));
  if (s.bullets.length) {
    slide.addText(s.bullets.join("\n"), t({ x: 1.0, y: 4.2, w: 9.5, h: 1.0, fontSize: 14, color: MUTED, valign: "top", lineSpacingMultiple: 1.3, fit: "shrink" }));
  }
  rule(slide, S, 1.0, 5.6, 11.73);
  slide.addText(
    [
      { text: officialDate(), options: { bold: true, color: NAVY, breakLine: true } },
      { text: COVER_NOTE, options: { color: MUTED, fontSize: 11 } },
    ],
    t({ x: 1.0, y: 5.75, w: 6.5, h: 0.75, fontSize: 14, valign: "top" }),
  );
  // 가로형 로고타입 원본 1565x157 → 높이 0.42in, 비율 고정
  const lh = 0.42;
  if (logo) slide.addImage({ data: logo, x: 12.73 - lh * (1565 / 157), y: 5.85, w: lh * (1565 / 157), h: lh });
  slide.addText(note, t({ x: 1.0, y: 6.97, w: 9, h: 0.3, fontSize: 8, color: MUTED, valign: "middle" }));
  slide.addText(`${i + 1} / ${total}`, t({ x: 13.33 / 2 - 0.6, y: 6.97, w: 1.2, h: 0.3, fontSize: 10, bold: true, color: NAVY, align: "center", valign: "middle" }));
}

// logo: 시정슬로건 가로형 PNG의 data URL. 없으면 표지에 로고를 넣지 않는다.
export async function buildPptx(input: Slide[], fileName: string, sourceNote: string, logo?: string) {
  const { default: Pptx } = await import("pptxgenjs");
  const pptx = new Pptx();
  pptx.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 in
  pptx.title = fileName;
  const S = pptx.ShapeType;
  const slides = withSections(input);

  slides.forEach((s, i) => {
    const slide = pptx.addSlide();
    const layout = layoutOf(s);
    if (layout === "cover") return cover(slide, S, s, i, slides.length, sourceNote, logo);
    if (layout === "section") return section(slide, S, s, i, slides.length, sourceNote);
    frame(slide, S, s);
    if (layout === "overview") overview(slide, S, s);
    else if (layout === "explain") explain(slide, S, s);
    else if (layout === "steps") steps(slide, S, s);
    else if (layout === "table") table(slide, s);
    else if (layout === "questions") questions(slide, S, s);
    else {
      list(slide, S, s.bullets, s.bullets.length <= 16, X, TOP, W, BOTTOM - TOP - (s.basis ? 1.05 : 0));
      if (s.basis) basisStrip(slide, S, s, BOTTOM - 0.8, 0.8);
    }
    footer(slide, S, s, i, slides.length, sourceNote);
  });
  return pptx;
}

async function loadLogo(): Promise<string | undefined> {
  try {
    const blob = await (await fetch(SLOGAN_LOGO)).blob();
    return await new Promise((ok, fail) => {
      const r = new FileReader();
      r.onload = () => ok(r.result as string);
      r.onerror = fail;
      r.readAsDataURL(blob);
    });
  } catch {
    return undefined;
  }
}

export async function downloadPptx(slides: Slide[], fileName: string, sourceNote: string) {
  const pptx = await buildPptx(slides, fileName, sourceNote, await loadLogo());

  // 파일 이름이 한글이어도 그대로 저장되도록 직접 내려받기 링크를 만든다.
  const blob = (await pptx.write({ outputType: "blob" })) as Blob;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${fileName}.pptx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
