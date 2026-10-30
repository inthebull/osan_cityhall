import playerUrl from "./art/player.png";
import npcUrl from "./art/npc.png";
import propsUrl from "./art/props.png";
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

const SAVE_KEY = "osan-ai-hall-v3";
const SAVE_KEY_V2 = "osan-ai-hall-v2";

export type Hud = {
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

type Dust = { x: number; y: number; life: number };
type Envelope = { x: number; y: number; tx: number; ty: number; t: number };

const STAMP_NAME: Record<string, string> = {
  guide: "안내데스크",
  minwon: "민원여권과",
  jachi: "자치행정과",
  ping: "업무 핑퐁",
  market: "도구 상가",
  roof: "옥상 상황판",
};

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`sprite ${src}`));
    img.src = src;
  });
}

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

export class HallEngine {
  keys = new Set<string>();
  joy = { x: 0, y: 0 };
  insetLeft = 0;
  hasSave = false;
  mode: "title" | "play" = "title";

  private floor: FloorMap = FLOORS.f1;
  private x = FLOORS.f1.spawn.x;
  private y = FLOORS.f1.spawn.y;
  private face = 0;
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
  private toast = "";
  private toastT = 0;
  private prompt: string | null = null;
  private lastHud = "";
  private dust: Dust[] = [];
  private envelopes: Envelope[] = [];
  private images: { player?: HTMLImageElement; npc?: HTMLImageElement; props?: HTMLImageElement } = {};
  private camX = 0;
  private camY = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private hooks: Hooks,
  ) {
    this.load();
    void this.loadArt();
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
  }

  unlock() {
    this.locked = false;
  }

  interact() {
    if (this.mode !== "play" || this.locked || this.fading) return;
    const spot = this.nearest(64);
    if (!spot) return;
    sfx.talk();
    this.hooks.onSpot(spot);
  }

  go(id: FloorId) {
    if (this.fading || id === this.floor.id) return;
    this.pending = id;
    this.fading = true;
    this.fadeOut = true;
    sfx.floor();
  }

  visit(floorId: FloorId, spotId: string) {
    if (this.mode !== "play" || this.fading) return;
    const floor = FLOORS[floorId];
    const spot = floor.spots.find((item) => item.id === spotId);
    if (!spot) return;
    this.floor = floor;
    const offsets: [number, number][] = [
      [0, 28],
      [0, -28],
      [-28, 0],
      [28, 0],
      [0, 44],
      [0, -44],
      [-44, 0],
      [44, 0],
    ];
    let x = floor.spawn.x;
    let y = floor.spawn.y;
    for (const [dx, dy] of offsets) {
      if (!this.blocked(spot.x + dx, spot.y + dy)) {
        x = spot.x + dx;
        y = spot.y + dy;
        break;
      }
    }
    this.x = x;
    this.y = y;
    if (Math.abs(spot.x - x) > Math.abs(spot.y - y)) this.face = spot.x < x ? 1 : 2;
    else this.face = spot.y < y ? 3 : 0;
    this.persist();
    this.emit(true);
    sfx.talk();
    this.hooks.onSpot(spot);
  }

  grant(stamp?: string) {
    if (!stamp || this.stamps.includes(stamp)) return;
    this.stamps = [...this.stamps, stamp];
    this.toast = `${STAMP_NAME[stamp] ?? stamp} 도장`;
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
      this.envelopes.push({
        x: this.x,
        y: this.y - 28,
        tx: spot.x,
        ty: spot.y - 36,
        t: 0,
      });
    }
    sfx.ping();
    this.persist();
    this.emit(true);
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

  private async loadArt() {
    const [player, npc, props] = await Promise.all([
      loadImage(playerUrl),
      loadImage(npcUrl),
      loadImage(propsUrl),
    ]);
    this.images = { player, npc, props };
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
    for (const d of this.dust) d.life -= dt;
    this.dust = this.dust.filter((d) => d.life > 0);
    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT <= 0) this.toast = "";
    }

    const canMove = this.mode === "play" && !this.locked && !this.fading;
    let ix = this.joy.x;
    let iy = this.joy.y;
    if (canMove) {
      if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) ix -= 1;
      if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) ix += 1;
      if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) iy -= 1;
      if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) iy += 1;
    }
    const mag = Math.hypot(ix, iy);
    if (mag > 1) {
      ix /= mag;
      iy /= mag;
    }

    const speed = 156;
    const ox = this.x;
    const oy = this.y;
    if (canMove && mag > 0.08) {
      const nx = this.x + ix * speed * dt;
      const ny = this.y + iy * speed * dt;
      if (!this.blocked(nx, this.y)) this.x = nx;
      if (!this.blocked(this.x, ny)) this.y = ny;
      if (Math.abs(ix) > Math.abs(iy)) this.face = ix < 0 ? 1 : 2;
      else this.face = iy < 0 ? 3 : 0;
      this.stepClock += dt;
      if (this.stepClock > 0.28) {
        this.stepClock = 0;
        sfx.step();
        this.dust.push({ x: this.x, y: this.y + 8, life: 0.28 });
      }
    } else {
      this.stepClock = 0;
    }
    this.vx = (this.x - ox) / dt;
    this.vy = (this.y - oy) / dt;

    const near = this.mode === "play" && !this.locked ? this.nearest(64) : null;
    const prompt = near ? near.title : null;
    if (prompt !== this.prompt) {
      this.prompt = prompt;
      this.emit(true);
    } else if (this.toastT > 0) {
      this.emit(false);
    }
  }

  private updateFade(dt: number) {
    if (this.fadeOut) {
      this.fade = Math.min(1, this.fade + dt * 2.6);
      if (this.fade >= 1 && this.pending) {
        const next = FLOORS[this.pending];
        this.floor = next;
        this.x = next.spawn.x;
        this.y = next.spawn.y;
        this.pending = null;
        this.fadeOut = false;
        this.fading = false;
        this.envelopes = [];
        this.persist();
        this.emit(true);
      }
      return;
    }
    if (this.fade > 0) this.fade = Math.max(0, this.fade - dt * 2.2);
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

  private hud(): Hud {
    return {
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

  private draw() {
    const canvas = this.canvas;
    const cssW = canvas.clientWidth || 1;
    const cssH = canvas.clientHeight || 1;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const bw = Math.max(1, Math.round(cssW * dpr));
    const bh = Math.max(1, Math.round(cssH * dpr));
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;

    const tilesX = cssW < 720 ? 9 : 12;
    const tilesY = cssW < 720 ? 11 : 10;
    const zoom = Math.min(cssW / (tilesX * TILE), cssH / (tilesY * TILE));
    const viewW = cssW / zoom;
    const viewH = cssH / zoom;
    const inset = this.insetLeft;
    let camX = this.x - (cssW + inset) / (2 * zoom);
    let camY = this.y - viewH / 2;
    camX = Math.max(0, Math.min(MAP_W * TILE - viewW, camX));
    camY = Math.max(0, Math.min(MAP_H * TILE - viewH, camY));
    this.camX = camX;
    this.camY = camY;

    ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, -camX * dpr * zoom, -camY * dpr * zoom);
    ctx.fillStyle = "#1a2638";
    ctx.fillRect(camX, camY, viewW, viewH);

    const x0 = Math.max(0, Math.floor(camX / TILE) - 1);
    const y0 = Math.max(0, Math.floor(camY / TILE) - 2);
    const x1 = Math.min(MAP_W, Math.ceil((camX + viewW) / TILE) + 1);
    const y1 = Math.min(MAP_H, Math.ceil((camY + viewH) / TILE) + 2);

    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const ch = this.floor.grid[y][x];
        if (ch !== "#") this.drawFloor(ctx, x, y, ch);
      }
    }
    for (const decor of this.floor.decors) {
      if (decor.kind === "rug" || decor.kind === "mat") this.drawDecor(ctx, decor);
    }

    type Item = { y: number; draw: () => void };
    const items: Item[] = [];

    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        if (this.floor.grid[y][x] !== "#") continue;
        const px = x * TILE;
        const py = y * TILE;
        items.push({ y: py + TILE, draw: () => this.drawWall(ctx, px, py) });
      }
    }

    for (const prop of this.floor.props) {
      items.push({
        y: prop.y,
        draw: () => this.drawProp(ctx, prop),
      });
    }
    for (const decor of this.floor.decors) {
      if (decor.kind === "rug" || decor.kind === "mat") continue;
      items.push({
        y: decor.y + decor.h,
        draw: () => this.drawDecor(ctx, decor),
      });
    }

    for (const spot of this.floor.spots) {
      if (!spot.actor) continue;
      const bob = Math.floor(this.time * 2) % 2;
      items.push({
        y: spot.y,
        draw: () => {
          this.drawShadow(ctx, spot.x, spot.y);
          this.blit(ctx, this.images.npc, 4, 4, bob, 0, spot.x, spot.y, 46, 58);
        },
      });
    }

    for (const env of this.envelopes) {
      const k = env.t * env.t * (3 - 2 * env.t);
      const x = env.x + (env.tx - env.x) * k;
      const y = env.y + (env.ty - env.y) * k - Math.sin(env.t * Math.PI) * 36;
      items.push({
        y,
        draw: () => this.blit(ctx, this.images.props, 3, 3, 0, 2, x, y, 28, 28),
      });
    }

    const moving = Math.hypot(this.vx, this.vy) > 8;
    const frame = moving ? Math.floor(this.time * 9) % 4 : 0;
    items.push({
      y: this.y,
      draw: () => {
        this.drawShadow(ctx, this.x, this.y);
        this.blit(ctx, this.images.player, 4, 4, frame, this.face, this.x, this.y, 48, 60);
      },
    });

    for (const d of this.dust) {
      items.push({
        y: d.y,
        draw: () => {
          ctx.globalAlpha = Math.max(0, d.life / 0.28);
          ctx.fillStyle = "#c4a574";
          ctx.fillRect(d.x - 2, d.y, 3, 2);
          ctx.globalAlpha = 1;
        },
      });
    }

    items.sort((a, b) => a.y - b.y);
    for (const item of items) item.draw();

    ctx.font = "700 13px 'IBM Plex Sans KR', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const label of this.floor.labels) {
      if (label.x < camX - 40 || label.x > camX + viewW + 40) continue;
      if (label.y < camY - 20 || label.y > camY + viewH + 20) continue;
      const w = Math.max(52, ctx.measureText(label.text).width + 14);
      ctx.fillStyle = "#fbf7f0";
      ctx.fillRect(label.x - w / 2, label.y - 9, w, 18);
      ctx.strokeStyle = "#24344c";
      ctx.lineWidth = 2;
      ctx.strokeRect(label.x - w / 2, label.y - 9, w, 18);
      ctx.fillStyle = "#24344c";
      ctx.fillText(label.text, label.x, label.y + 1);
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.fade > 0.01) {
      ctx.fillStyle = `rgba(26, 38, 56, ${this.fade})`;
      ctx.fillRect(0, 0, cssW, cssH);
    }
  }

  private drawFloor(ctx: CanvasRenderingContext2D, x: number, y: number, ch: string) {
    const px = x * TILE;
    const py = y * TILE;
    if (ch === "w") {
      ctx.fillStyle = ((x + y) & 1) === 0 ? "#e7c48a" : "#e0ba7c";
      ctx.fillRect(px, py, TILE, TILE);
      ctx.fillStyle = "#d0a868";
      ctx.fillRect(px, py + 15, TILE, 1);
    } else if (ch === "c") {
      ctx.fillStyle = ((x + y) & 1) === 0 ? "#7ec8bc" : "#72bfb2";
      ctx.fillRect(px, py, TILE, TILE);
      ctx.fillStyle = "#f4efe6";
      ctx.fillRect(px + 4, py + 4, 2, 2);
    } else if (ch === "t") {
      ctx.fillStyle = "#f3efe6";
      ctx.fillRect(px, py, TILE, TILE);
      ctx.strokeStyle = "#e3d9c8";
      ctx.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
    } else if (ch === "g") {
      ctx.fillStyle = ((x * 3 + y) & 3) === 0 ? "#6fb56a" : "#7dc476";
      ctx.fillRect(px, py, TILE, TILE);
      ctx.fillStyle = "#4f8f55";
      ctx.fillRect(px + 6, py + 18, 3, 3);
      ctx.fillRect(px + 20, py + 8, 3, 3);
    } else if (ch === "r") {
      ctx.fillStyle = "#e7a39a";
      ctx.fillRect(px, py, TILE, TILE);
      ctx.fillStyle = "#f6d2cb";
      ctx.fillRect(px + 6, py, TILE - 12, TILE);
    } else {
      ctx.fillStyle = ((x + y) & 1) === 0 ? "#f7f1e6" : "#f3ecdf";
      ctx.fillRect(px, py, TILE, TILE);
      ctx.strokeStyle = "#e6dccb";
      ctx.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
    }
  }

  private drawDecor(ctx: CanvasRenderingContext2D, decor: Decor) {
    const { x, y, w, h, kind } = decor;
    if (w < 8 || h < 8) return;
    if (kind === "rug" || kind === "mat") {
      ctx.save();
      ctx.globalAlpha = kind === "mat" ? 0.9 : 0.5;
      ctx.fillStyle = decor.tint ?? "#c45c4a";
      ctx.fillRect(x, y, w, h);
      ctx.restore();
      ctx.strokeStyle = "rgba(36, 52, 76, 0.35)";
      ctx.strokeRect(x + 2.5, y + 2.5, Math.max(1, w - 5), Math.max(1, h - 5));
      return;
    }
    if (kind === "window") {
      ctx.fillStyle = "#9fd4ea";
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = "#f7fbff";
      ctx.fillRect(x + 2, y + 2, w / 2 - 3, h - 4);
      ctx.strokeStyle = "#24344c";
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      return;
    }
    if (kind === "board") {
      ctx.fillStyle = "#c9843a";
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = "#24344c";
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      ctx.fillStyle = "#fbf7f0";
      ctx.fillRect(x + 3, y + 3, 8, 6);
      ctx.fillStyle = "#7ec8bc";
      ctx.fillRect(x + 13, y + 4, 9, 5);
      ctx.fillStyle = "#b84b45";
      ctx.fillRect(x + 4, y + 11, 14, 3);
      return;
    }
    if (kind === "lamp") {
      ctx.fillStyle = "#8a5a32";
      ctx.fillRect(x + w / 2 - 1, y, 3, h);
      ctx.fillStyle = "#f0d48a";
      ctx.fillRect(x, y, w, 6);
      ctx.strokeStyle = "#24344c";
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, 5);
      return;
    }
    if (kind === "sofa") {
      ctx.fillStyle = decor.tint ?? "#f0c3cf";
      ctx.fillRect(x, y + 4, w, h - 4);
      ctx.fillStyle = "#24344c";
      ctx.fillRect(x, y, 4, h);
      ctx.fillRect(x + w - 4, y, 4, h);
      ctx.fillRect(x, y, w, 4);
      return;
    }
    if (kind === "cooler") {
      ctx.fillStyle = "#d7f3ea";
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = "#1f9a7c";
      ctx.fillRect(x, y, w, 5);
      ctx.fillStyle = "#9fd4ea";
      ctx.fillRect(x + 3, y + 8, w - 6, h - 12);
      ctx.strokeStyle = "#24344c";
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      return;
    }
    if (kind === "flag") {
      ctx.fillStyle = "#8a5a32";
      ctx.fillRect(x, y, 3, h);
      ctx.fillStyle = decor.tint ?? "#c4524a";
      ctx.fillRect(x + 3, y + 1, w - 3, h * 0.45);
      ctx.fillStyle = "#fbf7f0";
      ctx.fillRect(x + 3, y + 1 + h * 0.15, w - 3, 3);
      return;
    }
    if (kind === "screen") {
      ctx.fillStyle = "#24344c";
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = "#d7f3ea";
      ctx.fillRect(x + 3, y + 3, w - 6, h - 8);
      ctx.fillStyle = "#1f9a7c";
      ctx.fillRect(x + 5, y + 6, w * 0.4, 3);
      ctx.fillStyle = "#8a5a32";
      ctx.fillRect(x + w / 2 - 4, y + h - 4, 8, 4);
      return;
    }
    if (kind === "papers") {
      ctx.fillStyle = "#fbf7f0";
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = "#efe2cc";
      ctx.fillRect(x + 4, y + 2, w - 6, h - 2);
      ctx.fillStyle = "#24344c";
      ctx.fillRect(x + 4, y + 4, w * 0.5, 2);
      ctx.fillRect(x + 4, y + 8, w * 0.35, 2);
      ctx.strokeStyle = "#24344c";
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      return;
    }
    if (kind === "bench") {
      ctx.fillStyle = decor.tint ?? "#c9843a";
      ctx.fillRect(x, y + 3, w, h - 6);
      ctx.fillStyle = "#8a5a32";
      ctx.fillRect(x + 2, y + h - 4, 4, 6);
      ctx.fillRect(x + w - 6, y + h - 4, 4, 6);
      ctx.strokeStyle = "#24344c";
      ctx.strokeRect(x + 0.5, y + 3.5, w - 1, h - 7);
      return;
    }
    if (kind === "table") {
      ctx.fillStyle = decor.tint ?? "#e7c49a";
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = "#8a5a32";
      ctx.lineWidth = 3;
      ctx.strokeRect(x + 2, y + 2, Math.max(1, w - 4), Math.max(1, h - 4));
      ctx.lineWidth = 1;
      ctx.strokeStyle = "#24344c";
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      return;
    }
    ctx.fillStyle = "#8a5a32";
    ctx.fillRect(x, y, w, h);
    const colors = ["#c4524a", "#2f6f4e", "#2454a0", "#e0b15a"];
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = colors[i] ?? "#c4524a";
      ctx.fillRect(x + 2, y + 3 + i * (h / 4), w - 4, Math.max(3, h / 5));
    }
  }

  private drawWall(ctx: CanvasRenderingContext2D, x: number, y: number) {
    const lift = 14;
    ctx.fillStyle = "#8a6844";
    ctx.fillRect(x, y - lift, TILE, TILE + lift);
    ctx.fillStyle = "#f6ecda";
    ctx.fillRect(x + 2, y - lift + 2, TILE - 4, 7);
    ctx.fillStyle = "#efe0c8";
    ctx.fillRect(x + 2, y - lift + 10, TILE - 4, TILE + lift - 14);
    ctx.fillStyle = "#d9c4a4";
    ctx.fillRect(x + 2, y + TILE - 6, TILE - 4, 4);
  }

  private drawShadow(ctx: CanvasRenderingContext2D, x: number, y: number) {
    ctx.fillStyle = "rgba(44, 36, 22, 0.22)";
    ctx.beginPath();
    ctx.ellipse(x, y + 2, 10, 4, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawProp(ctx: CanvasRenderingContext2D, prop: Prop) {
    const col = prop.sprite % 3;
    const row = Math.floor(prop.sprite / 3);
    this.blit(ctx, this.images.props, 3, 3, col, row, prop.x, prop.y, 42, 42);
  }

  private blit(
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement | undefined,
    cols: number,
    rows: number,
    col: number,
    row: number,
    x: number,
    y: number,
    dw: number,
    dh: number,
  ) {
    if (!img) return;
    const sw = img.width / cols;
    const sh = img.height / rows;
    ctx.drawImage(img, col * sw, row * sh, sw, sh, x - dw / 2, y - dh + 6, dw, dh);
  }
}
