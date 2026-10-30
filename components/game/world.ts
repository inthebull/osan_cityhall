import hall from "@/data/map/hall.json";

export const TILE = 32;
export const MAP_W = 30;
export const MAP_H = 18;

export type FloorId = "f1" | "f2" | "f3" | "f4" | "f5" | "ax";

export type Action =
  | "talk"
  | "floors"
  | "pingpong"
  | "tool"
  | "minwon"
  | "market"
  | "roof"
  | "portal";

export type Spot = {
  id: string;
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
  kind: "rug" | "window" | "board" | "shelf" | "lamp" | "sofa" | "cooler" | "flag" | "screen" | "papers" | "mat" | "table" | "bench";
  x: number;
  y: number;
  w: number;
  h: number;
  tint?: string;
};

export type FloorMap = {
  id: FloorId;
  name: string;
  grid: string[];
  props: Prop[];
  spots: Spot[];
  labels: { x: number; y: number; text: string }[];
  decors: Decor[];
  spawn: { x: number; y: number };
};

type Door = "n" | "s" | "e" | "w";
type FloorChar = "w" | "c" | "t" | "g";

type Room = {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  floor: FloorChar;
  door: Door;
  action: Action;
  lines: string[];
  stamp?: string;
  portal?: FloorId;
  actor?: boolean;
  label?: string;
  dept_id?: string | null;
  virtual_space?: string;
  confirmed?: boolean;
};

const FLOOR_ORDER: FloorId[] = ["f1", "f2", "f3", "f4", "f5", "ax"];

export function floorList(): { id: FloorId; name: string }[] {
  return FLOOR_ORDER.filter((id) => id !== "ax").map((id) => ({
    id,
    name: FLOORS[id].name,
  }));
}

export function directory(): { id: FloorId; name: string; places: { id: string; title: string }[] }[] {
  return FLOOR_ORDER.map((id) => {
    const spots = FLOORS[id].spots;
    const elevator = spots.find((spot) => spot.action === "floors");
    const places = spots
      .filter((spot) => spot.action !== "floors" || spot === elevator)
      .map((spot) => ({ id: spot.id, title: spot.title }));
    return { id, name: id === "ax" ? "별관" : FLOORS[id].name.replace("본관 ", ""), places };
  });
}

function inside(x: number, y: number) {
  return x > 0 && y > 0 && x < MAP_W - 1 && y < MAP_H - 1;
}

function doorCells(room: Room): [number, number][] {
  const roomSpan = room.door === "n" || room.door === "s" ? room.w : room.h;
  const width = roomSpan >= 4 ? 3 : 2;
  const midX = room.x + Math.max(0, Math.floor((room.w - width) / 2));
  const midY = room.y + Math.max(0, Math.floor((room.h - width) / 2));
  const cells: [number, number][] = [];
  if (room.door === "s" || room.door === "n") {
    const y = room.door === "s" ? room.y + room.h : room.y - 1;
    for (let i = 0; i < width; i++) cells.push([midX + i, y]);
  } else {
    const x = room.door === "e" ? room.x + room.w : room.x - 1;
    for (let i = 0; i < width; i++) cells.push([x, midY + i]);
  }
  return cells;
}

function npcFeet(room: Room) {
  const midX = room.x + room.w / 2;
  const midY = room.y + room.h / 2;
  if (room.door === "s") return { x: midX * TILE, y: (room.y + room.h - 1.15) * TILE };
  if (room.door === "n") return { x: midX * TILE, y: (room.y + 1.15) * TILE };
  if (room.door === "e") return { x: (room.x + room.w - 1.15) * TILE, y: midY * TILE };
  return { x: (room.x + 1.15) * TILE, y: midY * TILE };
}

function deskFeet(room: Room) {
  let tx = room.x + room.w / 2;
  let ty = room.y + 1.3;
  if (room.door === "n") ty = room.y + room.h - 1.4;
  if (room.door === "e") {
    tx = room.x + 1.5;
    ty = room.y + room.h / 2;
  }
  if (room.door === "w") {
    tx = room.x + room.w - 1.5;
    ty = room.y + room.h / 2;
  }
  return { x: tx * TILE, y: ty * TILE };
}

