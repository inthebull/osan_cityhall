import { sfx } from "./audio";
import {
  FLOORS,
  MAP_H,
  MAP_W,
  DEPT_ROOMS,
  TILE,
  isSolidTile,
  questHint,
  tileAt,
  type FloorId,
  type FloorMap,
  type Spot,
} from "./world";
import { ISO, OFFICER_STYLE, PLAYER_STYLE, floorQuad, fromIso, iso, person, pill, shadow } from "./iso";
import { drawDecor, drawGround, drawProp, wallItems, type Item } from "./scene";

// 층 배치를 안내도대로 다시 그리면서 저장 위치 형식이 바뀌어 새 키를 쓴다.
const SAVE_KEY = "osan-ai-hall-v4";

export type Hud = {
  floorId: FloorId;
  floorName: string;
  prompt: string | null;
  stamps: string[];
  tools: string[];
  hint: string;
  toast: string | null;
  pingpongs: number;
};

type Save = {
  v: 2 | 3;
  floor: FloorId;
  x: number;
  y: number;
  face: number;
  stamps: string[];
  tools: string[];
  pingpongs: number;
};

type Hooks = {
  onHud: (hud: Hud) => void;
  onSpot: (spot: Spot) => void;
};

type Envelope = { x: number; y: number; tx: number; ty: number; t: number };
type Pt = { x: number; y: number };

const STAMP_NAME: Record<string, string> = {
  lobby: "1층 로비 업무 안내",
  minwon: "민원여권과",
  senior: "노인장애인과",
};

const SPEED = 168;
const TALK_RADIUS = 64;

declare global {
  interface Window {
    __controlsTest?: {
      getYaw: () => number;
      getSpeed: () => number;
      getX: () => number;
      getY: () => number;
      setKeys: (codes: string[]) => void;
    };
  }
}

// 화면 방향(위·아래·좌·우) 입력을 세계 좌표 방향으로 바꾼다. 아이소 화면의 '위'는 세계의 (-1, -1).
function screenToWorldDir(sx: number, sy: number): [number, number] {
  const wx = sx + sy;
  const wy = -sx + sy;
  const len = Math.hypot(wx, wy);
  if (len < 1e-6) return [0, 0];
  const mag = Math.min(1, Math.hypot(sx, sy));
  return [(wx / len) * mag, (wy / len) * mag];
}

export class HallEngine {
  keys = new Set<string>();
  joy = { x: 0, y: 0 };
  insetLeft = 0;
  insetRight = 0;
  hasSave = false;
  mode: "title" | "play" = "title";
  // "3d"이면 그리기는 React Three Fiber 장면(Hall3D)이 맡고 이 엔진은 이동·판정만 한다.
  renderer: "2d" | "3d" = "2d";
  hovered: string | null = null;

  private floor: FloorMap = FLOORS.f1;
  private x = FLOORS.f1.spawn.x;
  private y = FLOORS.f1.spawn.y;
  private face = 0;
  private sdir = 1;
  private sback = false;
  private vx = 0;
  private vy = 0;
  private stamps: string[] = [];
  private tools: string[] = [];
  private pingpongs = 0;
  private locked = false;
  private time = 0;
  private acc = 0;
  private last = 0;
  private raf = 0;
  private stepClock = 0;
  private fade = 0;
  private fading = false;
  private fadeOut = false;
  private pending: FloorId | null = null;
  private pendingSpot: string | null = null;
  private toast = "";
  private toastT = 0;
  private prompt: string | null = null;
  private lastHud = "";
  private envelopes: Envelope[] = [];
  private path: Pt[] = [];
  private pathSpot: Spot | null = null;
  private marker: Pt | null = null;
  private stuck = 0;
  private camX = 0;
  private camY = 0;
  private camReady = false;
  private zoom = 1;
  private userZoom = 1;
  private cssW = 1;
  private cssH = 1;
  private blockedTiles = new Map<FloorId, boolean[][]>();

  constructor(
    private canvas: HTMLCanvasElement,
    private hooks: Hooks,
  ) {
    this.load();
  }

  start() {
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
    this.emit(true);
  }

  stop() {
    cancelAnimationFrame(this.raf);
  }

