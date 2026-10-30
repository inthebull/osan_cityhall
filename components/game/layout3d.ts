// 층 데이터(FloorMap)를 3D 부품 목록으로 바꾼다. 1칸 = 1단위, 세계 px ÷ TILE.
// 부품은 모양·색별로 묶어 인스턴스로 그리므로 여기서는 숫자만 만든다.
import { MAP_H, MAP_W, TILE, type Decor, type FloorMap, type Prop } from "./world";

export type Shape = "box" | "cyl" | "ball";

export type Part = {
  shape: Shape;
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  color: string;
  glow?: boolean;
  alpha?: number;
  noShadow?: boolean;
};

export const H = {
  inner: 0.85,
  back: 1.5,
  front: 0.16,
  glass: 1.15,
  slab: 0.3,
};

export const C = {
  wall: "#F5F6F8",
  cap: "#C3C8D0",
  slab: "#DFE2E7",
  corridor: "#EEF0F2",
  white: "#FAFAFA",
  panel: "#E6E8EC",
  wood: "#D7B48A",
  dark: "#2B3340",
  screen: "#6FB5E8",
  chair: "#46689A",
  pot: "#C4673D",
  leafA: "#3F8F5F",
  leafB: "#57A874",
  leafC: "#6DBE87",
  navy: "#16288B",
  teal: "#00A0AD",
  glass: "#BFE0EE",
  window: "#9CC8E4",
  sofa: "#CDD1D8",
  step: "#E2E4E8",
};

const u = (px: number) => px / TILE;

function box(parts: Part[], x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string, extra: Partial<Part> = {}) {
  parts.push({ shape: "box", x, y, z, sx, sy, sz, color, ...extra });
}

export function buildWalls(floor: FloorMap): Part[] {
  const parts: Part[] = [];
  const grid = floor.grid;
  const outside = (x: number, y: number) => x < 0 || y < 0 || x >= MAP_W || y >= MAP_H || grid[y][x] === " ";
  const isWall = (x: number, y: number) => !outside(x, y) && grid[y][x] === "#";
  const kind = (x: number, y: number) =>
    outside(x, y + 1) || outside(x + 1, y) ? "front" : outside(x, y - 1) || outside(x - 1, y) ? "back" : "inner";
  const height = (k: string) => (k === "back" ? H.back : k === "front" ? H.front : H.inner);

  for (let ty = 0; ty < MAP_H; ty++) {
    for (let tx = 0; tx < MAP_W; tx++) {
      if (!isWall(tx, ty)) continue;
      const k = kind(tx, ty);
      const t = k === "inner" ? 0.12 : 0.18;
      const h = height(k);
      const cx = tx + 0.5;
      const cz = ty + 0.5;
      const segs: [number, number, number, number, number][] = [[cx, cz, t, t, h]];
      if (isWall(tx + 1, ty)) segs.push([cx + 0.5, cz, 1, t, Math.min(h, height(kind(tx + 1, ty)))]);
      if (isWall(tx, ty + 1)) segs.push([cx, cz + 0.5, t, 1, Math.min(h, height(kind(tx, ty + 1)))]);
      for (const [x, z, sx, sz, hh] of segs) {
        box(parts, x, hh / 2, z, sx, hh, sz, C.wall);
        box(parts, x, hh + 0.008, z, sx + 0.002, 0.016, sz + 0.002, C.cap, { noShadow: true });
        if (k === "front") {
          // 앞쪽 바깥벽은 낮게 자르고 위는 유리
          box(parts, x, hh + (H.glass - hh) / 2, z, sx, H.glass - hh, sz * 0.4, C.glass, { alpha: 0.22, noShadow: true });
        }
      }
      if (k === "back") {
        // 뒤쪽 바깥벽 안쪽 면의 창
        if (outside(tx, ty - 1) && !outside(tx, ty + 1) && !isWall(tx, ty + 1)) {
          box(parts, cx, 0.9, cz + t / 2 + 0.012, 0.72, 0.6, 0.02, C.window, { glow: true, noShadow: true });
        }
        if (outside(tx - 1, ty) && !outside(tx + 1, ty) && !isWall(tx + 1, ty)) {
          box(parts, cx + t / 2 + 0.012, 0.9, cz, 0.02, 0.6, 0.72, C.window, { glow: true, noShadow: true });
        }
      }
    }
  }
  return parts;
}

function desk(parts: Part[], x: number, z: number) {
  box(parts, x, 0.34, z, 0.98, 0.035, 0.48, C.white);
  box(parts, x - 0.46, 0.17, z, 0.035, 0.34, 0.46, C.panel);
  box(parts, x + 0.46, 0.17, z, 0.035, 0.34, 0.46, C.panel);
  box(parts, x, 0.37, z - 0.12, 0.08, 0.04, 0.06, C.dark);
  box(parts, x, 0.47, z - 0.13, 0.42, 0.24, 0.025, C.dark);
  box(parts, x, 0.47, z - 0.115, 0.38, 0.2, 0.006, C.screen, { glow: true, noShadow: true });
  box(parts, x, 0.365, z + 0.06, 0.3, 0.012, 0.1, "#D6D9DF", { noShadow: true });
}

function chair(parts: Part[], x: number, z: number) {
  parts.push({ shape: "cyl", x, y: 0.1, z, sx: 0.04, sy: 0.2, sz: 0.04, color: C.dark });
  box(parts, x, 0.21, z, 0.3, 0.05, 0.3, C.chair);
  box(parts, x, 0.38, z + 0.14, 0.3, 0.3, 0.04, C.chair);
}

