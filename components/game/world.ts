import hall from "@/data/map/hall.json";

// 본관 1~5층 배치는 오산시청 층별 안내도(public/floorplans/main-*.png)의 벽선 픽셀 좌표를 그대로 옮긴 것이다.
// hall.json의 plan 좌표(안내도 픽셀)를 화면 격자(size.w × size.h)로 바꿔 벽·방·복도를 만든다.

export const TILE = 32;
export const MAP_W: number = hall.size.w;
export const MAP_H: number = hall.size.h;

export type FloorId = "f1" | "f2" | "f3" | "f4" | "f5" | "ax";

export type Action = "talk" | "floors" | "pingpong" | "minwon" | "portal";

// ai: AI 주무관 근무(불 켜진 방), feature: 로비 업무 안내 등, planned: AI 주무관 채용 예정 부서(불 꺼진 방),
// place: 부서가 아닌 이름 있는 공간(시장실·회의실 등), utility: 화장실·계단·공조실·창고, void: 안내도의 빈 칸, facility: 엘리베이터·통로
export type RoomKind = "ai" | "feature" | "planned" | "place" | "utility" | "void" | "facility";

export type Rect = { x: number; y: number; w: number; h: number };

export type RoomRect = Rect & {
  id: string;
  name: string;
  kind: RoomKind;
  ground: string;
  parts: Rect[];
};

export type Spot = {
  id: string;
  kind: RoomKind;
  x: number;
  y: number;
  title: string;
  action: Action;
  lines: string[];
  stamp?: string;
  portal?: FloorId;
  actor: boolean;
};

export type Prop = {
  sprite: number;
  x: number;
  y: number;
  solid: boolean;
  hw: number;
  hh: number;
};

export type Decor = {
  kind: "shelf" | "sofa" | "cooler" | "screen" | "table" | "bench" | "stairs";
  x: number;
  y: number;
  w: number;
  h: number;
  dir?: "x" | "y";
};

export type FloorMap = {
  id: FloorId;
  name: string;
  grid: string[];
  props: Prop[];
  spots: Spot[];
  decors: Decor[];
  rooms: RoomRect[];
  spawn: { x: number; y: number };
};

type Door = "n" | "s" | "e" | "w";
type PlanRect = [number, number, number, number];

type RoomJson = {
  id: string;
  name: string;
  plan: PlanRect | PlanRect[];
  door: Door;
  use: "dept" | "place" | "utility" | "void";
  floor?: string;
  action?: Action;
  lines?: string[];
  stamp?: string;
  dept_id?: string | null;
};

type FloorJson = {
  id: FloorId;
  name: string;
  outline: PlanRect[];
  spawn: [number, number];
  rooms: RoomJson[];
  elevators?: [number, number][];
  portals?: { at: [number, number]; to: FloorId; title: string; line: string }[];
  npcs?: { id: string; title: string; at: [number, number]; action: Action; stamp?: string; lines: string[] }[];
};

const FRAME = hall.plan_frame;
const FLOOR_ORDER: FloorId[] = ["f1", "f2", "f3", "f4", "f5", "ax"];

export const PLANNED_LINE =
  "이 부서는 AI 주무관 채용 예정입니다. 지금은 민원여권과, 노인장애인과, 동 행정복지센터에서 AI 주무관이 근무합니다.";

// 안내도 픽셀 → 격자 칸(벽선이 놓이는 칸)
function col(px: number) {
  return Math.round(((px - FRAME.x0) / (FRAME.x1 - FRAME.x0)) * (MAP_W - 1));
}
function row(py: number) {
  return Math.round(((py - FRAME.y0) / (FRAME.y1 - FRAME.y0)) * (MAP_H - 1));
}
function toWorld(p: [number, number]) {
  return {
    x: (((p[0] - FRAME.x0) / (FRAME.x1 - FRAME.x0)) * (MAP_W - 1) + 0.5) * TILE,
    y: (((p[1] - FRAME.y0) / (FRAME.y1 - FRAME.y0)) * (MAP_H - 1) + 0.5) * TILE,
  };
}

function rectsOf(plan: PlanRect | PlanRect[]): PlanRect[] {
  return Array.isArray(plan[0]) ? (plan as PlanRect[]) : [plan as PlanRect];
}

function kindOf(room: RoomJson): RoomKind {
  if (room.use === "utility") return "utility";
  if (room.use === "void") return "void";
  if (room.use === "place") return "place";
  return room.dept_id ? "ai" : "planned";
}

