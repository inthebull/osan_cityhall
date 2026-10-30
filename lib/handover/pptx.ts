// 브라우저에서 인수인계 슬라이드를 .pptx로 저장한다.
// 배치 규칙은 layout.ts와 같고, 여기서는 16:9(13.33 x 7.5 in) 좌표로 그리기만 한다.
import type PptxGenJS from "pptxgenjs";
import type { Slide } from "./deck";
import { BADGE, HEADER, basisLabel, basisTone, chipsOf, gridOf, layoutOf, sourceRefs, splitRow, type Tone } from "./layout";

const NAVY = "24344C";
const MINT = "1F9A7C";
const MINT_2 = "D7F3EA";
const FOAM = "FBF7F0";
const LINE = "DDCFB6";
const MUTED = "6B7280";
const FONT = "맑은 고딕";

const TONE: Record<Tone, { fill: string; edge: string; ink: string }> = {
  ok: { fill: MINT_2, edge: MINT, ink: "14634F" },
  warn: { fill: "FCEBD3", edge: "C9843A", ink: "7A4A12" },
  bad: { fill: "FDE2E1", edge: "B84B45", ink: "8A2E2A" },
  plain: { fill: FOAM, edge: LINE, ink: NAVY },
};

// 본문 영역
const X = 0.6;
const W = 12.13;
const TOP = 2.2;
const BOTTOM = 6.2;

type PSlide = PptxGenJS.Slide;
type Shapes = PptxGenJS["ShapeType"];
type Box = { x: number; y: number; w: number; h: number };

const t = (o: PptxGenJS.TextPropsOptions): PptxGenJS.TextPropsOptions => ({ fontFace: FONT, margin: 0, ...o });

function sizeFor(h: number, len: number): number {
  const base = h >= 1.1 ? 18 : h >= 0.75 ? 15 : h >= 0.5 ? 13 : 11;
  return len > 90 ? Math.max(11, base - 3) : base;
}

function numberDot(slide: PSlide, S: Shapes, n: number, x: number, y: number, d = 0.42) {
  slide.addText(String(n), t({ shape: S.ellipse, x, y, w: d, h: d, fill: { color: MINT }, color: "FFFFFF", fontSize: 12, bold: true, align: "center", valign: "middle" }));
}

function card(slide: PSlide, S: Shapes, b: Box, tone: Tone = "plain") {
  const c = TONE[tone];
  slide.addShape(S.rect, { ...b, fill: { color: c.fill }, line: { color: c.edge, width: 0.75 } });
  slide.addShape(S.rect, { x: b.x, y: b.y, w: 0.08, h: b.h, fill: { color: c.edge }, line: { color: c.edge, width: 0 } });
}

function chrome(slide: PSlide, S: Shapes, s: Slide) {
  slide.background = { color: "FFFFFF" };
  slide.addShape(S.rect, { x: 0, y: 0, w: 13.33, h: 0.5, fill: { color: NAVY }, line: { color: NAVY, width: 0 } });
  slide.addText(HEADER, t({ x: X, y: 0.08, w: 6, h: 0.34, fontSize: 11, color: MINT_2, valign: "middle" }));
  slide.addText(BADGE, t({ x: 9.75, y: 0.09, w: 3.0, h: 0.32, fontSize: 11, bold: true, color: "FFFFFF", fill: { color: MINT }, align: "center", valign: "middle" }));

  slide.addText(s.title, t({ x: X, y: 0.75, w: W, h: 0.75, fontSize: 28, bold: true, color: NAVY, valign: "middle", fit: "shrink" }));
  slide.addShape(S.rect, { x: X, y: 1.55, w: 1.1, h: 0.07, fill: { color: MINT }, line: { color: MINT, width: 0 } });

  const chips = s.kind === "overview" ? chipsOf(s.subtitle) : [];
  if (chips.length) {
    let cx = X + 1.3;
    for (const c of chips) {
      const w = 0.25 + c.text.length * 0.16;
      slide.addText(c.text, t({ x: cx, y: 1.4, w, h: 0.38, fontSize: 12, bold: true, color: TONE[c.tone].ink, fill: { color: TONE[c.tone].fill }, align: "center", valign: "middle" }));
      cx += w + 0.15;
    }
  } else if (s.tag || s.subtitle) {
    slide.addText([s.tag, s.subtitle].filter(Boolean).join("  ·  "), t({ x: X + 1.3, y: 1.4, w: W - 1.3, h: 0.38, fontSize: 14, bold: true, color: MINT, valign: "middle", fit: "shrink" }));
  }
}

