// 인수인계 PPT를 실제로 저장하고 장마다 PNG로 바꿔 눈으로 점검한다(DESIGN.md 9절 점검 순서).
// 사용: npm run render:handover [-- 자리ID ...]   결과: .render/handover/
// LibreOffice(soffice)와 poppler(pdftoppm)가 있으면 PNG까지 만들고, 없으면 .pptx만 남긴다.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildDeck, buildPackDeck, type ResolveSource } from "@/lib/handover/deck";
import { buildPptx } from "@/lib/handover/pptx";
import { PACKS, packFor } from "@/lib/handover/packs";
import { getSeat, seatsOf } from "@/lib/kb/duties";
import { loadManuals } from "@/lib/kb/manuals";
import { getDept } from "@/lib/map/data";

const OUT = join(process.cwd(), ".render", "handover");
const NOTE = "출처: 오산시 홈페이지 직원 업무 목록(성명 가림), 오산시 행정기구 및 정원 조례 시행규칙 분장사무";

const resolve: ResolveSource = (src) => {
  const doc = loadManuals().docs.find((d) => d.doc_id === src.doc_id);
  return { title: doc?.title ?? src.doc_id, page: src.page, quote: src.quote, url: doc?.source_url ?? "" };
};

function has(cmd: string, arg: string): boolean {
  try {
    execFileSync(cmd, [arg], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const logo = "data:image/png;base64," + readFileSync(join(process.cwd(), "public", "brand", "osan-slogan-h.png")).toString("base64");

  // 기본: 세 부서에서 업무가 가장 많은 자리 하나씩 + 맞춤 자료 묶음 전부
  const ids = process.argv.slice(2);
  const seats = ids.length
    ? ids.map((id) => {
        const s = getSeat(id);
        if (!s) throw new Error(`자리 없음: ${id}`);
        return s;
      })
    : ["D-CIVIL", "D-ELDER", "D-DONG"].map((d) => [...seatsOf(d)].sort((a, b) => b.tasks.length - a.tasks.length)[0]);
  const decks: { name: string; slides: ReturnType<typeof buildDeck> }[] = [];
  for (const s of seats) {
    const dept = getDept(s.dept_id)?.name ?? s.dept_id;
    decks.push({ name: s.seat_id, slides: buildDeck(s, dept, {}, (t) => packFor(t.title, s.dept_id), resolve) });
  }
  if (!ids.length) {
    for (const p of PACKS) decks.push({ name: p.pack_id, slides: buildPackDeck(p, getDept(p.dept_id)?.name ?? p.dept_id, resolve) });
  }

  for (const d of decks) {
    const pptx = await buildPptx(d.slides, d.name, NOTE, logo);
    writeFileSync(join(OUT, `${d.name}.pptx`), (await pptx.write({ outputType: "nodebuffer" })) as Buffer);
  }
  console.log(`PPT ${decks.length}개 저장: ${OUT}`);

  if (!has("soffice", "--version") || !has("pdftoppm", "-v")) {
    console.log("soffice·pdftoppm이 없어 PNG 변환은 건너뜁니다. .pptx를 직접 열어 확인하세요.");
    return;
  }
  const files = readdirSync(OUT).filter((f) => f.endsWith(".pptx"));
  execFileSync("soffice", ["--headless", "--convert-to", "pdf", "--outdir", OUT, ...files.map((f) => join(OUT, f))], { stdio: "ignore" });
  for (const f of files) {
    const base = join(OUT, f.replace(/\.pptx$/, ""));
    execFileSync("pdftoppm", ["-r", "80", "-png", `${base}.pdf`, base]);
  }
  console.log("장마다 PNG를 만들었습니다. 넘침·겹침·배지·근거 누락을 확인하세요.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
