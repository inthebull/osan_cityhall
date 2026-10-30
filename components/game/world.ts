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

const talk = (name: string, line: string): Pick<Room, "action" | "lines"> => ({
  action: "talk",
  lines: [`${name} AI 주무관. ${line}`],
});

export const FLOORS: Record<FloorId, FloorMap> = {
  f1: build("f1", "본관 1층", [
    { id: "tax", name: "세정과", x: 2, y: 2, w: 6, h: 5, floor: "w", door: "s", ...talk("세정과", "취득세 신고와 납부 계산은 이쪽입니다. 근거 조문을 같이 펼쳐 드려요.") },
    { id: "collect", name: "징수과", x: 9, y: 2, w: 6, h: 5, floor: "w", door: "s", ...talk("징수과", "체납 안내와 납부 일정은 징수과 달력에 남아 있습니다. 담당이 바뀌어도 일정은 청사에 남아요.") },
    { id: "hope", name: "희망복지과", x: 16, y: 2, w: 6, h: 5, floor: "c", door: "s", ...talk("희망복지과", "긴급복지와 통합사례는 여기서 받습니다. 애매하면 3층 업무 핑퐁으로 보내 주세요.") },
    { id: "nh", name: "농협 시청지점", x: 23, y: 2, w: 6, h: 5, floor: "t", door: "s", ...talk("농협", "시청 안 금융 창구입니다. 공과금과 수납 안내는 여기서 끝나요.") },
    { id: "minwon", name: "민원여권과", x: 2, y: 12, w: 5, h: 4, floor: "t", door: "n", action: "minwon", stamp: "minwon", lines: ["시민 안내 — 여권 재발급은 이 창구에서 신청해요. 여권용 사진과 신분증을 준비해 주세요.", "공무원 요약 — 민원여권과. 필요 서류: 사진, 신분증. 다국어 답은 왼쪽에, 담당 부서 요약은 오른쪽에 같이 남습니다."] },
    { id: "land", name: "토지정보과", x: 8, y: 12, w: 5, h: 4, floor: "w", door: "n", ...talk("토지정보과", "토지대장, 지적, 부동산 거래 신고는 여기입니다. 건축 허가 자체는 별관 쪽 일이고, 1층에서는 대장 열람을 맡아요.") },
    { id: "guide", name: "안내데스크", x: 14, y: 12, w: 5, h: 4, floor: "c", door: "n", action: "talk", stamp: "guide", lines: ["어서 오세요. 오산시 AI 청사, 본관 1층 로비입니다.", "위가 세정과·징수과·희망복지과·농협, 아래가 민원여권과·토지정보과·안내·위생과·노인장애인과입니다.", "왼쪽에서 층을 고르고 부서를 누르면 그 방으로 바로 가 물어봅니다. 걸어서 E로 말을 걸 수도 있어요."] },
    { id: "hygiene", name: "위생과", x: 20, y: 12, w: 4, h: 4, floor: "w", door: "n", ...talk("위생과", "식품·공중위생 영업 안내는 위생과입니다. 현장 사진은 2층 상황실로 넘기면 위치가 찍혀요.") },
    { id: "senior", name: "노인장애인과", x: 25, y: 12, w: 4, h: 4, floor: "c", door: "n", ...talk("노인장애인과", "노인·장애인 서비스 창구입니다. 신청 서류는 쉬운 말로 다시 써 드릴 수 있어요.") },
  ], { x: 16, y: 9 }, { elevators: [{ x: 11, y: 9 }, { x: 21, y: 9 }] }),
  f2: build("f2", "본관 2층", [
    { id: "advice", name: "정책자문실", x: 2, y: 2, w: 6, h: 5, floor: "w", door: "s", ...talk("정책자문실", "시정 현안을 짧게 메모해 두는 방입니다. 결론은 근거와 함께 남깁니다.") },
    { id: "jachi", name: "자치행정과", x: 9, y: 2, w: 12, h: 5, floor: "c", door: "s", action: "tool", stamp: "jachi", lines: ["11월에는 예산 편성 자료를 모으고, 12월에는 연말 정산 안내가 옵니다.", "이 방의 능력치는 업무의 능력입니다. 법률해석 4, 복무·인사 5, 협업 4.", "책상 위에 초과근무 계산기를 만들 수 있어요. 만든 도구는 청사에 남습니다."] },
    { id: "mul", name: "물향기실", x: 22, y: 2, w: 7, h: 5, floor: "g", door: "s", ...talk("물향기실", "접견과 환담을 위한 방입니다. 민원 결론을 말하기 전에 쉬운 문장인지 한번 더 읽어요.") },
    { id: "situ", name: "상황실", x: 2, y: 12, w: 8, h: 4, floor: "t", door: "n", ...talk("상황실", "사진 한 장이 오면 얼굴과 번호판을 가리고, 위치와 긴급도만 상황판에 남깁니다. 소관이 애매하면 3층으로 넘기세요.") },
    { id: "vice", name: "부시장실", x: 11, y: 12, w: 5, h: 4, floor: "c", door: "n", ...talk("부시장실", "실국 현안을 모으는 방입니다. 핑퐁이 반복되면 옥상 상황판에 구간으로 찍혀요.") },
    { id: "mayor", name: "시장실", x: 17, y: 12, w: 6, h: 4, floor: "c", door: "n", ...talk("시장실", "집무실입니다. 보고는 한 장 판정서로 올라옵니다. 배정 확정은 사람이 합니다.") },
    { id: "directors", name: "국장실", x: 24, y: 12, w: 5, h: 4, floor: "w", door: "n", ...talk("국장실", "국별 현안실입니다. 협조 부서가 둘 이상이면 봉투가 방마다 한 장씩 갑니다.") },
  ], { x: 16, y: 9 }, { elevators: [{ x: 12, y: 9 }, { x: 22, y: 9 }] }),
  f3: build("f3", "본관 3층", [
    { id: "press", name: "홍보담당관", x: 2, y: 2, w: 5, h: 5, floor: "w", door: "s", ...talk("홍보담당관", "시민 문장은 짧게. 어려운 말은 형광펜으로 표시한 뒤 다시 씁니다.") },
    { id: "sports", name: "체육과", x: 8, y: 2, w: 5, h: 5, floor: "w", door: "s", ...talk("체육과", "생활체육 프로그램과 시설 일정은 여기 달력에 있습니다.") },
    { id: "climate", name: "기후환경정책과", label: "기후환경", x: 14, y: 2, w: 9, h: 5, floor: "g", door: "s", ...talk("기후환경정책과", "가로수, 낙엽, 녹지 경계 업무가 자주 머무는 방입니다. 배수구 막힘은 안전·도로와 점수를 나눠 봅니다.") },
    { id: "jobs", name: "기업일자리과", x: 24, y: 2, w: 5, h: 5, floor: "w", door: "s", ...talk("기업일자리과", "기업 지원과 일자리 사업을 한 방에서 봅니다.") },
    { id: "meet", name: "업무조정", x: 2, y: 12, w: 12, h: 4, floor: "c", door: "n", action: "pingpong", lines: ["대회의실입니다. 소관이 애매한 민원을 점수와 근거로 나눕니다. AI가 점수를 임의로 주지 않고, 사무분장과 사례로 계산합니다."] },
    { id: "econ", name: "민생경제과", x: 15, y: 12, w: 6, h: 4, floor: "w", door: "n", ...talk("민생경제과", "골목 상권과 민생 현안입니다. 간판 가림은 녹지·건축과 경계가 될 수 있어요.") },
    { id: "budget", name: "기획예산과", x: 22, y: 12, w: 7, h: 4, floor: "t", door: "n", ...talk("기획예산과", "기획과 예산을 같이 봅니다. 도구를 새로 만들어도 예산 항목이 없으면 초안만 남깁니다.") },
  ], { x: 10, y: 9 }, { elevators: [{ x: 6, y: 9 }, { x: 18, y: 9 }], portals: [{ x: 26, y: 9, to: "ax", title: "별관 연결통로", line: "본관 3층과 별관 3층이 이어집니다. 가족·교육·문화, 그리고 AI 도구 상가가 있습니다." }] }),
  f4: build("f4", "본관 4층", [
    { id: "traffic", name: "교통정책과", x: 2, y: 2, w: 10, h: 5, floor: "w", door: "s", ...talk("교통정책과", "교통과 주정차 정책입니다. 현장 도로는 안전정책과와 점수를 나눕니다.") },
    { id: "account", name: "회계과", x: 13, y: 2, w: 8, h: 5, floor: "t", door: "s", ...talk("회계과", "지출과 결산 일정은 여기 달력에 고정입니다. 담당자가 떠나도 체크리스트는 남아요.") },
    { id: "edu", name: "정보화교육장", x: 22, y: 2, w: 7, h: 5, floor: "t", door: "s", ...talk("정보화교육장", "직원이 도구를 같이 써 보는 방입니다. 만든 계산기는 별관 상가에 입주합니다.") },
    { id: "safety", name: "안전정책과", x: 2, y: 12, w: 14, h: 4, floor: "w", door: "n", ...talk("안전정책과", "재난과 안전입니다. 배수구·보도 파손은 여기와 기후·도로가 함께 봅니다.") },
    { id: "data", name: "데이터정책과", x: 17, y: 12, w: 12, h: 4, floor: "t", door: "n", ...talk("데이터정책과", "업무 기록은 부서 이름이 아니라 업무 ID로 묶입니다. 상황판 숫자는 여기서 나옵니다.") },
  ], { x: 15, y: 9 }, { elevators: [{ x: 8, y: 9 }, { x: 24, y: 9 }] }),
  f5: build("f5", "본관 5층", [
    { id: "roof", name: "옥상 정원", x: 2, y: 2, w: 8, h: 14, floor: "g", door: "e", action: "roof", stamp: "roof", lines: ["청사에서 일어난 판정, 도장, 도구가 한 화면에 모입니다."] },
    { id: "assembly", name: "본회의장", x: 14, y: 2, w: 15, h: 5, floor: "c", door: "w", ...talk("본회의장", "의결은 여기서 합니다. AI 판정서는 참고 자료일 뿐, 표결을 대신하지 않습니다.") },
    { id: "council-office", name: "의회사무과", x: 14, y: 12, w: 5, h: 4, floor: "w", door: "n", ...talk("의회사무과", "의사 일정과 회의록 서식은 사무과 보관함입니다.") },
    { id: "members", name: "의원사무실", x: 20, y: 12, w: 4, h: 4, floor: "w", door: "n", ...talk("의원사무실", "의원실이 줄지어 있습니다. 민원 메모는 담당 부서 판정서와 링크됩니다.") },
    { id: "chair", name: "의장실", x: 25, y: 12, w: 4, h: 4, floor: "c", door: "n", ...talk("의장실", "의장·부의장 집무입니다. 본회의 안건은 옆 회의장으로 이어집니다.") },
  ], { x: 20, y: 9 }, {
    elevators: [{ x: 17, y: 9 }, { x: 23, y: 9 }],
    seal: [
      [11, 1], [12, 1], [11, 16], [12, 16],
    ],
  }),
  ax: build("ax", "별관 3층", [
    { id: "family", name: "가족보육과", x: 2, y: 2, w: 7, h: 5, floor: "c", door: "s", ...talk("가족보육과", "보육과 가족 지원입니다. 신청 안내는 민원 창구 문장으로 다시 쓸 수 있어요.") },
    { id: "child", name: "아동복지과", x: 10, y: 2, w: 7, h: 5, floor: "c", door: "s", ...talk("아동복지과", "아동 돌봄과 사례입니다. 여러 과가 겹치면 협조 봉투를 나눕니다.") },
    { id: "lifelong", name: "평생교육과", x: 2, y: 12, w: 7, h: 4, floor: "w", door: "n", ...talk("평생교육과", "강좌 일정과 수강 안내가 달력에 있습니다.") },
    { id: "culture", name: "문화예술과", x: 10, y: 12, w: 7, h: 4, floor: "w", door: "n", ...talk("문화예술과", "공연·전시 일정입니다. 홍보 문장은 본관 홍보담당관과 같이 봅니다.") },
    { id: "market", name: "AI 도구 상가", x: 21, y: 2, w: 7, h: 14, floor: "t", door: "w", action: "market", stamp: "market", lines: ["다른 팀이 만든 도구, 엑셀 계산기, 서식이 가게처럼 입주합니다. 만든 사람이 떠나도 카드는 남아요."] },
  ], { x: 12, y: 9 }, {
    portals: [{ x: 5, y: 9, to: "f3", title: "본관 연결통로", line: "본관 3층 복도로 돌아갑니다." }],
    seal: [
      [18, 1], [19, 1], [18, 2], [19, 2], [18, 3], [19, 3], [18, 4], [19, 4], [18, 5], [19, 5], [18, 6], [19, 6],
      [18, 11], [19, 11], [18, 12], [19, 12], [18, 13], [19, 13], [18, 14], [19, 14], [18, 15], [19, 15], [18, 16], [19, 16],
    ],
  }),
};

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