export function floorList(): { id: FloorId; name: string }[] {
  return FLOOR_ORDER.filter((id) => id !== "ax").map((id) => ({ id, name: FLOORS[id].name }));
}

export function directory(): {
  id: FloorId;
  name: string;
  places: { id: string; title: string; kind: RoomKind }[];
}[] {
  return FLOOR_ORDER.map((id) => {
    const spots = FLOORS[id].spots;
    const elevator = spots.find((spot) => spot.action === "floors");
    const order: Record<string, number> = { feature: 0, ai: 0, planned: 1, place: 2, facility: 3 };
    const places = spots
      .filter((spot) => spot.action !== "floors" || spot === elevator)
      .map((spot) => ({ id: spot.id, title: spot.title, kind: spot.kind }))
      .sort((a, b) => (order[a.kind] ?? 9) - (order[b.kind] ?? 9));
    return { id, name: id === "ax" ? "별관" : FLOORS[id].name.replace("본관 ", ""), places };
  });
}

const MEETING = /회의|상황실|교육장|다목적|본회의장|휴게|방송|송고|공유오피스|발간|작업장/;
const EXEC = /시장실|부시장실|국장실|의장실|부의장실|전문위원실|정책자문실/;

function propAt(x: number, y: number, sprite: number, solid = false): Prop {
  return { sprite, x: x * TILE, y: y * TILE, solid, hw: solid ? 12 : 0, hh: solid ? 8 : 0 };
}

type Built = { props: Prop[]; decors: Decor[] };

// 문 쪽에서 안쪽으로 향하는 축. 사람과 동선은 문 앞에 두고 책상은 그 바깥에 놓는다.
function inward(door: Door): [number, number] {
  if (door === "s") return [0, -1];
  if (door === "n") return [0, 1];
  if (door === "e") return [-1, 0];
  return [1, 0];
}