const RUG_TINT: Record<string, string> = {
  tax: "#e7c49a",
  collect: "#e7c49a",
  hope: "#f0c3cf",
  nh: "#cfe3f6",
  minwon: "#f6e7a8",
  land: "#e7d3b0",
  guide: "#f3d2a2",
  hygiene: "#cfe8d4",
  senior: "#f0c3cf",
  advice: "#e6d5f2",
  jachi: "#c9ddd6",
  situ: "#c9d7e8",
  mul: "#d5ecc8",
  vice: "#e7d3a8",
  mayor: "#f0d48a",
  directors: "#e7d3a8",
  press: "#f6d0dc",
  sports: "#cfe8c0",
  meet: "#f0c9b0",
  climate: "#b7e0c2",
  jobs: "#f6e1b0",
  econ: "#f6e1b0",
  budget: "#d5d8f0",
  traffic: "#f6d7a8",
  account: "#d5d8f0",
  edu: "#c9e4f2",
  safety: "#f6c9c4",
  data: "#c9d4f0",
  roof: "#9ed39a",
  assembly: "#e6d3a4",
  "council-office": "#e7dcc8",
  members: "#e7dcc8",
  chair: "#f0d48a",
  family: "#f6d0dc",
  child: "#f6e1a8",
  lifelong: "#d4e6f6",
  culture: "#e6d0f0",
  market: "#f6e1b0",
};

function backSpot(room: Room, side: "a" | "b") {
  const left = side === "a";
  if (room.door === "s") return { x: room.x + (left ? 1.15 : room.w - 1.15), y: room.y + 1.2 };
  if (room.door === "n") return { x: room.x + (left ? 1.15 : room.w - 1.15), y: room.y + room.h - 1.25 };
  if (room.door === "e") return { x: room.x + 1.2, y: room.y + (left ? 1.25 : room.h - 1.25) };
  return { x: room.x + room.w - 1.2, y: room.y + (left ? 1.25 : room.h - 1.25) };
}

function addWindows(room: Room, decors: Decor[]) {
  if (room.door === "n" || room.door === "s") {
    const wy = (room.door === "n" ? room.y + room.h - 0.15 : room.y + 0.15) * TILE;
    for (let i = 1; i < room.w - 1; i += 2) {
      decors.push({ kind: "window", x: (room.x + i) * TILE + 6, y: wy, w: 18, h: 12 });
    }
    return;
  }
  const wx = (room.door === "w" ? room.x + room.w - 0.2 : room.x + 0.05) * TILE;
  for (let i = 1; i < room.h - 1; i += 2) {
    decors.push({ kind: "window", x: wx, y: (room.y + i) * TILE + 4, w: 12, h: 16 });
  }
}

function propAt(room: Room, sprite: number, ox: number, oy: number, solid = false): Prop {
  return { sprite, x: (room.x + ox) * TILE, y: (room.y + oy) * TILE, solid, hw: solid ? 10 : 0, hh: solid ? 8 : 0 };
}