function plant(parts: Part[], x: number, z: number, big: boolean) {
  const s = big ? 1 : 0.7;
  parts.push({ shape: "cyl", x, y: 0.11 * s, z, sx: 0.13 * s, sy: 0.22 * s, sz: 0.13 * s, color: C.pot });
  const leaves: [number, number, number, number, string][] = [
    [0, 0.42, 0, 0.17, C.leafA],
    [0.08, 0.55, -0.04, 0.14, C.leafB],
    [-0.08, 0.52, 0.05, 0.13, C.leafC],
    [0.02, 0.68, 0.02, 0.11, C.leafB],
  ];
  for (const [dx, dy, dz, r, c] of leaves) parts.push({ shape: "ball", x: x + dx * s, y: dy * s, z: z + dz * s, sx: r * s, sy: r * s * 1.1, sz: r * s, color: c });
}

export function buildFurniture(floor: FloorMap): Part[] {
  const parts: Part[] = [];
  for (const p of floor.props) addProp(parts, p);
  for (const d of floor.decors) addDecor(parts, d);
  return parts;
}

function addProp(parts: Part[], p: Prop) {
  const x = u(p.x);
  const z = u(p.y);
  switch (p.sprite) {
    case 0:
      desk(parts, x, z - 0.25);
      return;
    case 4:
      chair(parts, x, z - 0.06);
      return;
    case 5:
      box(parts, x, 0.32, z - 0.15, 0.5, 0.64, 0.36, C.white);
      box(parts, x, 0.22, z + 0.035, 0.46, 0.005, 0.005, "#B9BEC7", { noShadow: true });
      box(parts, x, 0.44, z + 0.035, 0.46, 0.005, 0.005, "#B9BEC7", { noShadow: true });
      return;
    case 1:
      plant(parts, x, z, true);
      return;
    case 3:
      box(parts, x, 0.2, z - 0.22, 1.3, 0.4, 0.42, C.white);
      box(parts, x, 0.42, z - 0.22, 1.36, 0.04, 0.48, C.wood);
      box(parts, x, 0.2, z - 0.005, 1.3, 0.05, 0.01, C.teal, { noShadow: true });
      box(parts, x + 0.35, 0.56, z - 0.32, 0.36, 0.22, 0.025, C.dark);
      box(parts, x + 0.35, 0.56, z - 0.305, 0.32, 0.18, 0.006, C.screen, { glow: true, noShadow: true });
      return;
    case 8:
      parts.push({ shape: "cyl", x, y: 0.25, z, sx: 0.025, sy: 0.5, sz: 0.025, color: "#8C94A3" });
      box(parts, x, 0.6, z, 0.46, 0.3, 0.04, C.navy);
      return;
    default:
      return;
  }
}

function addDecor(parts: Part[], d: Decor) {
  const x = u(d.x);
  const z = u(d.y);
  const w = u(d.w);
  const h = u(d.h);
  const cx = x + w / 2;
  const cz = z + h / 2;
  switch (d.kind) {
    case "table":
      box(parts, cx, 0.3, cz, w, 0.04, h, C.wood);
      for (const [ox, oz] of [
        [0.08, 0.08],
        [w - 0.08, 0.08],
        [0.08, h - 0.08],
        [w - 0.08, h - 0.08],
      ])
        box(parts, x + ox, 0.14, z + oz, 0.04, 0.28, 0.04, C.panel);
      return;
    case "sofa":
      box(parts, cx, 0.12, cz, w, 0.24, h, C.sofa);
      box(parts, x + 0.06, 0.28, cz, 0.12, 0.3, h, C.sofa);
      return;
    case "shelf": {
      box(parts, cx, 0.42, cz, w, 0.84, h, C.white);
      const colors = ["#2F5D8A", "#D97B4A", "#E8C468", "#6AA88E", "#B85C5C", "#7C8DB5"];
      let i = 0;
      for (const yy of [0.3, 0.58]) {
        for (let zz = z + 0.08; zz < z + h - 0.08; zz += 0.07) {
          box(parts, x - 0.01, yy, zz, 0.02, 0.16 + (i % 3) * 0.02, 0.05, colors[i % colors.length], { noShadow: true });
          i++;
        }
      }
      return;
    }
    case "bench":
      box(parts, cx, 0.16, cz, w, 0.05, Math.max(0.15, h - 0.2), C.wood);
      box(parts, cx, 0.07, cz, w * 0.9, 0.14, 0.06, C.panel);
      return;
    case "cooler":
      box(parts, cx, 0.28, cz, 0.3, 0.56, 0.3, C.white);
      box(parts, cx, 0.66, cz, 0.22, 0.2, 0.22, "#A8D8EE", { alpha: 0.7 });
      return;
    case "screen":
      box(parts, cx, 0.75, z + 0.05, w, 0.5, 0.04, C.dark);
      box(parts, cx, 0.75, z + 0.075, w * 0.94, 0.44, 0.006, C.screen, { glow: true, noShadow: true });
      return;
    case "stairs": {
      const n = 8;
      for (let i = 0; i < n; i++) {
        const top = ((i + 1) / n) * 0.7;
        if (d.dir === "y") box(parts, cx, top / 2, z + (h / n) * (i + 0.5), w, top, h / n, C.step);
        else box(parts, x + (w / n) * (i + 0.5), top / 2, cz, w / n, top, h, C.step);
      }
      return;
    }
    default:
      return;
  }
}