  begin(fresh: boolean) {
    if (fresh) this.reset();
    this.mode = "play";
    this.locked = false;
    window.__controlsTest = {
      getYaw: () => 0,
      getSpeed: () => Math.hypot(this.vx, this.vy),
      getX: () => this.x,
      getY: () => this.y,
      setKeys: (codes) => {
        this.keys = new Set(codes);
      },
    };
    this.emit(true);
  }

  lock() {
    this.locked = true;
    this.joy = { x: 0, y: 0 };
    this.clearPath();
  }

  unlock() {
    this.locked = false;
  }

  zoomBy(factor: number) {
    this.userZoom = Math.max(0.6, Math.min(1.9, this.userZoom * factor));
  }

  interact() {
    if (this.mode !== "play" || this.locked || this.fading) return;
    const spot = this.nearest(TALK_RADIUS);
    if (!spot) return;
    this.open(spot);
  }

  go(id: FloorId) {
    if (this.fading || id === this.floor.id) return;
    this.pending = id;
    this.pendingSpot = null;
    this.fading = true;
    this.fadeOut = true;
    this.clearPath();
    sfx.floor();
  }

  // 부서 목록에서 고르면: 같은 층이면 걸어가고, 다른 층이면 층을 옮긴 뒤 그 앞에 선다.
  visit(floorId: FloorId, spotId: string) {
    if (this.mode !== "play" || this.fading) return;
    if (floorId !== this.floor.id) {
      this.pending = floorId;
      this.pendingSpot = spotId;
      this.fading = true;
      this.fadeOut = true;
      this.clearPath();
      sfx.floor();
      return;
    }
    const spot = this.floor.spots.find((item) => item.id === spotId);
    if (spot) this.walkTo(spot, spot);
  }

  grant(stamp?: string) {
    if (!stamp || this.stamps.includes(stamp)) return;
    this.stamps = [...this.stamps, stamp];
    this.toast = `${STAMP_NAME[stamp] ?? stamp} 둘러보기 완료`;
    this.toastT = 2.4;
    sfx.stamp();
    this.persist();
    this.emit(true);
  }

  addTool(name: string) {
    if (this.tools.includes(name)) return false;
    this.tools = [...this.tools, name];
    this.toast = `${name}을 청사에 남겼습니다`;
    this.toastT = 2.4;
    sfx.stamp();
    this.persist();
    this.emit(true);
    return true;
  }

  // 로비에서 업무를 판정하면 담당 부서 방으로 봉투가 날아간다(같은 층에 있을 때).
  markPingpong(deptId?: string) {
    this.pingpongs += 1;
    this.grant("lobby");
    const target = deptId ? DEPT_ROOMS[deptId] : undefined;
    const spot = target && target.floor === this.floor.id ? this.floor.spots.find((s) => s.id === target.room) : undefined;
    if (spot) {
      this.envelopes.push({ x: this.x, y: this.y, tx: spot.x, ty: spot.y, t: 0 });
    }
    sfx.ping();
    this.persist();
    this.emit(true);
  }

  // 화면 좌표(CSS px)에 있는 방을 찾아 마우스 모양을 바꾸는 데 쓴다.
  pointerMove(cssX: number, cssY: number) {
    const [wx, wy] = this.pick(cssX, cssY);
    return this.hoverWorld(wx, wy);
  }

  pointerClick(cssX: number, cssY: number) {
    const [wx, wy] = this.pick(cssX, cssY);
    this.clickWorld(wx, wy);
  }

  // 세계 좌표(px)로 직접 가리키기. 3D 화면은 바닥면 광선 교차점으로 이것을 부른다.
  hoverWorld(wx: number, wy: number) {
    if (this.mode !== "play") {
      this.hovered = null;
      return null;
    }
    const spot = this.spotAt(wx, wy);
    this.hovered = spot?.id ?? null;
    return this.hovered;
  }

  clickWorld(wx: number, wy: number) {
    if (this.mode !== "play" || this.locked || this.fading) return;
    const spot = this.spotAt(wx, wy);
    if (spot) {
      if (Math.hypot(spot.x - this.x, spot.y - this.y) < TALK_RADIUS) {
        this.open(spot);
        return;
      }
      this.walkTo(spot, spot);
      return;
    }
    const tx = Math.floor(wx / TILE);
    const ty = Math.floor(wy / TILE);
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return;
    this.walkTo({ x: wx, y: wy }, null);
  }