function dress(room: Room, props: Prop[], decors: Decor[]) {
  const id = room.id;
  const paperish = ["tax", "collect", "account", "budget", "jachi", "land", "advice", "press", "econ", "jobs"];
  if (paperish.includes(id)) {
    decors.push({ kind: "papers", x: (room.x + room.w / 2 - 0.2) * TILE, y: (room.y + 1.7) * TILE, w: 18, h: 12 });
  }
  if (id === "situ" || id === "data" || id === "edu" || id === "traffic") {
    decors.push({ kind: "screen", x: (room.x + 1.1) * TILE, y: (room.y + 1.5) * TILE, w: 26, h: 16 });
  }
  if (id === "mayor" || id === "vice" || id === "chair" || id === "directors" || id === "assembly") {
    decors.push({ kind: "flag", x: (room.x + room.w - 0.85) * TILE, y: (room.y + 1.5) * TILE, w: 12, h: 22, tint: id === "mayor" ? "#c4524a" : "#2454a0" });
  }
  if (id === "hope" || id === "senior" || id === "family" || id === "child" || id === "mul") {
    decors.push({ kind: "sofa", x: (room.x + 1.3) * TILE, y: (room.y + room.h / 2) * TILE, w: 30, h: 14, tint: "#f0c3cf" });
  }
  if (id === "hygiene" || id === "nh" || id === "minwon" || id === "edu") {
    decors.push({ kind: "cooler", x: (room.x + room.w - 1.2) * TILE, y: (room.y + room.h - 1.3) * TILE, w: 14, h: 20 });
  }
  if (id === "meet") {
    decors.push({
      kind: "table",
      x: (room.x + 1.5) * TILE,
      y: (room.y + 1.7) * TILE,
      w: (room.w - 3) * TILE,
      h: Math.max(TILE, (room.h - 2.3) * TILE),
    });
    for (const ox of [2, room.w / 2, room.w - 2]) {
      props.push(propAt(room, 4, ox, 2.05));
      props.push(propAt(room, 4, ox, room.h - 0.7));
    }
  }
  if (id === "assembly") {
    decors.push({ kind: "table", x: (room.x + room.w - 2.4) * TILE, y: (room.y + 1.6) * TILE, w: 1.4 * TILE, h: (room.h - 2.8) * TILE, tint: "#8a5a32" });
    for (let row = 1.5; row < room.h - 0.8; row += 1.15) {
      props.push(propAt(room, 4, 2.2, row));
      props.push(propAt(room, 4, 4.2, row));
      props.push(propAt(room, 4, 6.2, row));
    }
  }
  if (id === "market") {
    for (const oy of [3.2, 6.2, 9.2, 12.2]) props.push(propAt(room, 3, room.w - 1.6, oy, true));
    props.push(propAt(room, 8, 1.4, 3));
    props.push(propAt(room, 8, 1.4, 8));
    props.push(propAt(room, 6, room.w - 1.5, 5));
  }
  if (id === "roof" || id === "climate" || id === "mul") {
    const spots: [number, number][] = [
      [1.4, 2.4],
      [room.w - 1.4, 2.6],
      [2.4, room.h - 1.5],
      [room.w / 2, 3.2],
      [room.w - 2, room.h / 2],
    ];
    for (const [ox, oy] of spots) {
      if (ox > 1 && oy > 1 && ox < room.w - 0.4 && oy < room.h - 0.4) props.push(propAt(room, 1, ox, oy));
    }
    decors.push({ kind: "bench", x: (room.x + 2) * TILE, y: (room.y + room.h / 2) * TILE, w: 28, h: 12 });
  }
  if (id === "sports") {
    decors.push({ kind: "bench", x: (room.x + 1.4) * TILE, y: (room.y + room.h - 1.4) * TILE, w: 36, h: 12, tint: "#2f6f4e" });
    props.push(propAt(room, 8, room.w - 1.3, room.h - 1.4));
  }
  if (id === "guide") {
    props.push(propAt(room, 1, 1.3, room.h - 1.4));
    props.push(propAt(room, 7, room.w - 1.2, 1.1));
    decors.push({ kind: "bench", x: (room.x + 1.2) * TILE, y: (room.y + room.h - 1.2) * TILE, w: 34, h: 12 });
  }
  if (id === "minwon") {
    props.push(propAt(room, 3, 1.5, room.h - 1.5, true));
    props.push(propAt(room, 8, room.w / 2, 1.2));
  }
  if (id === "members" || id === "council-office") {
    props.push(propAt(room, 5, 1.3, 1.4, true));
    props.push(propAt(room, 0, room.w - 1.5, room.h - 1.5, true));
  }
}

