import { sfx } from "./audio";
import {
  FLOORS,
  MAP_H,
  MAP_W,
  PING_TARGET,
  TILE,
  isSolidTile,
  questHint,
  tileAt,
  type Decor,
  type FloorId,
  type FloorMap,
  type Prop,
  type Spot,
} from "./world";
import {
  ISO,
  OFFICER_STYLE,
  PLAYER_STYLE,
  WALL_H,
  box,
  floorQuad,
  fromIso,
  iso,
  person,
  pill,
  shadow,
} from "./iso";

const SAVE_KEY = "osan-ai-hall-v3";
const SAVE_KEY_V2 = "osan-ai-hall-v2";

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
  guide: "안내데스크",
  minwon: "민원여권과",
  jachi: "자치행정과",
  ping: "업무 핑퐁",
  market: "도구 상가",
  roof: "옥상 상황판",
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

  markPingpong() {
    this.pingpongs += 1;
    this.grant("ping");
    const spot = this.floor.spots.find((s) => s.id === PING_TARGET);
    if (spot) {
      this.envelopes.push({ x: this.x, y: this.y, tx: spot.x, ty: spot.y, t: 0 });
    }
    sfx.ping();
    this.persist();
    this.emit(true);
  }

  // 화면 좌표(CSS px)에 있는 방을 찾아 마우스 모양을 바꾸는 데 쓴다.
  pointerMove(cssX: number, cssY: number) {
    if (this.mode !== "play") {
      this.hovered = null;
      return null;
    }
    const [wx, wy] = this.pick(cssX, cssY);
    const spot = this.spotAt(wx, wy);
    this.hovered = spot?.id ?? null;
    return this.hovered;
  }

  pointerClick(cssX: number, cssY: number) {
    if (this.mode !== "play" || this.locked || this.fading) return;
    const [wx, wy] = this.pick(cssX, cssY);
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
      if (spot.kind === "facility" && Math.hypot(spot.x - wx, spot.y - wy) < 30) return spot;
    }
    const room = this.floor.rooms.find(
      (r) => wx >= r.x * TILE && wx < (r.x + r.w) * TILE && wy >= r.y * TILE && wy < (r.y + r.h) * TILE,
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
      const raw = localStorage.getItem(SAVE_KEY) ?? localStorage.getItem(SAVE_KEY_V2);
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
    this.draw();
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
    const bg = ctx.createLinearGradient(0, 0, 0, cssH);
    bg.addColorStop(0, "#F3F5F9");
    bg.addColorStop(1, "#E4E8EF");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, cssW, cssH);

    const zoom = this.zoom;
    ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, -this.camX * dpr * zoom, -this.camY * dpr * zoom);

    const W = MAP_W * TILE;
    const H = MAP_H * TILE;
    const floor = this.floor;

    // 1) 층 바닥판: 두께가 있는 판 위에 층을 올린 모형처럼 보이게 한다.
    ctx.save();
    ctx.shadowColor = "rgba(22, 40, 70, 0.18)";
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 24;
    floorQuad(ctx, 0, 0, W, H, ISO.slabTop, undefined, 0);
    ctx.restore();
    box(ctx, 0, 0, W, H, 16, ISO.slabTop, -16, { left: ISO.slabLeft, right: ISO.slabRight });

    // 2) 복도 바닥
    for (let ty = 0; ty < MAP_H; ty++) {
      for (let tx = 0; tx < MAP_W; tx++) {
        const ch = floor.grid[ty][tx];
        if (ch === "#") continue;
        const fill = ch === "r" ? "#D5EEF0" : ch === "g" ? ISO.greenFloor : ISO.corridor;
        floorQuad(ctx, tx * TILE, ty * TILE, TILE, TILE, fill, ISO.corridorLine);
      }
    }

    // 3) 방 바닥: 불 켜진 방(AI 주무관)과 불 꺼진 방(채용 예정)을 색으로 나눈다.
    const near = this.mode === "play" ? this.nearest(TALK_RADIUS) : null;
    for (const room of floor.rooms) {
      const fill =
        room.kind === "planned"
          ? ISO.plannedFloor
          : room.ground === "g"
            ? ISO.greenFloor
            : room.kind === "ai"
              ? ISO.aiFloor
              : ISO.featureFloor;
      floorQuad(ctx, room.x * TILE, room.y * TILE, room.w * TILE, room.h * TILE, fill);
      if (room.kind === "ai") {
        const [cx, cy] = iso((room.x + room.w / 2) * TILE, (room.y + room.h / 2) * TILE);
        const r = Math.max(room.w, room.h) * TILE * 0.9;
        const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        glow.addColorStop(0, "rgba(0, 160, 173, 0.16)");
        glow.addColorStop(1, "rgba(0, 160, 173, 0)");
        ctx.save();
        ctx.beginPath();
        const pts = [
          iso(room.x * TILE, room.y * TILE),
          iso((room.x + room.w) * TILE, room.y * TILE),
          iso((room.x + room.w) * TILE, (room.y + room.h) * TILE),
          iso(room.x * TILE, (room.y + room.h) * TILE),
        ];
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]);
        ctx.closePath();
        ctx.clip();
        ctx.fillStyle = glow;
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
        ctx.restore();
      }
      const focus = this.hovered === room.id || near?.id === room.id;
      if (focus) {
        ctx.save();
        ctx.setLineDash([6, 4]);
        floorQuad(ctx, room.x * TILE + 3, room.y * TILE + 3, room.w * TILE - 6, room.h * TILE - 6, "rgba(0, 160, 173, 0.06)", ISO.teal);
        ctx.restore();
      }
    }

    // 4) 바닥 표시: 엘리베이터, 별관 통로, 목적지
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

    // 5) 벽·가구·사람을 깊이(x + y) 순서로 그린다.
    type Item = { k: number; draw: () => void };
    const items: Item[] = [];
    const grid = floor.grid;
    for (let ty = 0; ty < MAP_H; ty++) {
      for (let tx = 0; tx < MAP_W; tx++) {
        if (grid[ty][tx] !== "#") continue;
        const southOpen = ty + 1 >= MAP_H || grid[ty + 1][tx] !== "#";
        const eastOpen = tx + 1 >= MAP_W || grid[ty][tx + 1] !== "#";
        items.push({
          k: (tx + ty + 1) * TILE,
          draw: () =>
            box(ctx, tx * TILE, ty * TILE, TILE, TILE, WALL_H, ISO.wallTop, 0, {
              left: ISO.wallLeft,
              right: ISO.wallRight,
              faces: { left: southOpen, right: eastOpen },
            }),
        });
      }
    }
    for (const prop of floor.props) {
      if (prop.sprite === 2 || prop.sprite === 7) continue;
      items.push({ k: prop.x + prop.y, draw: () => this.drawProp(ctx, prop) });
    }
    for (const decor of floor.decors) {
      items.push({ k: decor.x + decor.w / 2 + decor.y + decor.h / 2, draw: () => this.drawDecor(ctx, decor) });
    }
    const playerScreenX = this.x - this.y;
    for (const spot of floor.spots) {
      if (!spot.actor) continue;
      const dir = playerScreenX < spot.x - spot.y ? -1 : 1;
      const breathe = Math.sin(this.time * 2 + spot.x) * 0.4;
      items.push({ k: spot.x + spot.y, draw: () => person(ctx, spot.x, spot.y, OFFICER_STYLE, breathe, dir, false) });
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
    items.push({ k: this.x + this.y, draw: () => person(ctx, this.x, this.y, PLAYER_STYLE, bob, this.sdir, this.sback) });

    items.sort((a, b) => a.k - b.k);
    for (const item of items) item.draw();

    // 6) 방 이름표는 확대와 상관없이 같은 크기로 화면 위에 띄운다.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const toScreen = (wx: number, wy: number, h = 0): [number, number] => {
      const [ix, iy] = iso(wx, wy, h);
      return [(ix - this.camX) * zoom, (iy - this.camY) * zoom];
    };
    for (const room of floor.rooms) {
      // 이름표는 방 가운데에서 주무관 반대쪽으로 비켜 놓아 사람을 가리지 않게 한다.
      const cx = (room.x + room.w / 2) * TILE;
      const cy = (room.y + room.h / 2) * TILE;
      const spot = floor.spots.find((s) => s.id === room.id);
      const lx = spot ? cx - (spot.x - cx) * 0.7 : cx;
      const ly = spot ? cy - (spot.y - cy) * 0.7 : cy;
      const [sx, sy] = toScreen(lx, ly, 6);
      if (sx < -120 || sy < -40 || sx > cssW + 120 || sy > cssH + 40) continue;
      const focus = this.hovered === room.id || near?.id === room.id;
      const tone = focus ? "focus" : room.kind === "facility" ? "feature" : room.kind;
      const sub = room.kind === "ai" ? "AI 주무관" : room.kind === "planned" ? "채용 예정" : undefined;
      pill(ctx, sx, sy, room.name, tone, sub);
    }
    for (const spot of floor.spots) {
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

  private drawProp(ctx: CanvasRenderingContext2D, prop: Prop) {
    const { x, y } = prop;
    switch (prop.sprite) {
      case 0: {
        // 책상과 모니터
        shadow(ctx, x, y - 8, 22, 0.08);
        box(ctx, x - 18, y - 16, 36, 16, 13, "#FFFFFF", 0, { left: "#E1E5EC", right: "#CDD3DD" });
        box(ctx, x - 7, y - 15, 14, 3, 10, "#2A3448", 13, { left: "#3D4F6E", right: "#232C3D", top: "#2A3448" });
        return;
      }
      case 3: {
        // 민원 창구·안내 데스크
        shadow(ctx, x, y - 6, 26, 0.08);
        box(ctx, x - 22, y - 14, 44, 14, 15, "#FFFFFF", 0, { left: "#E7EBF1", right: "#D3D9E2" });
        box(ctx, x - 22, y - 0.6, 44, 0.6, 3, ISO.teal, 10, { left: ISO.teal, right: ISO.tealDeep, top: ISO.teal });
        return;
      }
      case 4: {
        box(ctx, x - 5, y - 6, 10, 10, 2, "#9AA6B8", 5, { left: "#8995A8", right: "#788498" });
        box(ctx, x - 5, y - 7, 10, 2, 11, "#A9B4C6", 5, { left: "#97A2B4", right: "#8692A5" });
        return;
      }
      case 5: {
        box(ctx, x - 9, y - 10, 18, 12, 26, "#ECEFF4", 0, { left: "#DCE1E9", right: "#C8CFDA" });
        return;
      }
      case 1: {
        box(ctx, x - 5, y - 5, 10, 10, 9, "#D7DCE4", 0, { left: "#C5CBD5", right: "#B4BBC7" });
        const [sx, sy] = iso(x, y, 20);
        ctx.fillStyle = "#3E9E70";
        ctx.beginPath();
        ctx.arc(sx + 3, sy + 2, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#5DB98A";
        ctx.beginPath();
        ctx.arc(sx - 2, sy - 2, 8, 0, Math.PI * 2);
        ctx.fill();
        return;
      }
      case 6: {
        box(ctx, x - 6, y - 6, 12, 9, 3, "#FFFFFF", 13, { left: "#E3E7ED", right: "#D3D9E2" });
        return;
      }
      case 8: {
        box(ctx, x - 7, y - 2, 14, 3, 20, ISO.navy, 0, { left: "#22369E", right: "#101E6B", top: "#2A3FAE" });
        return;
      }
    }
  }

  private drawDecor(ctx: CanvasRenderingContext2D, decor: Decor) {
    const { x, y, w, h } = decor;
    switch (decor.kind) {
      case "table":
        box(ctx, x, y, w, h, 12, "#FFFFFF", 0, { left: "#E3E7ED", right: "#D0D6E0" });
        return;
      case "sofa":
        box(ctx, x, y, w, h, 8, "#CBD5EA", 0);
        box(ctx, x, y, w, 4, 14, "#BAC6E0", 0);
        return;
      case "shelf":
        box(ctx, x, y, w, h, 24, "#ECEFF4", 0, { left: "#DCE1E9", right: "#C8CFDA" });
        return;
      case "bench":
        box(ctx, x, y + 3, w, Math.max(4, h - 6), 7, "#D8DDE6", 0);
        return;
      case "cooler":
        box(ctx, x, y + h - 10, w - 2, 10, 20, "#FFFFFF", 0, { left: "#E7EBF1", right: "#D3D9E2" });
        box(ctx, x + 2, y + h - 8, w - 6, 6, 6, "#BFE6EA", 20);
        return;
      case "screen":
        box(ctx, x, y, w, 4, 16, "#2A3448", 4, { left: "#3D4F6E", right: "#232C3D" });
        return;
      default:
        return;
    }
  }
}