function furnish(room: RoomJson, kind: RoomKind, r: Rect, doorAt: { x: number; y: number } | null, out: Built) {
  const { props, decors } = out;
  const x0 = r.x;
  const y0 = r.y;
  const x1 = r.x + r.w;
  const y1 = r.y + r.h;
  if (kind === "void") return;
  if (kind === "utility") {
    if (room.name === "계단") {
      const along: "x" | "y" = r.w >= r.h ? "x" : "y";
      decors.push({ kind: "stairs", x: x0 * TILE + 4, y: y0 * TILE + 4, w: r.w * TILE - 8, h: r.h * TILE - 8, dir: along });
    } else if (room.name === "공조실" || room.name === "창고") {
      if (r.w >= 2 && r.h >= 2) {
        props.push(propAt(x0 + 0.7, y0 + 0.9, 5, true));
        if (r.w >= 3) props.push(propAt(x1 - 0.7, y0 + 0.9, 5, true));
      }
    }
    return;
  }
  if (r.w < 2 || r.h < 2) return;
  const [ix, iy] = inward(room.door);
  const dx = doorAt ? doorAt.x : x0 + r.w / 2;
  const dy = doorAt ? doorAt.y : y0 + r.h / 2;
  // 문에서 안쪽으로 이어지는 통로 근처는 비워 둔다.
  const lane = (px: number, py: number) => {
    const t = (px - dx) * ix + (py - dy) * iy;
    const side = Math.abs((px - dx) * iy - (py - dy) * ix);
    return t > -0.5 && t < 3.6 && side < 1.7;
  };
  const inside = (px: number, py: number, m = 0.9) => px > x0 + m && px < x1 - m && py > y0 + m && py < y1 - m;

  // 뒤쪽 모서리: 캐비닛과 화분
  const corners: [number, number][] = [
    [x0 + 0.7, y0 + 0.8],
    [x1 - 0.7, y0 + 0.8],
    [x0 + 0.7, y1 - 0.6],
    [x1 - 0.7, y1 - 0.6],
  ];
  let c = 0;
  for (const [px, py] of corners) {
    if (lane(px, py) || !inside(px, py, 0.4)) continue;
    props.push(propAt(px, py, c % 2 === 0 ? 1 : 5, c % 2 === 1));
    c++;
    if (c >= 2) break;
  }

  if (room.floor === "g") {
    for (let py = y0 + 1.5; py < y1 - 1; py += 2.6) {
      for (let px = x0 + 1.5; px < x1 - 1; px += 2.8) {
        if (lane(px, py)) continue;
        props.push(propAt(px, py, 1));
      }
    }
    decors.push({ kind: "bench", x: (x0 + 1.2) * TILE, y: (y0 + r.h / 2) * TILE, w: 40, h: 12 });
    return;
  }

  if (room.id === "guide" || room.id === "nh") {
    const cx = x0 + r.w / 2;
    const cy = y0 + r.h / 2 + iy * 0.2;
    props.push(propAt(cx, cy + 0.4, 3, true));
    if (room.id === "nh") props.push(propAt(cx, cy + 2.4, 3, true));
    return;
  }

  if (MEETING.test(room.name) && r.w >= 3 && r.h >= 3) {
    const tw = Math.max(1, r.w - 3.2);
    const th = Math.max(1, r.h - 3.2);
    const tx = x0 + (r.w - tw) / 2;
    const ty = y0 + (r.h - th) / 2;
    if (room.name.includes("본회의장")) {
      for (let py = y0 + 1.6; py < y1 - 1.6; py += 1.4) {
        for (let px = x0 + 1.4; px < x1 - 2.4; px += 1.5) if (!lane(px, py)) props.push(propAt(px, py, 4));
      }
      decors.push({ kind: "table", x: (x1 - 1.6) * TILE, y: (y0 + 1.5) * TILE, w: TILE, h: (r.h - 3) * TILE });
      return;
    }
    decors.push({ kind: "table", x: tx * TILE, y: ty * TILE, w: tw * TILE, h: th * TILE });
    for (let px = tx + 0.5; px < tx + tw; px += 1.2) {
      props.push(propAt(px, ty - 0.35, 4));
      props.push(propAt(px, ty + th + 0.55, 4));
    }
    if (room.name.includes("상황실") || room.name.includes("영상")) {
      decors.push({ kind: "screen", x: (x0 + 0.6) * TILE, y: (y0 + 0.3) * TILE, w: Math.min(3, r.w - 1.2) * TILE, h: 4 });
    }
    return;
  }

  if (EXEC.test(room.name)) {
    const bx = x0 + r.w / 2;
    const by = room.door === "n" ? y1 - 1.1 : y0 + 1.3;
    if (!lane(bx, by)) props.push(propAt(bx, by, 0, true));
    if (r.w >= 4 && r.h >= 4) {
      decors.push({ kind: "sofa", x: (x0 + 0.8) * TILE, y: (y0 + r.h / 2 - 0.4) * TILE, w: 14, h: 40 });
      decors.push({ kind: "table", x: (x0 + 1.6) * TILE, y: (y0 + r.h / 2 - 0.3) * TILE, w: 26, h: 30 });
    }
    return;
  }

  // 일반 사무실: 책상 줄. 문 앞 동선은 비운다.
  let n = 0;
  for (let py = y0 + 1.3; py < y1 - 0.7; py += 2.3) {
    for (let px = x0 + 1.4; px < x1 - 0.9; px += 2.1) {
      if (lane(px, py) || lane(px, py + 0.7) || !inside(px, py, 0.8)) continue;
      props.push(propAt(px, py, 0, true));
      props.push(propAt(px, py + 0.75, 4));
      n++;
      if (n > 18) return;
    }
  }
  if (r.h >= 4 && r.w >= 5) {
    const sx = room.door === "e" ? x0 + 0.25 : x1 - 0.65;
    if (!lane(sx, y0 + r.h / 2)) decors.push({ kind: "shelf", x: sx * TILE, y: (y0 + 1.2) * TILE, w: 12, h: Math.max(20, (r.h - 2.6) * TILE) });
  }
}