function furnish(room: Room, props: Prop[], decors: Decor[]) {
  decors.push({
    kind: "rug",
    tint: RUG_TINT[room.id] ?? "#e7c9a4",
    x: (room.x + 0.4) * TILE,
    y: (room.y + 0.4) * TILE,
    w: Math.max(TILE, (room.w - 0.8) * TILE),
    h: Math.max(TILE, (room.h - 0.8) * TILE),
  });
  const cabinet = backSpot(room, "a");
  props.push({ sprite: 5, x: cabinet.x * TILE, y: cabinet.y * TILE, solid: true, hw: 10, hh: 8 });
  const plant = backSpot(room, "b");
  props.push({ sprite: 1, x: plant.x * TILE, y: plant.y * TILE, solid: false, hw: 0, hh: 0 });
  const chairX = room.door === "w" ? room.w / 2 - 0.8 : room.w / 2 + 0.75;
  const chairY = room.door === "s" ? 2.15 : room.door === "n" ? room.h - 2.15 : room.h / 2;
  props.push(propAt(room, 4, chairX, chairY));
  if (room.w >= 5 && room.id !== "roof") {
    props.push(propAt(room, 7, room.w - 0.75, 0.9));
  }
  addWindows(room, decors);
  decors.push({
    kind: "shelf",
    x: (room.door === "e" ? room.x + 0.25 : room.x + room.w - 0.65) * TILE,
    y: (room.y + 1.7) * TILE,
    w: 12,
    h: Math.max(20, (room.h - 3.1) * TILE),
  });
  decors.push({
    kind: "board",
    x: (room.x + 0.28) * TILE,
    y: (room.y + Math.min(2.3, room.h - 1.4)) * TILE,
    w: 26,
    h: 16,
  });
  dress(room, props, decors);
}

function build(
  id: FloorId,
  name: string,
  roomsIn: Room[],
  spawnTile: { x: number; y: number },
  extras?: {
    elevators?: { x: number; y: number }[];
    portals?: { x: number; y: number; to: FloorId; title: string; line: string }[];
    seal?: [number, number][];
  },
): FloorMap {
  const rooms = roomsIn;
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const a = rooms[i];
      const b = rooms[j];
      if (!a || !b) continue;
      if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) {
        throw new Error(`rooms overlap on ${id}: ${a.id} ${b.id}`);
      }
    }
  }
  const spawn = spawnTile;
  const grid = Array.from({ length: MAP_H }, () => Array.from({ length: MAP_W }, () => "#"));
  for (let y = 1; y < MAP_H - 1; y++) {
    for (let x = 1; x < MAP_W - 1; x++) grid[y][x] = "m";
  }

  const props: Prop[] = [];
  const spots: Spot[] = [];
  const labels: FloorMap["labels"] = [];
  const decors: Decor[] = [];
  const doors: [number, number][] = [];

  for (const room of rooms) {
    for (let y = room.y - 1; y <= room.y + room.h; y++) {
      for (let x = room.x - 1; x <= room.x + room.w; x++) {
        if (!inside(x, y)) continue;
        const edge =
          x === room.x - 1 || x === room.x + room.w || y === room.y - 1 || y === room.y + room.h;
        grid[y][x] = edge ? "#" : room.floor;
      }
    }
    doors.push(...doorCells(room));
    labels.push({
      x: (room.x + room.w / 2) * TILE,
      y: (room.y + 0.45) * TILE,
      text: room.label ?? room.name,
    });

    const desk = deskFeet(room);
    const counter = room.action === "minwon" || room.id === "guide" || room.action === "market";
    props.push({
      sprite: counter ? 3 : 0,
      x: desk.x,
      y: desk.y,
      solid: true,
      hw: 14,
      hh: 9,
    });
    if (room.action === "pingpong" || room.action === "market") {
      props.push({ sprite: 6, x: desk.x + 22, y: desk.y - 6, solid: false, hw: 0, hh: 0 });
    }
    furnish(room, props, decors);

    const feet = npcFeet(room);
    const actor = room.actor !== false && room.action !== "portal";
    spots.push({
      id: room.id,
      x: feet.x,
      y: feet.y,
      title: room.name,
      action: room.action,
      lines: room.lines,
      stamp: room.stamp,
      portal: room.portal,
      actor,
    });
  }

  for (const [x, y] of doors) {
    if (inside(x, y)) grid[y][x] = "m";
  }

  for (const ev of extras?.elevators ?? []) {
    const at = ev;
    const x = (at.x + 0.5) * TILE;
    const y = (at.y + 0.5) * TILE;
    if (grid[at.y]?.[at.x] === "#") grid[at.y][at.x] = "m";
    props.push({ sprite: 2, x, y, solid: false, hw: 0, hh: 0 });
    spots.push({
      id: `ev-${id}-${at.x}`,
      x,
      y: y + 8,
      title: "엘리베이터",
      action: "floors",
      lines: ["본관 1층부터 5층까지 이동합니다. 별관은 3층 연결통로입니다."],
      actor: false,
    });
  }

  for (const portal of extras?.portals ?? []) {
    const at = portal;
    const x = (at.x + 0.5) * TILE;
    const y = (at.y + 0.5) * TILE;
    if (inside(at.x, at.y)) grid[at.y][at.x] = "r";
    if (inside(at.x + 1, at.y)) grid[at.y][at.x + 1] = "r";
    props.push({ sprite: 8, x, y: y - 8, solid: false, hw: 0, hh: 0 });
    spots.push({
      id: `portal-${id}`,
      x,
      y,
      title: portal.title,
      action: "portal",
      lines: [portal.line],
      portal: portal.to,
      actor: false,
    });
  }

  for (const [x, y] of extras?.seal ?? []) {
    if (inside(x, y) && !doors.some(([dx, dy]) => dx === x && dy === y)) grid[y][x] = "#";
  }

  for (let y = 8; y <= 10; y++) {
    for (let x = 2; x < MAP_W - 2; x++) {
      const ch = grid[y]?.[x];
      if (ch !== "m" && ch !== "r") continue;
      if (x % 2 === 0) {
        decors.push({ kind: "mat", x: x * TILE + 8, y: y * TILE + 10, w: 16, h: 12, tint: "#7ec8bc" });
      }
    }
  }
  for (let x = 3; x < MAP_W - 3; x += 4) {
    if (grid[7]?.[x] === "#" && grid[8]?.[x] !== "#") {
      decors.push({ kind: "lamp", x: x * TILE + 10, y: 7 * TILE + 18, w: 12, h: 16 });
    }
    if (grid[11]?.[x] === "#" && grid[10]?.[x] !== "#") {
      decors.push({ kind: "lamp", x: x * TILE + 10, y: 11 * TILE + 8, w: 12, h: 16 });
    }
  }
  decors.push({
    kind: "rug",
    tint: "#f3d2a2",
    x: (spawn.x - 1) * TILE,
    y: (spawn.y - 0.2) * TILE,
    w: TILE * 2.4,
    h: TILE * 1.6,
  });

  if (grid[spawn.y]?.[spawn.x] === "#") {
    throw new Error(`spawn is a wall on ${id} @ ${spawn.x},${spawn.y}`);
  }

  return {
    id,
    name,
    grid: grid.map((row) => row.join("")),
    props,
    spots,
    labels,
    decors,
    spawn: { x: (spawn.x + 0.5) * TILE, y: (spawn.y + 0.5) * TILE },
  };
}

