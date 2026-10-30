// data/ 아래 JSON을 스키마로 검사하고, 방-부서 연결과 개인정보 패턴을 확인한다.
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PACKS, verifyPack } from "../lib/handover/packs";
import { loadManuals, pageText } from "../lib/kb/manuals";

const root = process.cwd();
const read = (p: string) => JSON.parse(readFileSync(join(root, p), "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const errors: string[] = [];

const floorSchema = ajv.compile(read("data/schema/map.schema.json"));
const orgs: { dept_id: string }[] = read("data/kb/orgs.json");
const deptIds = new Set(orgs.map((o) => o.dept_id));

for (const f of readdirSync(join(root, "data/map/floors"))) {
  const floor = read(`data/map/floors/${f}`);
  if (!floorSchema(floor)) errors.push(`${f}: ${ajv.errorsText(floorSchema.errors)}`);
  for (const r of floor.rooms ?? []) {
    if (r.dept_id && !deptIds.has(r.dept_id)) errors.push(`${f}: ${r.id}의 dept_id ${r.dept_id}가 orgs.json에 없음`);
  }
}

// 게임 청사 배치(hall.json): 방 ID 중복, 격자 범위, 부서 연결
const hall = read("data/map/hall.json");
const seen = new Set<string>();
for (const f of hall.floors) {
  for (const r of f.rooms) {
    if (seen.has(r.id)) errors.push(`hall.json: 방 ID ${r.id} 중복`);
    seen.add(r.id);
    if (r.x < 1 || r.y < 1 || r.x + r.w > hall.size.w - 1 || r.y + r.h > hall.size.h - 1) errors.push(`hall.json: ${f.id}/${r.id} 격자 범위 밖`);
    if (r.dept_id && !deptIds.has(r.dept_id)) errors.push(`hall.json: ${r.id}의 dept_id ${r.dept_id}가 orgs.json에 없음`);
  }
}
for (const o of orgs as { dept_id: string; room_ids?: string[] }[]) {
  for (const id of o.room_ids ?? []) {
    const inFloors = readdirSync(join(root, "data/map/floors")).some((f) => read(`data/map/floors/${f}`).rooms.some((r: { id: string }) => r.id === id));
    if (!seen.has(id) && !inFloors) errors.push(`orgs.json: ${o.dept_id}의 방 ${id}가 지도에 없음`);
  }
}

// 공개 지침 목록(data/manuals/index.json)과 쪽 텍스트 파일
const manualSchema = ajv.compile(read("data/schema/manual.schema.json"));
const manuals = read("data/manuals/index.json");
if (!manualSchema(manuals)) errors.push(`manuals/index.json: ${ajv.errorsText(manualSchema.errors)}`);
for (const m of manuals as { doc_id: string; dept_id: string }[]) {
  if (!deptIds.has(m.dept_id)) errors.push(`manuals/index.json: ${m.doc_id}의 dept_id ${m.dept_id}가 orgs.json에 없음`);
  try {
    read(`data/manuals/pages/${m.doc_id}.json`);
  } catch {
    errors.push(`manuals: pages/${m.doc_id}.json이 없거나 읽을 수 없음`);
  }
}

// 자리별 업무(data/kb/duties.json): 성명·전화번호 없이 업무와 근거만
const dutySchema = ajv.compile(read("data/schema/duty.schema.json"));
const duties = read("data/kb/duties.json");
if (!dutySchema(duties)) errors.push(`kb/duties.json: ${ajv.errorsText(dutySchema.errors)}`);
const seatIds = new Set<string>();
for (const s of (duties as { seats: { seat_id: string }[] }).seats ?? []) {
  if (seatIds.has(s.seat_id)) errors.push(`kb/duties.json: seat_id ${s.seat_id} 중복`);
  seatIds.add(s.seat_id);
}
if (/\b0\d{1,2}-?\d{3,4}-?\d{4}\b/.test(JSON.stringify(duties))) errors.push("kb/duties.json: 전화번호가 들어 있음");

// 업무별 맞춤 자료: 모든 인용이 지침 원문 해당 쪽에 그대로 있어야 한다
{
  const { docs } = loadManuals();
  const docPages = (id: string) => docs.find((d) => d.doc_id === id && d.kind !== "duty")?.pages;
  for (const pack of PACKS) errors.push(...verifyPack(pack, docPages, pageText));
}

// AI 주무관 정의(data/officers/*.json): 담당 자리와 지침이 실제로 있고 같은 부서여야 한다
{
  const officerSchema = ajv.compile(read("data/schema/officer.schema.json"));
  const manualDept = new Map((manuals as { doc_id: string; dept_id: string }[]).map((m) => [m.doc_id, m.dept_id]));
  const seatDept = new Map((duties as { seats: { seat_id: string; dept_id: string }[] }).seats.map((s) => [s.seat_id, s.dept_id]));
  for (const f of readdirSync(join(root, "data/officers"))) {
    const o = read(`data/officers/${f}`);
    if (!officerSchema(o)) errors.push(`officers/${f}: ${ajv.errorsText(officerSchema.errors)}`);
    for (const id of o.doc_ids ?? []) if (manualDept.get(id) !== o.dept_id) errors.push(`officers/${f}: 지침 ${id}가 없거나 다른 부서`);
    for (const id of o.seat_ids ?? []) if (seatDept.get(id) !== o.dept_id) errors.push(`officers/${f}: 자리 ${id}가 없거나 다른 부서`);
  }
}

// 개인정보 패턴: 주민번호, 휴대전화, 이메일
const pii: [string, RegExp][] = [
  ["주민번호", /\b\d{6}-[1-4]\d{6}\b/],
  ["휴대전화", /\b01[016789]-?\d{3,4}-?\d{4}\b/],
  ["이메일", /[\w.+-]+@[\w-]+\.[\w.]+/],
];
const walk = (dir: string): string[] =>
  readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith(".json") ? [join(dir, e.name)] : [],
  );
for (const p of walk("data")) {
  if (p.startsWith(join("data", "schema"))) continue;
  const text = readFileSync(join(root, p), "utf8");
  for (const [label, re] of pii) if (re.test(text)) errors.push(`${p}: ${label} 패턴 발견`);
}

if (errors.length) {
  console.error(`데이터 검사 실패 ${errors.length}건\n- ` + errors.join("\n- "));
  process.exit(1);
}
console.log("데이터 검사 통과");