  // 3D 화면이 매 프레임 읽는 현재 상태
  view() {
    const near = this.mode === "play" && !this.locked ? this.nearest(TALK_RADIUS) : null;
    return {
      floor: this.floor,
      x: this.x,
      y: this.y,
      moving: Math.hypot(this.vx, this.vy) > 8,
      vx: this.vx,
      vy: this.vy,
      time: this.time,
      marker: this.marker,
      envelopes: this.envelopes,
      hovered: this.hovered,
      nearId: near?.id ?? null,
      zoom: this.userZoom,
      fade: this.fade,
    };
  }

  private open(spot: Spot) {
    this.clearPath();
    sfx.talk();
    this.hooks.onSpot(spot);
  }

  private clearPath() {
    this.path = [];
    this.pathSpot = null;
    this.marker = null;
    this.stuck = 0;
  }

  private pick(cssX: number, cssY: number) {
    const ix = cssX / this.zoom + this.camX;
    const iy = cssY / this.zoom + this.camY;
    return fromIso(ix, iy);
  }

  private spotAt(wx: number, wy: number): Spot | null {
    for (const spot of this.floor.spots) {
      if ((spot.kind === "facility" || spot.kind === "feature") && Math.hypot(spot.x - wx, spot.y - wy) < 30) return spot;
    }
    const room = this.floor.rooms.find((r) =>
      r.parts.some((p) => wx >= p.x * TILE && wx < (p.x + p.w) * TILE && wy >= p.y * TILE && wy < (p.y + p.h) * TILE),
    );
    if (!room) return null;
    return this.floor.spots.find((s) => s.id === room.id) ?? null;
  }

