// data/ 아래 JSON을 스키마로 검사하고, 방-부서 연결과 개인정보 패턴을 확인한다.
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

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

// 게임 청사 배치(hall.json): 방 ID 중복, 안내도 좌표 범위, 부서 연결
const hall = read("data/map/hall.json");
const seen = new Set<string>();
for (const f of hall.floors) {
  for (const r of f.rooms) {
    if (seen.has(r.id)) errors.push(`hall.json: 방 ID ${r.id} 중복`);
    seen.add(r.id);
    const fr = hall.plan_frame;
    const rects: number[][] = Array.isArray(r.plan[0]) ? r.plan : [r.plan];
    for (const [x1, y1, x2, y2] of rects) {
      if (x1 < fr.x0 || y1 < fr.y0 || x2 > fr.x1 || y2 > fr.y1 || x1 >= x2 || y1 >= y2) errors.push(`hall.json: ${f.id}/${r.id} 안내도 좌표 범위 밖`);
    }
    if (r.dept_id && !deptIds.has(r.dept_id)) errors.push(`hall.json: ${r.id}의 dept_id ${r.dept_id}가 orgs.json에 없음`);
  }
}
for (const o of orgs as { dept_id: string; room_ids?: string[] }[]) {
  for (const id of o.room_ids ?? []) {
    const inFloors = readdirSync(join(root, "data/map/floors")).some((f) => read(`data/map/floors/${f}`).rooms.some((r: { id: string }) => r.id === id));
    if (!seen.has(id) && !inFloors) errors.push(`orgs.json: ${o.dept_id}의 방 ${id}가 지도에 없음`);
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
