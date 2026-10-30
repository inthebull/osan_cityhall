// pingpong_zero 결과(tasks.csv, tasks_basis.csv) → data/kb/duties.json
// 사용: npx tsx scripts/import-pingpong.ts <pingpong_zero/data/tasks 폴더>
// 성명·전화번호는 넣지 않는다. 자리(직무)는 원본 업무 목록의 한 줄(원본행) 단위로 묶는다.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
if (!dir) {
  console.error("pingpong_zero/data/tasks 폴더 경로가 필요합니다.");
  process.exit(1);
}

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const s = text.replace(/^﻿/, "");
  const endCell = () => {
    row.push(cell);
    cell = "";
  };
  const endRow = () => {
    endCell();
    rows.push(row);
    row = [];
  };
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") endCell();
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      endRow();
    } else cell += ch;
  }
  if (cell || row.length) endRow();
  const [head, ...body] = rows;
  return body.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}

const DEPTS: { dept_id: string; code: string; match: (과: string) => boolean }[] = [
  { dept_id: "D-CIVIL", code: "CIVIL", match: (g) => g === "민원여권과" },
  { dept_id: "D-ELDER", code: "ELDER", match: (g) => g === "노인장애인과" },
  { dept_id: "D-DONG", code: "DONG", match: (g) => g.startsWith("세마동") },
];

const tasks = parseCsv(readFileSync(join(dir, "tasks.csv"), "utf8"));
const basis = new Map(parseCsv(readFileSync(join(dir, "tasks_basis.csv"), "utf8")).map((r) => [r["업무ID"], r]));

// "법규명 별표 1(제3조 관련) 23. 항목" → 법규·위치·항목
function splitBasis(raw: string) {
  const m = raw.match(/^(.*?) (별표 \d+\([^)]*\)|제\d+조(?:의\d+)?) (\d+)\. (.+)$/);
  if (!m) return null;
  return { law: m[1].replace(/^\[[^\]]*\] /, ""), article: m[2], item_no: Number(m[3]), item: m[4] };
}

const seats: unknown[] = [];
for (const d of DEPTS) {
  const rows = tasks.filter((t) => d.match(t["과"]));
  const byLine = new Map<string, Record<string, string>[]>();
  for (const r of rows) byLine.set(r["원본행"], [...(byLine.get(r["원본행"]) ?? []), r]);
  const counter = new Map<string, number>();
  for (const [, list] of [...byLine].sort((a, b) => Number(a[0]) - Number(b[0]))) {
    const first = list[0];
    const role = first["직위"] || "주무관";
    // 과장·동장은 팀에 속하지 않는다. 팀 이름 띄어쓰기는 하나로 맞춘다.
    const team = ["과장", "동장"].includes(role) ? "" : first["팀"].trim().replace("찾아가는보건복지팀", "찾아가는 보건복지팀");
    const key = `${team}|${role}`;
    const n = (counter.get(key) ?? 0) + 1;
    counter.set(key, n);
    const seat_no = seats.filter((s) => (s as { dept_id: string }).dept_id === d.dept_id).length + 1;
    seats.push({
      seat_id: `S-${d.code}-${String(seat_no).padStart(2, "0")}`,
      dept_id: d.dept_id,
      team: team || null,
      role,
      label: `${team ? `${team} ` : ""}${role}${role === "주무관" ? ` ${n}` : ""}`.trim(),
      tasks: list.map((t) => {
        const b = basis.get(t["업무ID"]);
        const parsed = b?.["근거1"] ? splitBasis(b["근거1"]) : null;
        return {
          task_id: t["업무ID"],
          title: t["업무"].trim(),
          kind: t["유형"],
          label: b?.["라벨"] ?? "근거없음",
          basis: parsed && b ? { ...parsed, score: Number(b["점수1"]) || 0 } : null,
          other_dept: b?.["타부서근거"] ? b["타부서근거"].split(" | ")[0].trim() : null,
        };
      }),
    });
  }
}

const out = {
  source: "오산시 홈페이지 직원 업무 목록(성명 가림) + 오산시 행정기구 및 정원 조례 시행규칙 별표 분장사무, pingpong_zero 정리본",
  source_url: "https://www.osan.go.kr/portal/staff/list.do",
  law_url: "https://www.law.go.kr/자치법규/오산시행정기구및정원조례시행규칙",
  fetched_at: "2026-10-30",
  seats,
};
writeFileSync(join(process.cwd(), "data", "kb", "duties.json"), JSON.stringify(out, null, 2) + "\n");
console.log(`자리 ${seats.length}개 저장: ${DEPTS.map((d) => `${d.dept_id} ${seats.filter((s) => (s as { dept_id: string }).dept_id === d.dept_id).length}`).join(", ")}`);