  private reset() {
    this.floor = FLOORS.f1;
    this.x = this.floor.spawn.x;
    this.y = this.floor.spawn.y;
    this.face = 0;
    this.stamps = [];
    this.tools = [];
    this.pingpongs = 0;
    this.envelopes = [];
    this.clearPath();
    this.camReady = false;
    this.hasSave = false;
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      /* ignore */
    }
  }

  private load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as Save;
      const floor = FLOORS[data.floor];
      if ((data.v !== 3 && data.v !== 2) || !floor) return;
      this.floor = floor;
      this.x = data.v === 3 ? data.x : floor.spawn.x;
      this.y = data.v === 3 ? data.y : floor.spawn.y;
      this.face = data.face ?? 0;
      this.stamps = Array.isArray(data.stamps) ? data.stamps : [];
      this.tools = Array.isArray(data.tools) ? data.tools : [];
      this.pingpongs = data.pingpongs ?? 0;
      if (this.blocked(this.x, this.y)) {
        this.x = floor.spawn.x;
        this.y = floor.spawn.y;
      }
      this.hasSave = true;
    } catch {
      /* ignore bad save */
    }
  }

  private persist() {
    const data: Save = {
      v: 3,
      floor: this.floor.id,
      x: this.x,
      y: this.y,
      face: this.face,
      stamps: this.stamps,
      tools: this.tools,
      pingpongs: this.pingpongs,
    };
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      this.hasSave = true;
    } catch {
      /* ignore */
    }
  }

  private frame = (now: number) => {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.acc += dt;
    while (this.acc >= 1 / 60) {
      this.step(1 / 60);
      this.acc -= 1 / 60;
    }
    if (this.renderer === "2d") this.draw();
    this.raf = requestAnimationFrame(this.frame);
  };

  private step(dt: number) {
    this.time += dt;
    this.updateFade(dt);
    for (const env of this.envelopes) env.t = Math.min(1, env.t + dt * 0.55);
    this.envelopes = this.envelopes.filter((e) => e.t < 1);
    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT <= 0) this.toast = "";
    }

    const canMove = this.mode === "play" && !this.locked && !this.fading;
    let sx = this.joy.x;
    let sy = this.joy.y;
    if (canMove) {
      if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) sx -= 1;
      if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) sx += 1;
      if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) sy -= 1;
      if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) sy += 1;
    }
    let [ix, iy] = screenToWorldDir(sx, sy);
    const manual = Math.hypot(ix, iy) > 0.08;
    if (manual && this.path.length) this.clearPath();

    if (canMove && !manual && this.path.length) {
      const wp = this.path[0];
      const dx = wp.x - this.x;
      const dy = wp.y - this.y;
      const d = Math.hypot(dx, dy);
      if (d < 5) {
        this.path.shift();
        if (!this.path.length) this.arrive();
      } else {
        ix = dx / d;
        iy = dy / d;
        // 마지막 구간에서는 살짝 감속해 부드럽게 멈춘다.
        if (this.path.length === 1 && d < 24) {
          ix *= Math.max(0.35, d / 24);
          iy *= Math.max(0.35, d / 24);
        }
      }
    }

    const mag = Math.hypot(ix, iy);
    const ox = this.x;
    const oy = this.y;
    if (canMove && mag > 0.08) {
      const nx = this.x + ix * SPEED * dt;
      const ny = this.y + iy * SPEED * dt;
      if (!this.blocked(nx, this.y)) this.x = nx;
      if (!this.blocked(this.x, ny)) this.y = ny;
      const screenDx = ix - iy;
      const screenDy = ix + iy;
      if (Math.abs(screenDx) > 0.05) this.sdir = screenDx < 0 ? -1 : 1;
      this.sback = screenDy < -0.05;
      if (Math.abs(ix) > Math.abs(iy)) this.face = ix < 0 ? 1 : 2;
      else this.face = iy < 0 ? 3 : 0;
      this.stepClock += dt;
      if (this.stepClock > 0.32) {
        this.stepClock = 0;
        sfx.step();
      }
      if (this.path.length) {
        const moved = Math.hypot(this.x - ox, this.y - oy);
        this.stuck = moved < 0.4 ? this.stuck + dt : 0;
        if (this.stuck > 0.45) this.clearPath();
      }
    } else {
      this.stepClock = 0;
    }
    this.vx = (this.x - ox) / dt;
    this.vy = (this.y - oy) / dt;

    this.updateCamera(dt);

    const near = this.mode === "play" && !this.locked ? this.nearest(TALK_RADIUS) : null;
    const prompt = near ? near.title : null;
    if (prompt !== this.prompt) {
      this.prompt = prompt;
      this.emit(true);
    } else if (this.toastT > 0) {
      this.emit(false);
    }
  }

  private arrive() {
    const spot = this.pathSpot;
    this.marker = null;
    this.pathSpot = null;
    if (spot && Math.hypot(spot.x - this.x, spot.y - this.y) < TALK_RADIUS + 8) {
      // 도착하면 상대 쪽을 바라보고 바로 말을 건다.
      const sdx = spot.x - spot.y - (this.x - this.y);
      if (Math.abs(sdx) > 1) this.sdir = sdx < 0 ? -1 : 1;
      this.open(spot);
    }
    this.persist();
  }

  private updateFade(dt: number) {
    if (this.fadeOut) {
      this.fade = Math.min(1, this.fade + dt * 3);
      if (this.fade >= 1 && this.pending) {
        const next = FLOORS[this.pending];
        this.floor = next;
        this.x = next.spawn.x;
        this.y = next.spawn.y;
        const spotId = this.pendingSpot;
        this.pending = null;
        this.pendingSpot = null;
        this.fadeOut = false;
        this.envelopes = [];
        this.camReady = false;
        const spot = spotId ? next.spots.find((s) => s.id === spotId) : null;
        if (spot) this.placeNear(spot);
        this.fading = false;
        this.persist();
        this.emit(true);
        if (spot) this.open(spot);
      }
      return;
    }
    if (this.fade > 0) this.fade = Math.max(0, this.fade - dt * 2.4);
  }

  private placeNear(spot: Spot) {
    const offsets: [number, number][] = [
      [0, 30],
      [0, -30],
      [-30, 0],
      [30, 0],
      [0, 46],
      [0, -46],
      [-46, 0],
      [46, 0],
    ];
    for (const [dx, dy] of offsets) {
      if (!this.blocked(spot.x + dx, spot.y + dy)) {
        this.x = spot.x + dx;
        this.y = spot.y + dy;
        return;
      }
    }
  }

  private nearest(radius: number) {
    let best: Spot | null = null;
    let bestD = radius;
    for (const spot of this.floor.spots) {
      const d = Math.hypot(spot.x - this.x, spot.y - this.y);
      if (d < bestD) {
        best = spot;
        bestD = d;
      }
    }
    return best;
  }

  private blocked(px: number, py: number) {
    const r = 8;
    const pts: [number, number][] = [
      [px - r, py - 2],
      [px + r, py - 2],
      [px - r, py + 10],
      [px + r, py + 10],
    ];
    for (const [x, y] of pts) {
      if (isSolidTile(tileAt(this.floor, x, y))) return true;
    }
    for (const prop of this.floor.props) {
      if (!prop.solid) continue;
      if (Math.abs(px - prop.x) < r + prop.hw && Math.abs(py - (prop.y - 4)) < 10 + prop.hh) return true;
    }
    return false;
  }

  // 길찾기용 막힘 지도: 벽 타일과 책상·창구가 놓인 타일.
  private tileBlocks() {
    const cached = this.blockedTiles.get(this.floor.id);
    if (cached) return cached;
    const grid: boolean[][] = [];
    for (let ty = 0; ty < MAP_H; ty++) {
      const row: boolean[] = [];
      for (let tx = 0; tx < MAP_W; tx++) {
        row.push(this.blocked((tx + 0.5) * TILE, (ty + 0.5) * TILE - 4));
      }
      grid.push(row);
    }
    this.blockedTiles.set(this.floor.id, grid);
    return grid;
  }

  private walkTo(target: Pt, spot: Spot | null) {
    if (this.locked || this.fading) return;
    const blocks = this.tileBlocks();
    const start = { x: Math.floor(this.x / TILE), y: Math.floor(this.y / TILE) };
    const gx = Math.floor(target.x / TILE);
    const gy = Math.floor(target.y / TILE);
    // 목표 칸이 막혀 있으면(책상 앞 주무관 자리 등) 가장 가까운 빈 칸을 고른다.
    const goals: { x: number; y: number; d: number }[] = [];
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const x = gx + dx;
        const y = gy + dy;
        if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H || blocks[y][x]) continue;
        const cx = (x + 0.5) * TILE;
        const cy = (y + 0.5) * TILE;
        const d = Math.hypot(cx - target.x, cy - target.y);
        // 주무관 자리로 갈 때는 겹치지 않게 한 걸음 앞에서 멈춘다.
        if (spot?.actor && d < 22) continue;
        goals.push({ x, y, d });
      }
    }
    goals.sort((a, b) => a.d - b.d);
    for (const goal of goals.slice(0, 6)) {
      const tiles = this.astar(blocks, start, goal);
      if (!tiles) continue;
      const pts = tiles.map((t) => ({ x: (t.x + 0.5) * TILE, y: (t.y + 0.5) * TILE }));
      if (!spot && !this.blocked(target.x, target.y) && goal.x === gx && goal.y === gy) {
        pts[pts.length - 1] = { x: target.x, y: target.y };
      }
      this.path = this.smooth(pts);
      this.pathSpot = spot;
      this.marker = spot ? { x: spot.x, y: spot.y } : pts[pts.length - 1];
      this.stuck = 0;
      if (!this.path.length) this.arrive();
      return;
    }
  }

  private astar(blocks: boolean[][], start: Pt, goal: Pt): Pt[] | null {
    const key = (x: number, y: number) => y * MAP_W + x;
    const open: { x: number; y: number; f: number }[] = [{ ...start, f: 0 }];
    const g = new Map<number, number>([[key(start.x, start.y), 0]]);
    const from = new Map<number, number>();
    const h = (x: number, y: number) => {
      const dx = Math.abs(x - goal.x);
      const dy = Math.abs(y - goal.y);
      return Math.max(dx, dy) + 0.414 * Math.min(dx, dy);
    };
    const dirs: [number, number, number][] = [
      [1, 0, 1],
      [-1, 0, 1],
      [0, 1, 1],
      [0, -1, 1],
      [1, 1, 1.414],
      [1, -1, 1.414],
      [-1, 1, 1.414],
      [-1, -1, 1.414],
    ];
    let guard = 0;
    while (open.length && guard++ < 4000) {
      open.sort((a, b) => a.f - b.f);
      const cur = open.shift() as { x: number; y: number; f: number };
      if (cur.x === goal.x && cur.y === goal.y) {
        const out: Pt[] = [];
        let k: number | undefined = key(cur.x, cur.y);
        while (k !== undefined && k !== key(start.x, start.y)) {
          out.unshift({ x: k % MAP_W, y: Math.floor(k / MAP_W) });
          k = from.get(k);
        }
        return out;
      }
      const base = g.get(key(cur.x, cur.y)) ?? 0;
      for (const [dx, dy, cost] of dirs) {
        const nx = cur.x + dx;
        const ny = cur.y + dy;
        if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H || blocks[ny][nx]) continue;
        if (dx && dy && (blocks[cur.y][nx] || blocks[ny][cur.x])) continue;
        const ng = base + cost;
        const nk = key(nx, ny);
        if (ng >= (g.get(nk) ?? Infinity)) continue;
        g.set(nk, ng);
        from.set(nk, key(cur.x, cur.y));
        open.push({ x: nx, y: ny, f: ng + h(nx, ny) });
      }
    }
    return null;
  }

  // 막힘 없이 곧장 갈 수 있는 지점까지는 중간 칸을 건너뛰어 자연스럽게 걷게 한다.
  private smooth(pts: Pt[]) {
    const out: Pt[] = [];
    let from: Pt = { x: this.x, y: this.y };
    let i = 0;
    while (i < pts.length) {
      let j = pts.length - 1;
      while (j > i && !this.clear(from, pts[j])) j--;
      out.push(pts[j]);
      from = pts[j];
      i = j + 1;
    }
    return out;
  }

  private clear(a: Pt, b: Pt) {
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.ceil(d / 6);
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      if (this.blocked(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)) return false;
    }
    return true;
  }

  private hud(): Hud {
    return {
      floorId: this.floor.id,
      floorName: this.floor.name,
      prompt: this.prompt,
      stamps: this.stamps,
      tools: this.tools,
      hint: questHint(this.stamps),
      toast: this.toastT > 0 ? this.toast : null,
      pingpongs: this.pingpongs,
    };
  }

  private emit(force: boolean) {
    const hud = this.hud();
    const key = JSON.stringify(hud);
    if (!force && key === this.lastHud) return;
    this.lastHud = key;
    this.hooks.onHud(hud);
  }

  private viewCenter() {
    const left = this.insetLeft;
    const right = this.insetRight;
    return { cx: left + (this.cssW - left - right) / 2, cy: this.cssH / 2 };
  }

  private updateCamera(dt: number) {
    const cssW = this.cssW;
    const cssH = this.cssH;
    // 넓은 화면은 한 층 전체가 한눈에 들어오게 맞추고, 좁은 화면은 주변만 크게 보여 준다.
    const narrow = cssW < 720;
    const availW = cssW - this.insetLeft - 120;
    const fit = Math.min(availW / ((MAP_W + MAP_H) * TILE), (cssH - 140) / (((MAP_W + MAP_H) * TILE) / 2 + 60));
    const base = narrow ? Math.max(0.55, Math.min(0.95, cssW / 600)) : Math.max(0.5, Math.min(1.2, fit));
    const targetZoom = base * this.userZoom;
    this.zoom += (targetZoom - this.zoom) * Math.min(1, dt * 10);
    const zoom = this.zoom;
    const { cx, cy } = this.viewCenter();
    const [px, py] = iso(this.x, this.y, 20);
    let tx = px - cx / zoom;
    let ty = py - cy / zoom;
    // 건물 바깥으로 너무 나가지 않게 붙잡는다.
    const minX = -MAP_H * TILE - 80;
    const maxX = MAP_W * TILE + 80;
    const minY = -120;
    const maxY = ((MAP_W + MAP_H) * TILE) / 2 + 80;
    const viewW = cssW / zoom;
    const viewH = cssH / zoom;
    const leftPad = this.insetLeft / zoom;
    const rightPad = this.insetRight / zoom;
    if (maxX - minX < viewW - leftPad - rightPad) tx = (minX + maxX) / 2 - cx / zoom;
    else tx = Math.max(minX - leftPad, Math.min(maxX - viewW + rightPad, tx));
    if (maxY - minY < viewH) ty = (minY + maxY) / 2 - viewH / 2;
    else ty = Math.max(minY, Math.min(maxY - viewH, ty));
    if (!this.camReady) {
      this.camX = tx;
      this.camY = ty;
      this.camReady = true;
      return;
    }
    const k = Math.min(1, dt * 6);
    this.camX += (tx - this.camX) * k;
    this.camY += (ty - this.camY) * k;
  }

  private draw() {
    const canvas = this.canvas;
    const cssW = canvas.clientWidth || 1;
    const cssH = canvas.clientHeight || 1;
    this.cssW = cssW;
    this.cssH = cssH;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const bw = Math.max(1, Math.round(cssW * dpr));
    const bh = Math.max(1, Math.round(cssH * dpr));
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (!this.camReady) this.updateCamera(1);
    ctx.imageSmoothingEnabled = true;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const bg = ctx.createRadialGradient(cssW / 2, cssH * 0.45, 0, cssW / 2, cssH * 0.45, Math.max(cssW, cssH) * 0.8);
    bg.addColorStop(0, "#ECEDF0");
    bg.addColorStop(1, "#CDD1D7");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, cssW, cssH);

    const zoom = this.zoom;
    ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, -this.camX * dpr * zoom, -this.camY * dpr * zoom);
    const floor = this.floor;

    // 1) 바닥판·방 바닥: 불 켜진 방(AI 주무관)은 밝게, 채용 예정 방은 어둡게.
    const near = this.mode === "play" ? this.nearest(TALK_RADIUS) : null;
    const focusId = this.hovered ?? near?.id ?? null;
    drawGround(ctx, floor, focusId);

    // 2) 바닥 표시: 엘리베이터, 별관 통로, 목적지
    for (const spot of floor.spots) {
      if (spot.action === "floors") {
        floorQuad(ctx, spot.x - 14, spot.y - 22, 28, 28, "rgba(22, 40, 139, 0.10)", "rgba(22, 40, 139, 0.45)");
        const [sx, sy] = iso(spot.x, spot.y - 8);
        ctx.fillStyle = ISO.navy;
        ctx.font = "700 11px 'IBM Plex Sans KR', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("▲▼", sx, sy);
      }
      if (spot.action === "portal") {
        const [sx, sy] = iso(spot.x + 16, spot.y);
        ctx.fillStyle = ISO.tealDeep;
        ctx.font = "700 14px 'IBM Plex Sans KR', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(spot.portal === "ax" ? "→" : "←", sx, sy);
      }
    }
    if (this.marker) {
      const pulse = (Math.sin(this.time * 6) + 1) / 2;
      const [mx, my] = iso(this.marker.x, this.marker.y);
      ctx.strokeStyle = `rgba(0, 160, 173, ${0.5 + pulse * 0.4})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(mx, my, 12 + pulse * 4, 6 + pulse * 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 3) 벽·가구·사람을 깊이(x + y) 순서로 그린다. 사람 앞 벽은 반투명.
    const people: { x: number; y: number }[] = [{ x: this.x, y: this.y }];
    for (const spot of floor.spots) if (spot.actor) people.push({ x: spot.x, y: spot.y });
    const items: Item[] = wallItems(ctx, floor, people);
    for (const prop of floor.props) {
      if (prop.sprite === 2 || prop.sprite === 7) continue;
      items.push({ k: prop.x + prop.y, draw: () => drawProp(ctx, prop) });
    }
    for (const decor of floor.decors) {
      items.push({ k: decor.x + decor.w / 2 + decor.y + decor.h / 2, draw: () => drawDecor(ctx, decor) });
    }
    const playerScreenX = this.x - this.y;
    const drawOfficers = () => {
      for (const spot of floor.spots) {
        if (!spot.actor) continue;
        const dir = playerScreenX < spot.x - spot.y ? -1 : 1;
        person(ctx, spot.x, spot.y, OFFICER_STYLE, 0, dir, false);
      }
    };
    for (const spot of floor.spots) {
      if (!spot.actor) continue;
      const dir = playerScreenX < spot.x - spot.y ? -1 : 1;
      items.push({ k: spot.x + spot.y, draw: () => person(ctx, spot.x, spot.y, OFFICER_STYLE, 0, dir, false) });
    }
    for (const env of this.envelopes) {
      const k = env.t * env.t * (3 - 2 * env.t);
      const x = env.x + (env.tx - env.x) * k;
      const y = env.y + (env.ty - env.y) * k;
      const h = 40 + Math.sin(env.t * Math.PI) * 60;
      items.push({
        k: x + y + 1000,
        draw: () => {
          shadow(ctx, x, y, 6, 0.12);
          const [sx, sy] = iso(x, y, h);
          ctx.fillStyle = "#FFFFFF";
          ctx.strokeStyle = ISO.teal;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.rect(sx - 9, sy - 6, 18, 12);
          ctx.fill();
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(sx - 9, sy - 6);
          ctx.lineTo(sx, sy + 1);
          ctx.lineTo(sx + 9, sy - 6);
          ctx.stroke();
        },
      });
    }
    const moving = Math.hypot(this.vx, this.vy) > 8;
    const bob = moving ? Math.sin(this.time * 14) * 2 : 0;
    const drawPlayer = () => person(ctx, this.x, this.y, PLAYER_STYLE, bob, this.sdir, this.sback);
    items.push({ k: this.x + this.y, draw: drawPlayer });

    items.sort((a, b) => a.k - b.k);
    for (const item of items) item.draw();
    // 가구에 가려도 사람 윤곽은 옅게 보이게 한 번 더 그린다.
    ctx.globalAlpha = 0.28;
    drawOfficers();
    drawPlayer();
    ctx.globalAlpha = 1;

    // 6) 방 이름표는 확대와 상관없이 같은 크기로 화면 위에 띄운다.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const toScreen = (wx: number, wy: number, h = 0): [number, number] => {
      const [ix, iy] = iso(wx, wy, h);
      return [(ix - this.camX) * zoom, (iy - this.camY) * zoom];
    };
    for (const room of floor.rooms) {
      if (room.kind === "void") continue;
      if (room.kind === "utility") {
        const [ux, uy] = toScreen((room.x + room.w / 2) * TILE, (room.y + room.h / 2) * TILE, 4);
        if (zoom < 0.42 || room.w < 1) continue;
        ctx.font = "500 10px 'IBM Plex Sans KR', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "rgba(75, 85, 99, 0.75)";
        ctx.fillText(room.name, ux, uy);
        continue;
      }
      // 이름표는 방 가운데에서 주무관 반대쪽으로 비켜 놓아 사람을 가리지 않게 한다.
      const cx = (room.x + room.w / 2) * TILE;
      const cy = (room.y + room.h / 2) * TILE;
      const spot = floor.spots.find((s) => s.id === room.id);
      const lx = spot ? cx - (spot.x - cx) * 0.7 : cx;
      const ly = spot ? cy - (spot.y - cy) * 0.7 : cy;
      const [sx, sy] = toScreen(lx, ly, 6);
      if (sx < -120 || sy < -40 || sx > cssW + 120 || sy > cssH + 40) continue;
      const focus = this.hovered === room.id || near?.id === room.id;
      const tone = focus ? "focus" : room.kind === "ai" || room.kind === "planned" ? room.kind : "place";
      const sub = room.kind === "ai" ? "AI 주무관" : room.kind === "planned" ? "채용 예정" : undefined;
      pill(ctx, sx, sy, room.name, tone, sub);
    }
    for (const spot of floor.spots) {
      if (spot.kind === "feature") {
        const [fx, fy] = toScreen(spot.x, spot.y, 78);
        pill(ctx, fx, fy, spot.title, this.hovered === spot.id || near?.id === spot.id ? "focus" : "ai");
        continue;
      }
      if (spot.kind !== "facility") continue;
      const focus = this.hovered === spot.id || near?.id === spot.id;
      if (!focus) continue;
      const [sx, sy] = toScreen(spot.x, spot.y, 34);
      pill(ctx, sx, sy, spot.title, "focus");
    }
    if (this.fade > 0.01) {
      ctx.fillStyle = `rgba(238, 241, 246, ${this.fade})`;
      ctx.fillRect(0, 0, cssW, cssH);
    }
  }
}