function build(f: FloorJson): FloorMap {
  const W = MAP_W;
  const H = MAP_H;
  const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
  const key = (x: number, y: number) => y * W + x;

  // 1) 바닥 윤곽과 바깥벽
  const footprint = new Set<number>();
  for (const [ax, ay, bx, by] of f.outline) {
    for (let y = row(ay); y <= row(by); y++) for (let x = col(ax); x <= col(bx); x++) if (inBounds(x, y)) footprint.add(key(x, y));
  }
  const grid: string[][] = Array.from({ length: H }, () => Array.from({ length: W }, () => " "));
  const edge = (set: Set<number>, x: number, y: number) => {
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        if (!ox && !oy) continue;
        if (!inBounds(x + ox, y + oy) || !set.has(key(x + ox, y + oy))) return true;
      }
    }
    return false;
  };
  for (const k of footprint) {
    const x = k % W;
    const y = Math.floor(k / W);
    grid[y][x] = edge(footprint, x, y) ? "#" : "m";
  }

  // 2) 방: 안내도 벽선 사각형(들)의 테두리는 벽, 안쪽은 방 바닥
  const owner = new Map<number, string>();
  const rooms: { json: RoomJson; kind: RoomKind; main: Rect; parts: Rect[]; cells: Set<number> }[] = [];
  for (const room of f.rooms) {
    const cells = new Set<number>();
    const parts: Rect[] = [];
    for (const [ax, ay, bx, by] of rectsOf(room.plan)) {
      const x0 = col(ax);
      const y0 = row(ay);
      const x1 = col(bx);
      const y1 = row(by);
      parts.push({ x: x0 + 1, y: y0 + 1, w: x1 - x0 - 1, h: y1 - y0 - 1 });
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (inBounds(x, y)) cells.add(key(x, y));
    }
    const ground = room.floor ?? (room.use === "utility" ? "t" : "w");
    for (const k of cells) {
      const x = k % W;
      const y = Math.floor(k / W);
      if (edge(cells, x, y)) {
        grid[y][x] = "#";
      } else {
        grid[y][x] = ground;
        owner.set(k, room.id);
      }
    }
    rooms.push({ json: room, kind: kindOf(room), main: parts[0], parts, cells });
  }

  // 3) 문: 방의 문 쪽 벽 가운데, 바깥이 복도인 칸을 연다.
  const corridor = (x: number, y: number) => inBounds(x, y) && grid[y][x] === "m" && !owner.has(key(x, y));
  const doors = new Map<string, { x: number; y: number }>();
  for (const room of rooms) {
    if (room.kind === "void") continue;
    const r = room.main;
    const [ix, iy] = inward(room.json.door);
    const horizontal = room.json.door === "n" || room.json.door === "s";
    const fixed = room.json.door === "s" ? r.y + r.h : room.json.door === "n" ? r.y - 1 : room.json.door === "e" ? r.x + r.w : r.x - 1;
    const from = horizontal ? r.x : r.y;
    const to = horizontal ? r.x + r.w - 1 : r.y + r.h - 1;
    const ok: number[] = [];
    for (let i = from; i <= to; i++) {
      const x = horizontal ? i : fixed;
      const y = horizontal ? fixed : i;
      if (grid[y]?.[x] !== "#") continue;
      if (!corridor(x - ix, y - iy)) continue;
      if (owner.get(key(x + ix, y + iy)) !== room.json.id) continue;
      ok.push(i);
    }
    if (!ok.length) continue;
    const mid = (from + to) / 2;
    ok.sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid));
    const first = ok[0];
    const width = to - from + 1 >= 4 ? 2 : 1;
    const cellsOpen = [first];
    if (width === 2) {
      if (ok.includes(first + 1)) cellsOpen.push(first + 1);
      else if (ok.includes(first - 1)) cellsOpen.push(first - 1);
    }
    for (const i of cellsOpen) {
      const x = horizontal ? i : fixed;
      const y = horizontal ? fixed : i;
      grid[y][x] = "m";
    }
    const center = cellsOpen.reduce((a, b) => a + b, 0) / cellsOpen.length + 0.5;
    doors.set(room.json.id, horizontal ? { x: center, y: fixed + 0.5 } : { x: fixed + 0.5, y: center });
  }

  // 4) 가구, 사람 자리, 표시
  const built: Built = { props: [], decors: [] };
  const spots: Spot[] = [];
  const rects: RoomRect[] = [];
  for (const room of rooms) {
    const json = room.json;
    const door = doors.get(json.id) ?? null;
    rects.push({ ...room.main, id: json.id, name: json.name, kind: room.kind, ground: json.floor ?? (json.use === "utility" ? "t" : "w"), parts: room.parts });
    furnish(json, room.kind, room.main, door, built);
    if (room.kind === "utility" || room.kind === "void") continue;
    const [ix, iy] = inward(json.door);
    const r = room.main;
    const depth = Math.min(1.4, (json.door === "n" || json.door === "s" ? r.h : r.w) - 0.6);
    const base = door ?? { x: r.x + r.w / 2, y: r.y + r.h / 2 };
    const sx = door ? base.x + ix * (0.5 + depth) : base.x;
    const sy = door ? base.y + iy * (0.5 + depth) : base.y;
    const actor = room.kind === "ai";
    if (actor) {
      // 주무관 뒤에 창구를 둔다.
      const cx = sx + ix * 1.1;
      const cy = sy + iy * 1.1;
      if (cx > r.x + 0.6 && cx < r.x + r.w - 0.6 && cy > r.y + 0.4 && cy < r.y + r.h - 0.4) built.props.push(propAt(cx, cy, 3, true));
    }
    spots.push({
      id: json.id,
      kind: room.kind,
      x: sx * TILE,
      y: sy * TILE,
      title: json.name,
      action: room.kind === "planned" ? "talk" : (json.action ?? "talk"),
      lines:
        room.kind === "planned"
          ? [PLANNED_LINE]
          : json.lines?.length
            ? json.lines
            : [`${json.name}입니다. 이 공간에는 AI 주무관이 근무하지 않습니다.`],
      stamp: json.stamp,
      actor,
    });
  }

  for (const [i, at] of (f.elevators ?? []).entries()) {
    const p = toWorld(at);
    spots.push({
      id: `ev-${f.id}-${i}`,
      kind: "facility",
      x: p.x,
      y: p.y,
      title: "엘리베이터",
      action: "floors",
      lines: ["본관 1층부터 5층까지 이동합니다. 별관은 3층 연결통로입니다."],
      actor: false,
    });
  }

  for (const portal of f.portals ?? []) {
    const p = toWorld(portal.at);
    const tx = Math.floor(p.x / TILE);
    const ty = Math.floor(p.y / TILE);
    for (const [x, y] of [
      [tx, ty],
      [tx + 1, ty],
    ]) {
      if (grid[y]?.[x] === "m") grid[y][x] = "r";
    }
    built.props.push({ sprite: 8, x: p.x, y: p.y - 10, solid: false, hw: 0, hh: 0 });
    spots.push({ id: `portal-${f.id}`, kind: "facility", x: p.x, y: p.y, title: portal.title, action: "portal", lines: [portal.line], portal: portal.to, actor: false });
  }

  for (const npc of f.npcs ?? []) {
    const p = toWorld(npc.at);
    built.props.push({ sprite: 8, x: p.x + 26, y: p.y - 6, solid: false, hw: 0, hh: 0 });
    spots.push({ id: npc.id, kind: "feature", x: p.x, y: p.y, title: npc.title, action: npc.action, lines: npc.lines, stamp: npc.stamp, actor: true });
  }

  const spawn = toWorld(f.spawn);
  const st = grid[Math.floor(spawn.y / TILE)]?.[Math.floor(spawn.x / TILE)];
  if (st === "#" || st === " ") throw new Error(`spawn is not walkable on ${f.id}`);

  return {
    id: f.id,
    name: f.name,
    grid: grid.map((g) => g.join("")),
    props: built.props,
    spots,
    decors: built.decors,
    rooms: rects,
    spawn,
  };
}