function footer(slide: PSlide, S: Shapes, s: Slide, i: number, total: number, note: string) {
  const refs = sourceRefs(s);
  if (refs.length) {
    slide.addText(
      [{ text: "근거  ", options: { bold: true, color: MINT } }, { text: refs.join(" · "), options: { color: NAVY } }],
      t({ x: X, y: 6.3, w: W, h: 0.42, fontSize: 10, valign: "top", fit: "shrink" }),
    );
  }
  slide.addShape(S.line, { x: X, y: 6.82, w: W, h: 0, line: { color: LINE, width: 0.75 } });
  slide.addText(note, t({ x: X, y: 6.9, w: W - 1, h: 0.35, fontSize: 9, color: MUTED, valign: "middle" }));
  slide.addText(`${i + 1} / ${total}`, t({ x: X + W - 1, y: 6.9, w: 1, h: 0.35, fontSize: 10, bold: true, color: NAVY, align: "right", valign: "middle" }));
}

function cards(slide: PSlide, S: Shapes, items: string[], numbered: boolean, area: Box) {
  const { cols, rows } = gridOf(items.length);
  const gap = 0.15;
  const w = (area.w - gap * (cols - 1)) / cols;
  const h = Math.min(1.2, (area.h - gap * (rows - 1)) / rows);
  items.forEach((text, k) => {
    const x = area.x + (k % cols) * (w + gap);
    const y = area.y + Math.floor(k / cols) * (h + gap);
    card(slide, S, { x, y, w, h });
    const d = Math.min(0.42, h - 0.12);
    const pad = numbered ? d + 0.3 : 0.25;
    if (numbered) numberDot(slide, S, k + 1, x + 0.18, y + (h - d) / 2, d);
    slide.addText(text, t({ x: x + pad, y, w: w - pad - 0.15, h, fontSize: sizeFor(h, text.length), color: NAVY, valign: "middle", fit: "shrink" }));
  });
}

function basisBox(slide: PSlide, S: Shapes, s: Slide, b: Box) {
  if (!s.basis) return;
  const tone = basisTone(s.basis.strength);
  card(slide, S, b, tone);
  slide.addText(
    [
      { text: `근거 · ${basisLabel(s.basis.strength)}`, options: { bold: true, color: TONE[tone].ink, breakLine: true } },
      { text: s.basis.text, options: { color: NAVY } },
    ],
    t({ x: b.x + 0.3, y: b.y, w: b.w - 0.45, h: b.h, fontSize: 12, valign: "middle", fit: "shrink" }),
  );
}

function explain(slide: PSlide, S: Shapes, s: Slide) {
  const basisH = s.basis ? 0.95 : 0;
  const h = Math.min(3.0, BOTTOM - TOP - (basisH ? basisH + 0.2 : 0));
  const [main, ...rest] = s.bullets;
  const mainW = rest.length ? 7.3 : W;
  card(slide, S, { x: X, y: TOP, w: mainW, h }, "ok");
  slide.addText(
    [
      { text: "이 업무는", options: { bold: true, color: MINT, fontSize: 13, breakLine: true } },
      { text: main ?? "", options: { color: NAVY, fontSize: (main ?? "").length > 160 ? 16 : 20 } },
    ],
    t({ x: X + 0.35, y: TOP + 0.2, w: mainW - 0.6, h: h - 0.4, valign: "top", paraSpaceBefore: 4, fit: "shrink" }),
  );
  if (rest.length) {
    const rx = X + mainW + 0.2;
    const rw = W - mainW - 0.2;
    card(slide, S, { x: rx, y: TOP, w: rw, h });
    slide.addText(
      [
        { text: s.id === "summary" ? "이어서 볼 내용" : "유의할 점", options: { bold: true, color: "C9843A", fontSize: 13, breakLine: true } },
        ...rest.map((r, k) => ({ text: r, options: { color: NAVY, fontSize: 14, breakLine: k < rest.length - 1 } })),
      ],
      t({ x: rx + 0.35, y: TOP + 0.2, w: rw - 0.55, h: h - 0.4, valign: "top", paraSpaceBefore: 4, fit: "shrink" }),
    );
  }
  if (basisH) basisBox(slide, S, s, { x: X, y: TOP + h + 0.2, w: W, h: basisH });
}

function steps(slide: PSlide, S: Shapes, s: Slide) {
  const n = s.bullets.length;
  const gap = 0.2;
  const w = (W - gap * (n - 1)) / n;
  const lineY = TOP + 0.35;
  slide.addShape(S.line, { x: X + w / 2, y: lineY, w: W - w, h: 0, line: { color: MINT, width: 2 } });
  s.bullets.forEach((text, k) => {
    const x = X + k * (w + gap);
    numberDot(slide, S, k + 1, x + w / 2 - 0.3, lineY - 0.3, 0.6);
    const y = lineY + 0.55;
    const ch = Math.min(2.3, BOTTOM - y);
    card(slide, S, { x, y, w, h: ch });
    slide.addText(text, t({ x: x + 0.25, y: y + 0.15, w: w - 0.4, h: ch - 0.3, fontSize: n > 4 ? 13 : 15, color: NAVY, valign: "top", fit: "shrink" }));
  });
}