// 방 배치는 data/map/hall.json에서 읽는다. 본관 1~5층은 실제 층별 안내판 기준(팀 확인).
type HallJson = {
  floors: {
    id: FloorId;
    name: string;
    spawn: { x: number; y: number };
    rooms: Room[];
    extras?: Parameters<typeof build>[4];
  }[];
};

export const FLOORS = Object.fromEntries(
  (hall as HallJson).floors.map((f) => [f.id, build(f.id, f.name, f.rooms, f.spawn, f.extras)]),
) as Record<FloorId, FloorMap>;

export function tileAt(floor: FloorMap, px: number, py: number) {
  const x = Math.floor(px / TILE);
  const y = Math.floor(py / TILE);
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return "#";
  return floor.grid[y]?.[x] ?? "#";
}

export function isSolidTile(ch: string) {
  return ch === "#";
}

export const QUEST: { stamp: string; hint: string }[] = [
  { stamp: "guide", hint: "1층 안내데스크에서 청사 안내를 받으세요" },
  { stamp: "minwon", hint: "민원여권과 창구에서 시민·공무원 안내를 보세요" },
  { stamp: "jachi", hint: "2층 자치행정과에서 인수인계와 계산기를 받아 보세요" },
  { stamp: "ping", hint: "3층 대회의실에서 업무 핑퐁을 돌려 보세요" },
  { stamp: "market", hint: "별관 3층 AI 도구 상가에 들르세요" },
  { stamp: "roof", hint: "5층 옥상 정원에서 상황판을 확인하세요" },
];

export function questHint(stamps: string[]) {
  const next = QUEST.find((q) => !stamps.includes(q.stamp));
  return next ? next.hint : "도장을 모두 모았습니다. 청사에 지식이 남았습니다.";
}

export const PING_TARGET = "climate";