export const FLOORS = Object.fromEntries(
  (hall.floors as unknown as FloorJson[]).map((f) => [f.id, build(f)]),
) as Record<FloorId, FloorMap>;

// 부서 ID → 그 부서 방이 있는 층과 방 ID (업무 판정 뒤 봉투를 날릴 곳)
export const DEPT_ROOMS: Record<string, { floor: FloorId; room: string }> = Object.fromEntries(
  (hall.floors as unknown as FloorJson[]).flatMap((f) =>
    f.rooms.filter((r) => r.dept_id).map((r) => [r.dept_id as string, { floor: f.id, room: r.id }]),
  ),
);

export function tileAt(floor: FloorMap, px: number, py: number) {
  const x = Math.floor(px / TILE);
  const y = Math.floor(py / TILE);
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return "#";
  return floor.grid[y]?.[x] ?? "#";
}

export function isSolidTile(ch: string) {
  return ch === "#" || ch === " ";
}

export const QUEST: { stamp: string; hint: string }[] = [
  { stamp: "lobby", hint: "1층 로비의 AI 주무관에게 업무를 물어보세요" },
  { stamp: "minwon", hint: "1층 민원여권과 창구에 들러 보세요" },
  { stamp: "senior", hint: "1층 노인장애인과 AI 주무관을 만나 보세요" },
];

export function questHint(stamps: string[]) {
  const next = QUEST.find((q) => !stamps.includes(q.stamp));
  return next ? next.hint : "AI 주무관이 근무하는 곳을 모두 둘러보았습니다.";
}