function table(slide: PSlide, s: Slide) {
  const rows = s.bullets.map(splitRow);
  const fs = rows.length > 8 ? 11 : 14;
  const head = { bold: true, color: "FFFFFF", fill: { color: NAVY } };
  slide.addTable(
    [
      [{ text: "자리·부서", options: head }, { text: "함께 볼 내용", options: head }],
      ...rows.map(([a, b], k) => {
        const fill = { color: k % 2 ? "FFFFFF" : FOAM };
        return [{ text: a || "관련", options: { bold: true, fill } }, { text: b, options: { fill } }];
      }),
    ],
    { x: X, y: TOP, w: W, colW: [3.4, W - 3.4], fontFace: FONT, fontSize: fs, color: NAVY, border: { type: "solid", pt: 0.75, color: LINE }, margin: 0.08, autoPage: false },
  );
}

function questions(slide: PSlide, S: Shapes, s: Slide) {
  const n = s.bullets.length;
  const h = Math.min(1.0, (BOTTOM - TOP - 0.2 * (n - 1)) / n);
  s.bullets.forEach((q, k) => {
    const y = TOP + k * (h + 0.2);
    slide.addText("Q", t({ shape: S.ellipse, x: X, y: y + (h - 0.6) / 2, w: 0.6, h: 0.6, fill: { color: NAVY }, color: "FFFFFF", fontSize: 16, bold: true, align: "center", valign: "middle" }));
    slide.addShape(S.roundRect, { rectRadius: 0.15, x: X + 0.8, y, w: W - 0.8, h, fill: { color: MINT_2 }, line: { color: MINT, width: 0.75 } });
    slide.addText(q, t({ x: X + 1.1, y, w: W - 1.4, h, color: NAVY, fontSize: 18, valign: "middle", fit: "shrink" }));
  });
}

function cover(slide: PSlide, S: Shapes, s: Slide, i: number, total: number, note: string) {
  slide.background = { color: NAVY };
  slide.addShape(S.rect, { x: 0, y: 0, w: 0.35, h: 7.5, fill: { color: MINT }, line: { color: MINT, width: 0 } });
  slide.addText(HEADER, t({ x: 0.9, y: 0.45, w: 8, h: 0.4, fontSize: 14, color: MINT_2 }));
  slide.addText(BADGE, t({ x: 9.75, y: 0.45, w: 3.0, h: 0.38, fontSize: 12, bold: true, color: NAVY, fill: { color: FOAM }, align: "center", valign: "middle" }));
  slide.addText(s.title, t({ x: 0.9, y: 2.0, w: 11.6, h: 1.3, fontSize: 40, bold: true, color: "FFFFFF", valign: "bottom", fit: "shrink" }));
  slide.addShape(S.rect, { x: 0.9, y: 3.45, w: 1.4, h: 0.08, fill: { color: MINT }, line: { color: MINT, width: 0 } });
  slide.addText(s.subtitle ?? "", t({ x: 0.9, y: 3.65, w: 11.6, h: 0.5, fontSize: 20, color: MINT_2 }));
  if (s.bullets.length) {
    slide.addText(s.bullets.join("\n"), t({ x: 0.9, y: 4.5, w: 11.0, h: 1.5, fontSize: 16, color: "FFFFFF", valign: "top", fit: "shrink" }));
  }
  slide.addText(`${note}  ·  ${i + 1} / ${total}`, t({ x: 0.9, y: 6.9, w: 11.6, h: 0.35, fontSize: 9, color: MINT_2 }));
}

export async function buildPptx(slides: Slide[], fileName: string, sourceNote: string) {
  const { default: Pptx } = await import("pptxgenjs");
  const pptx = new Pptx();
  pptx.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 in
  pptx.title = fileName;
  const S = pptx.ShapeType;

  slides.forEach((s, i) => {
    const slide = pptx.addSlide();
    const layout = layoutOf(s);
    if (layout === "cover") return cover(slide, S, s, i, slides.length, sourceNote);
    chrome(slide, S, s);
    const area = { x: X, y: TOP, w: W, h: BOTTOM - TOP };
    if (layout === "explain") explain(slide, S, s);
    else if (layout === "steps") steps(slide, S, s);
    else if (layout === "table") table(slide, s);
    else if (layout === "questions") questions(slide, S, s);
    else {
      cards(slide, S, s.bullets, s.kind !== "overview" || s.bullets.length <= 16, s.basis ? { ...area, h: area.h - 1.15 } : area);
      if (s.basis) basisBox(slide, S, s, { x: X, y: BOTTOM - 0.95, w: W, h: 0.95 });
    }
    footer(slide, S, s, i, slides.length, sourceNote);
  });
  return pptx;
}

export async function downloadPptx(slides: Slide[], fileName: string, sourceNote: string) {
  const pptx = await buildPptx(slides, fileName, sourceNote);

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
