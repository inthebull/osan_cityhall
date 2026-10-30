// 브라우저에서 인수인계 슬라이드를 .pptx로 저장한다.
import type { Slide } from "./deck";

const NAVY = "24344C";
const MINT = "1F9A7C";
const PAPER = "F6EFE2";
const FONT = "맑은 고딕";

export async function downloadPptx(slides: Slide[], fileName: string, sourceNote: string) {
  const { default: PptxGenJS } = await import("pptxgenjs");
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 in
  pptx.title = fileName;

  slides.forEach((s, i) => {
    const slide = pptx.addSlide();
    slide.background = { color: s.kind === "cover" ? NAVY : PAPER };
    const dark = s.kind === "cover";
    const fg = dark ? "FFFFFF" : NAVY;

    slide.addText("AI 초안 · 최종 판단은 담당자", {
      x: 9.6, y: 0.25, w: 3.4, h: 0.35, fontFace: FONT, fontSize: 11, bold: true,
      color: dark ? NAVY : "FFFFFF", fill: { color: dark ? PAPER : MINT }, align: "center",
    });

    if (s.kind === "cover") {
      slide.addText(s.title, { x: 0.8, y: 2.2, w: 11.7, h: 1.2, fontFace: FONT, fontSize: 40, bold: true, color: fg });
      slide.addText(s.subtitle ?? "", { x: 0.8, y: 3.4, w: 11.7, h: 0.6, fontFace: FONT, fontSize: 20, color: "D7F3EA" });
      slide.addText(s.bullets.join("\n"), { x: 0.8, y: 4.4, w: 11.7, h: 1.4, fontFace: FONT, fontSize: 18, color: fg, valign: "top" });
    } else {
      slide.addText(s.title, { x: 0.6, y: 0.7, w: 12.1, h: 0.9, fontFace: FONT, fontSize: 30, bold: true, color: fg });
      let y = 1.6;
      if (s.tag || s.subtitle) {
        slide.addText([s.tag, s.subtitle].filter(Boolean).join("  ·  "), {
          x: 0.6, y, w: 12.1, h: 0.45, fontFace: FONT, fontSize: 15, color: MINT, bold: true,
        });
        y += 0.6;
      }
      const many = s.bullets.length > 8;
      slide.addText(
        s.bullets.map((b) => ({ text: b, options: { bullet: s.kind === "firstweek" ? { type: "number" as const } : true } })),
        { x: 0.6, y, w: 12.1, h: s.basis ? 3.4 : 4.6, fontFace: FONT, fontSize: many ? 13 : 18, color: NAVY, valign: "top", paraSpaceAfter: 6 },
      );
      if (s.sources?.length) {
        const refs = [...new Set(s.sources.map((x) => `${x.title} ${x.page}쪽`))].join(" · ");
        slide.addText(`근거: ${refs}`, {
          x: 0.6, y: 6.35, w: 12.1, h: 0.5, fontFace: FONT, fontSize: 10, color: MINT, valign: "top",
        });
      }
      if (s.basis) {
        const label = s.basis.strength === "direct" ? "근거 확인" : s.basis.strength === "review" ? "근거 검토 필요" : "확인 필요";
        slide.addText(`근거 (${label})\n${s.basis.text}`, {
          x: 0.6, y: 5.3, w: 12.1, h: 1.1, fontFace: FONT, fontSize: 13, color: NAVY,
          fill: { color: s.basis.strength === "direct" ? "D7F3EA" : "FDE2E1" }, margin: 8,
        });
      }
    }
    slide.addText(`${sourceNote}  ·  ${i + 1}/${slides.length}`, {
      x: 0.6, y: 6.9, w: 12.1, h: 0.35, fontFace: FONT, fontSize: 9, color: dark ? "D7F3EA" : "6B7280",
    });
  });

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
