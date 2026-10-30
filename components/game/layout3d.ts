// 층 데이터(FloorMap)를 3D 부품 목록으로 바꾼다. 1칸 = 1단위, 세계 px ÷ TILE.
// 부품은 모양·색별로 묶어 인스턴스로 그리므로 여기서는 숫자만 만든다.
// 겉모습 기준: 흰 벽 단면 모형, 밝은 원목 바닥, 흰 책상·파란 의자·화분(참고 이미지).
import { MAP_H, MAP_W, TILE, type Decor, type FloorMap, type Prop } from "./world";

export type Shape = "box" | "cyl" | "ball" | "cone";

export type Part = {
  shape: Shape;
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  color: string;
  ry?: number;
  rx?: number;
  glow?: boolean;
  alpha?: number;
  noShadow?: boolean;
};

export const H = {
  inner: 1.15,
  back: 1.55,
  front: 0.3,
  glass: 1.15,
  slab: 0.36,
};

export const C = {
  wall: "#FBFBFA",
  wallTop: "#ECEDEF",
  slab: "#F4F4F2",
  white: "#FCFCFB",
  panel: "#EDEEF0",
  wood: "#D9B68A",
  woodDark: "#B98F62",
  dark: "#262B33",
  screen: "#9FD3F2",
  chair: "#3E5F92",
  chairDark: "#2D3A4E",
  privacy: "#93ADCF",
  pot: "#F2F1EE",
  terracotta: "#C9784F",
  leafA: "#2F7A4B",
  leafB: "#3F9159",
  leafC: "#5BAA6A",
  navy: "#16288B",
  teal: "#00A0AD",
  glass: "#CFE8F2",
  window: "#BFE0F3",
  sofa: "#C7CBD1",
  rug: "#D5DCE5",
  step: "#F1F1EF",
};

const PRINTS = ["#E9C46A", "#89B4D6", "#E59C7C", "#9CC5A1", "#C9B8E0", "#F1D5A8"];
const BOOKS = ["#2F5D8A", "#D97B4A", "#E8C468", "#6AA88E", "#B85C5C", "#7C8DB5", "#F2EFE9", "#3B3F48"];
const SHIRTS = ["#F2F2F0", "#C9D8EA", "#E8C6B8", "#2F3B52", "#9DB9A6"];

const u = (px: number) => px / TILE;
// 같은 자리에는 늘 같은 소품이 놓이도록 위치로 정하는 난수
const hash = (x: number, z: number) => {
  const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return s - Math.floor(s);
};

function box(parts: Part[], x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string, extra: Partial<Part> = {}) {
  parts.push({ shape: "box", x, y, z, sx, sy, sz, color, ...extra });
}
function cyl(parts: Part[], x: number, y: number, z: number, r: number, h: number, color: string, extra: Partial<Part> = {}) {
  parts.push({ shape: "cyl", x, y, z, sx: r, sy: h, sz: r, color, ...extra });
}
function ball(parts: Part[], x: number, y: number, z: number, r: number, color: string, extra: Partial<Part> = {}) {
  parts.push({ shape: "ball", x, y, z, sx: r, sy: r, sz: r, color, ...extra });
}

// ── 벽 ─────────────────────────────────────────────
// 화면에서 먼 쪽(북·서) 바깥벽은 높게 세우고 큰 창을 낸다. 가까운 쪽(남·동) 바깥벽은 낮게 잘라 안이 보이게 한다.
export function buildWalls(floor: FloorMap): Part[] {
  const parts: Part[] = [];
  const grid = floor.grid;
  const outside = (x: number, y: number) => x < 0 || y < 0 || x >= MAP_W || y >= MAP_H || grid[y][x] === " ";
  const isWall = (x: number, y: number) => !outside(x, y) && grid[y][x] === "#";
  const kind = (x: number, y: number) =>
    outside(x, y + 1) || outside(x + 1, y) || outside(x + 1, y + 1) ? "front" : outside(x, y - 1) || outside(x - 1, y) || outside(x - 1, y - 1) ? "back" : "inner";
  const height = (k: string) => (k === "back" ? H.back : k === "front" ? H.front : H.inner);
  const thick = (k: string) => (k === "inner" ? 0.13 : 0.22);

  // 이음매 없이 보이도록 같은 종류의 벽 칸을 한 덩어리로 잇는다.
  const wall = (x: number, z: number, sx: number, sz: number, k: string) => {
    const h = height(k);
    box(parts, x, h / 2, z, sx, h, sz, C.wall);
    box(parts, x, h + 0.006, z, sx + 0.004, 0.012, sz + 0.004, C.wallTop, { noShadow: true });
    if (k === "front") {
      // 낮춘 바깥벽 위의 유리와 얇은 손잡이 띠
      const gx = sx > sz ? sx : 0.05;
      const gz = sz > sx ? sz : 0.05;
      box(parts, x, h + (H.glass - h) / 2, z, gx, H.glass - h, gz, C.glass, { alpha: 0.16, noShadow: true });
      box(parts, x, H.glass, z, gx, 0.03, gz, "#DADDE2", { noShadow: true });
    }
  };
  const used = new Set<number>();
  for (let ty = 0; ty < MAP_H; ty++) {
    let tx = 0;
    while (tx < MAP_W) {
      if (!isWall(tx, ty) || !isWall(tx + 1, ty)) {
        tx++;
        continue;
      }
      const k = kind(tx, ty);
      let ex = tx;
      while (isWall(ex + 1, ty) && kind(ex + 1, ty) === k) ex++;
      if (ex === tx) {
        tx++;
        continue;
      }
      const t = thick(k);
      for (let i = tx; i <= ex; i++) used.add(ty * MAP_W + i);
      wall((tx + ex) / 2 + 0.5, ty + 0.5, ex - tx + t, t, k);
      tx = ex;
    }
  }
  for (let tx = 0; tx < MAP_W; tx++) {
    let ty = 0;
    while (ty < MAP_H) {
      if (!isWall(tx, ty) || !isWall(tx, ty + 1)) {
        ty++;
        continue;
      }
      const k = kind(tx, ty);
      let ey = ty;
      while (isWall(tx, ey + 1) && kind(tx, ey + 1) === k) ey++;
      if (ey === ty) {
        ty++;
        continue;
      }
      const t = thick(k);
      for (let i = ty; i <= ey; i++) used.add(i * MAP_W + tx);
      wall(tx + 0.5, (ty + ey) / 2 + 0.5, t, ey - ty + t, k);
      ty = ey;
    }
  }
  // 이어지지 않은 칸(문 옆 기둥 등)과 종류가 바뀌는 이음 칸
  for (let ty = 0; ty < MAP_H; ty++) {
    for (let tx = 0; tx < MAP_W; tx++) {
      if (!isWall(tx, ty)) continue;
      const k = kind(tx, ty);
      const t = thick(k);
      if (!used.has(ty * MAP_W + tx)) wall(tx + 0.5, ty + 0.5, t, t, k);
      // 종류가 다른 이웃과 만나는 곳은 낮은 쪽 높이로 반 칸 잇기
      if (isWall(tx + 1, ty) && kind(tx + 1, ty) !== k) {
        const k2 = height(kind(tx + 1, ty)) < height(k) ? kind(tx + 1, ty) : k;
        wall(tx + 1, ty + 0.5, 1, Math.min(t, thick(k2)), k2);
      }
      if (isWall(tx, ty + 1) && kind(tx, ty + 1) !== k) {
        const k2 = height(kind(tx, ty + 1)) < height(k) ? kind(tx, ty + 1) : k;
        wall(tx + 0.5, ty + 1, Math.min(t, thick(k2)), 1, k2);
      }
      if (k === "back") {
        // 바깥 창: 흰 창틀 + 하늘색 유리
        const cx = tx + 0.5;
        const cz = ty + 0.5;
        const inX = !outside(tx, ty + 1) && !isWall(tx, ty + 1) && outside(tx, ty - 1);
        const inZ = !outside(tx + 1, ty) && !isWall(tx + 1, ty) && outside(tx - 1, ty);
        if (inX && tx % 2 === 0 && isWall(tx + 1, ty) && kind(tx + 1, ty) === "back") {
          box(parts, cx + 0.5, 0.95, cz + t / 2 + 0.01, 1.5, 0.82, 0.02, C.window, { glow: true, noShadow: true });
          box(parts, cx + 0.5, 0.95, cz + t / 2 + 0.025, 0.04, 0.82, 0.02, C.white, { noShadow: true });
          box(parts, cx + 0.5, 0.54, cz + t / 2 + 0.04, 1.56, 0.04, 0.06, C.white, { noShadow: true });
        }
        if (inZ && ty % 2 === 0 && isWall(tx, ty + 1) && kind(tx, ty + 1) === "back") {
          box(parts, cx + t / 2 + 0.01, 0.95, cz + 0.5, 0.02, 0.82, 1.5, C.window, { glow: true, noShadow: true });
          box(parts, cx + t / 2 + 0.025, 0.95, cz + 0.5, 0.02, 0.82, 0.04, C.white, { noShadow: true });
          box(parts, cx + t / 2 + 0.04, 0.54, cz + 0.5, 0.06, 0.04, 1.56, C.white, { noShadow: true });
        }
      }
    }
  }
  return parts;
}

// ── 가구 ───────────────────────────────────────────
function desk(parts: Part[], x: number, z: number) {
  const r = hash(x, z);
  box(parts, x, 0.36, z, 1.2, 0.035, 0.6, C.white);
  box(parts, x - 0.57, 0.18, z, 0.035, 0.36, 0.56, C.panel);
  box(parts, x + 0.57, 0.18, z, 0.035, 0.36, 0.56, C.panel);
  // 서랍장
  box(parts, x + 0.3, 0.16, z + 0.02, 0.26, 0.32, 0.42, C.white);
  box(parts, x + 0.3, 0.22, z + 0.235, 0.12, 0.012, 0.01, "#A9AFB8", { noShadow: true });
  // 앞 칸막이(파란 패널)
  box(parts, x, 0.5, z - 0.3, 1.2, 0.28, 0.03, C.privacy);
  // 모니터
  box(parts, x - 0.08, 0.39, z - 0.15, 0.1, 0.02, 0.08, C.dark);
  box(parts, x - 0.08, 0.46, z - 0.16, 0.025, 0.14, 0.025, C.dark);
  box(parts, x - 0.08, 0.57, z - 0.15, 0.5, 0.3, 0.025, C.dark);
  box(parts, x - 0.08, 0.57, z - 0.135, 0.46, 0.26, 0.004, C.screen, { glow: true, noShadow: true });
  // 키보드·마우스·서류·컵
  box(parts, x - 0.08, 0.385, z + 0.06, 0.32, 0.012, 0.1, "#E3E5E9", { noShadow: true });
  box(parts, x + 0.15, 0.385, z + 0.07, 0.04, 0.012, 0.06, "#E3E5E9", { noShadow: true });
  box(parts, x + 0.3, 0.382, z - 0.02, 0.18, 0.006, 0.24, "#FFFFFF", { noShadow: true, ry: 0.2 });
  if (r > 0.45) cyl(parts, x - 0.38, 0.415, z + 0.02, 0.03, 0.07, r > 0.7 ? C.teal : "#F2F2F2");
  if (r < 0.3) {
    cyl(parts, x - 0.4, 0.41, z - 0.12, 0.045, 0.07, C.pot);
    ball(parts, x - 0.4, 0.49, z - 0.12, 0.07, C.leafB);
  }
}

function chair(parts: Part[], x: number, z: number, ry = 0) {
  const s = Math.sin(ry);
  const c = Math.cos(ry);
  const at = (dx: number, dz: number): [number, number] => [x + dx * c + dz * s, z - dx * s + dz * c];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    box(parts, x + Math.cos(a) * 0.1, 0.025, z + Math.sin(a) * 0.1, 0.2, 0.025, 0.035, C.chairDark, { ry: -a, noShadow: true });
  }
  cyl(parts, x, 0.13, z, 0.022, 0.2, "#8C939E");
  box(parts, x, 0.24, z, 0.34, 0.06, 0.32, C.chair, { ry });
  const [bx, bz] = at(0, 0.17);
  box(parts, bx, 0.42, bz, 0.32, 0.32, 0.05, C.chair, { ry, rx: -0.12 });
  for (const side of [-0.18, 0.18]) {
    const [ax, az] = at(side, 0.02);
    box(parts, ax, 0.32, az, 0.03, 0.03, 0.22, C.chairDark, { ry });
  }
}

function plant(parts: Part[], x: number, z: number, size: number) {
  const r = hash(x + 3, z + 7);
  const pot = r > 0.5 ? C.pot : C.terracotta;
  cyl(parts, x, 0.14 * size, z, 0.15 * size, 0.28 * size, pot);
  cyl(parts, x, 0.285 * size, z, 0.13 * size, 0.01, "#6B5440", { noShadow: true });
  const leaves = 9;
  for (let i = 0; i < leaves; i++) {
    const a = (i / leaves) * Math.PI * 2 + r * 3;
    const lift = 0.45 + (i % 3) * 0.17 + r * 0.1;
    const reach = 0.08 + ((i * 7) % 5) * 0.025;
    ball(parts, x + Math.cos(a) * reach * size, lift * size, z + Math.sin(a) * reach * size, (0.11 + (i % 2) * 0.03) * size, [C.leafA, C.leafB, C.leafC][i % 3]);
  }
}

function seated(parts: Part[], x: number, z: number, shirt: string) {
  // 의자에 앉아 화면을 보는 직원(가상)
  box(parts, x, 0.31, z - 0.12, 0.24, 0.07, 0.24, "#3A4252");
  box(parts, x, 0.47, z + 0.02, 0.28, 0.3, 0.17, shirt, { rx: 0.08 });
  ball(parts, x, 0.71, z - 0.01, 0.095, "#EBC9B0");
  ball(parts, x, 0.745, z + 0.01, 0.1, "#2E2A28", { sy: 0.085 });
  box(parts, x - 0.1, 0.4, z - 0.16, 0.06, 0.06, 0.2, shirt);
  box(parts, x + 0.1, 0.4, z - 0.16, 0.06, 0.06, 0.2, shirt);
}

function shelf(parts: Part[], x: number, z: number, w: number, d: number, along: "x" | "z") {
  // 흰 틀 + 칸마다 책·상자
  const hgt = 1.0;
  const cx = x + w / 2;
  const cz = z + d / 2;
  box(parts, cx, hgt / 2, cz, w, hgt, d, C.white);
  const len = along === "x" ? w : d;
  const deep = along === "x" ? d : w;
  const levels = [0.08, 0.36, 0.64];
  let i = 0;
  for (const y of levels) {
    let p = 0.06;
    while (p < len - 0.08) {
      const r = hash(cx + p * 3, cz + y * 11);
      if (r < 0.18) {
        // 수납 상자
        const bw = 0.16;
        if (along === "x") box(parts, x + p + bw / 2, y + 0.07, cz + 0.02, bw, 0.14, deep * 0.8, "#D8CBB6");
        else box(parts, cx + 0.02, y + 0.07, z + p + bw / 2, deep * 0.8, 0.14, bw, "#D8CBB6");
        p += bw + 0.03;
      } else if (r < 0.28) {
        p += 0.12;
      } else {
        const bw = 0.035 + r * 0.02;
        const bh = 0.15 + (i % 4) * 0.025;
        const col = BOOKS[i % BOOKS.length];
        if (along === "x") box(parts, x + p, y + bh / 2, cz + 0.02, bw, bh, deep * 0.7, col, { noShadow: true });
        else box(parts, cx + 0.02, y + bh / 2, z + p, deep * 0.7, bh, bw, col, { noShadow: true });
        p += bw + 0.004;
        i++;
      }
    }
  }
  // 칸 판(나무)
  for (const y of [0.33, 0.61, 0.89]) box(parts, cx, y, cz, w + 0.01, 0.02, d + 0.01, C.wood, { noShadow: true });
}

export function buildFurniture(floor: FloorMap): Part[] {
  const parts: Part[] = [];
  for (const p of floor.props) addProp(parts, p);
  for (const d of floor.decors) addDecor(parts, d);
  addDressing(parts, floor);
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
      box(parts, x, 0.34, z - 0.15, 0.56, 0.68, 0.38, C.white);
      box(parts, x, 0.69, z - 0.15, 0.58, 0.025, 0.4, C.wood);
      for (const y of [0.24, 0.48]) box(parts, x, y, z + 0.04, 0.5, 0.004, 0.004, "#B9BEC7", { noShadow: true });
      return;
    case 1:
      plant(parts, x, z, 1.15);
      return;
    case 3:
      // 민원 창구: 흰 몸체, 원목 상판, 청록 띠, 모니터 두 대
      box(parts, x, 0.22, z - 0.22, 1.5, 0.44, 0.46, C.white);
      box(parts, x, 0.455, z - 0.22, 1.56, 0.03, 0.52, C.wood);
      box(parts, x, 0.28, z + 0.015, 1.5, 0.06, 0.01, C.teal, { noShadow: true, glow: true });
      for (const dx of [-0.38, 0.38]) {
        box(parts, x + dx, 0.6, z - 0.36, 0.42, 0.26, 0.025, C.dark);
        box(parts, x + dx, 0.6, z - 0.345, 0.38, 0.22, 0.004, C.screen, { glow: true, noShadow: true });
        box(parts, x + dx, 0.5, z - 0.37, 0.03, 0.08, 0.03, C.dark);
      }
      return;
    case 8:
      cyl(parts, x, 0.3, z, 0.02, 0.6, "#8C94A3");
      cyl(parts, x, 0.01, z, 0.12, 0.02, "#8C94A3");
      box(parts, x, 0.68, z, 0.5, 0.34, 0.03, C.navy);
      box(parts, x, 0.6, z + 0.017, 0.4, 0.03, 0.004, C.teal, { noShadow: true, glow: true });
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
      box(parts, cx, 0.33, cz, w, 0.04, h, C.wood);
      for (const [ox, oz] of [
        [0.1, 0.1],
        [w - 0.1, 0.1],
        [0.1, h - 0.1],
        [w - 0.1, h - 0.1],
      ])
        box(parts, x + ox, 0.16, z + oz, 0.04, 0.32, 0.04, C.white);
      // 서류·노트북
      box(parts, cx - w * 0.2, 0.355, cz, 0.22, 0.006, 0.16, "#FFFFFF", { noShadow: true, ry: 0.3 });
      if (w > 1.5) box(parts, cx + w * 0.15, 0.36, cz - 0.05, 0.28, 0.015, 0.2, "#BFC4CC", { noShadow: true });
      return;
    case "sofa":
      box(parts, cx, 0.1, cz, w + 0.2, 0.2, h, C.sofa);
      box(parts, cx + 0.04, 0.22, cz, w, 0.06, h - 0.1, "#D4D7DC");
      box(parts, x - 0.02, 0.3, cz, 0.14, 0.4, h, C.sofa);
      box(parts, cx, 0.2, z - 0.02, w + 0.2, 0.26, 0.1, C.sofa);
      box(parts, cx, 0.2, z + h + 0.02, w + 0.2, 0.26, 0.1, C.sofa);
      box(parts, x + 0.1, 0.38, z + 0.25, 0.08, 0.16, 0.18, "#E8C04A", { rx: 0.2 });
      box(parts, x + 0.1, 0.38, z + h - 0.25, 0.08, 0.16, 0.18, C.teal, { rx: -0.2 });
      return;
    case "shelf":
      shelf(parts, x, z, w, h, w > h ? "x" : "z");
      return;
    case "bench":
      for (let i = 0; i < 3; i++) box(parts, cx, 0.2, z + 0.08 + i * 0.12, w, 0.03, 0.09, C.wood);
      box(parts, x + 0.1, 0.1, cz, 0.05, 0.2, h * 0.9, "#9AA0A8");
      box(parts, x + w - 0.1, 0.1, cz, 0.05, 0.2, h * 0.9, "#9AA0A8");
      return;
    case "cooler":
      box(parts, cx, 0.28, cz, 0.3, 0.56, 0.3, C.white);
      cyl(parts, cx, 0.68, cz, 0.12, 0.24, "#A8D8EE", { alpha: 0.75 });
      return;
    case "screen":
      box(parts, cx, 0.82, z + 0.05, w, 0.52, 0.04, C.dark);
      box(parts, cx, 0.82, z + 0.075, w * 0.95, 0.46, 0.004, C.screen, { glow: true, noShadow: true });
      return;
    case "stairs": {
      const n = 10;
      for (let i = 0; i < n; i++) {
        const top = ((i + 1) / n) * 0.9;
        if (d.dir === "y") {
          box(parts, cx, top / 2, z + (h / n) * (i + 0.5), w, top, h / n, C.step);
          box(parts, cx, top + 0.005, z + (h / n) * (i + 0.5), w, 0.012, h / n - 0.01, C.wood, { noShadow: true });
        } else {
          box(parts, x + (w / n) * (i + 0.5), top / 2, cz, w / n, top, h, C.step);
          box(parts, x + (w / n) * (i + 0.5), top + 0.005, cz, w / n - 0.01, 0.012, h, C.wood, { noShadow: true });
        }
      }
      return;
    }
    default:
      return;
  }
}

// ── 방 꾸미기: 액자·러그·근무 중인 직원 ───────────────
function addDressing(parts: Part[], floor: FloorMap) {
  const grid = floor.grid;
  const outside = (x: number, y: number) => x < 0 || y < 0 || x >= MAP_W || y >= MAP_H || grid[y][x] === " ";
  for (const room of floor.rooms) {
    if (room.kind === "void" || room.kind === "utility" || room.ground === "g") continue;
    if (room.w < 3 || room.h < 3) continue;
    // 북쪽 벽이 건물 바깥이면 창이 있으므로 서쪽 벽에 건다.
    const northOutside = outside(room.x + 1, room.y - 2);
    const westOutside = outside(room.x - 2, room.y + 1);
    const prints = Math.min(3, Math.floor(room.w / 3));
    if (!northOutside) {
      for (let i = 0; i < prints; i++) {
        const px = room.x + ((i + 1) * room.w) / (prints + 1);
        const col = PRINTS[Math.floor(hash(px, room.y) * PRINTS.length)];
        art(parts, px, 0.8, room.y - 0.5 + 0.08, "x", col);
      }
    } else if (!westOutside) {
      const n = Math.min(2, Math.floor(room.h / 3));
      for (let i = 0; i < n; i++) {
        const pz = room.y + ((i + 1) * room.h) / (n + 1);
        art(parts, room.x - 0.5 + 0.08, 0.8, pz, "z", PRINTS[Math.floor(hash(room.x, pz) * PRINTS.length)]);
      }
    }
    // 북쪽 안벽을 따라 낮은 수납장과 사무기기
    if (!northOutside && room.w >= 5 && !floor.decors.some((d) => d.kind === "table" && u(d.x) < room.x + room.w && u(d.x) > room.x && u(d.y) > room.y && u(d.y) < room.y + room.h)) {
      const z = room.y - 0.5 + 0.08 + 0.2;
      const x0 = room.x + 0.4;
      const len = Math.min(3.2, room.w - 2.4);
      box(parts, x0 + len / 2, 0.22, z, len, 0.44, 0.38, C.white);
      box(parts, x0 + len / 2, 0.445, z, len + 0.02, 0.02, 0.4, C.wood, { noShadow: true });
      for (let k = 0; k < Math.floor(len / 0.6); k++) box(parts, x0 + 0.3 + k * 0.6, 0.3, z + 0.195, 0.004 + 0.12, 0.008, 0.004, "#AEB4BD", { noShadow: true });
      // 복합기
      box(parts, x0 + len + 0.35, 0.3, z + 0.02, 0.48, 0.6, 0.42, "#E9EAEC");
      box(parts, x0 + len + 0.35, 0.61, z + 0.02, 0.48, 0.02, 0.42, "#3A404A", { noShadow: true });
      // 수납장 위 소품: 화분·파일 상자
      cyl(parts, x0 + 0.25, 0.5, z, 0.05, 0.1, C.pot);
      ball(parts, x0 + 0.25, 0.6, z, 0.09, C.leafB);
      box(parts, x0 + 0.7, 0.53, z, 0.22, 0.16, 0.26, "#D8CBB6");
    }
    if (room.kind === "ai" || room.kind === "feature" || room.kind === "place") {
      // 러그
      const rw = Math.max(1.2, room.w - 2.2);
      const rh = Math.max(1.2, room.h - 2.4);
      box(parts, room.x + room.w / 2, 0.004, room.y + room.h / 2 + 0.2, rw, 0.008, rh, room.kind === "ai" ? "#BFDDE0" : C.rug, { noShadow: true });
    }
  }
  // 1층 로비 업무 안내: 둥근 안내 데스크와 대기 공간
  for (const spot of floor.spots) {
    if (spot.action !== "pingpong") continue;
    const x = u(spot.x);
    const z = u(spot.y);
    cyl(parts, x, 0.004, z + 0.3, 2.3, 0.008, "#D3E9EB", { noShadow: true });
    cyl(parts, x, 0.009, z + 0.3, 2.15, 0.008, "#E9F3F4", { noShadow: true });
    // 뒤쪽 반원 안내 데스크
    for (let i = 0; i <= 8; i++) {
      const a = Math.PI + (i / 8) * Math.PI;
      const dx = Math.cos(a) * 0.75;
      const dz = Math.sin(a) * 0.55;
      box(parts, x + dx, 0.22, z - 0.15 + dz, 0.32, 0.44, 0.2, C.white, { ry: -a - Math.PI / 2 });
      box(parts, x + dx, 0.455, z - 0.15 + dz, 0.36, 0.03, 0.26, C.wood, { ry: -a - Math.PI / 2, noShadow: true });
    }
    box(parts, x + 0.35, 0.58, z - 0.62, 0.42, 0.26, 0.025, C.dark);
    box(parts, x + 0.35, 0.58, z - 0.605, 0.38, 0.22, 0.004, C.screen, { glow: true, noShadow: true });
    // 큰 화분
    for (const [dx, dz] of [
      [-2.6, -1.4],
      [2.6, -1.4],
      [-2.6, 2.2],
      [2.6, 2.2],
    ])
      plant(parts, x + dx, z + dz, 1.5);
  }
  // AI 주무관이 일하는 방에는 직원 몇 명이 앉아 있다(가상 인물).
  const aiRooms = floor.rooms.filter((r) => r.kind === "ai");
  let k = 0;
  for (const p of floor.props) {
    if (p.sprite !== 4) continue;
    const x = u(p.x);
    const z = u(p.y);
    const inAi = aiRooms.some((r) => x > r.x && x < r.x + r.w && z > r.y && z < r.y + r.h);
    if (!inAi || hash(x, z) < 0.35) continue;
    seated(parts, x, z - 0.06, SHIRTS[k++ % SHIRTS.length]);
  }
}

function art(parts: Part[], x: number, y: number, z: number, along: "x" | "z", color: string) {
  const w = 0.5;
  const h = 0.36;
  if (along === "x") {
    box(parts, x, y, z, w, h, 0.025, "#2B2F36", { noShadow: true });
    box(parts, x, y, z + 0.014, w - 0.05, h - 0.05, 0.004, "#FFFFFF", { noShadow: true });
    box(parts, x, y, z + 0.018, w - 0.14, h - 0.14, 0.004, color, { noShadow: true });
  } else {
    box(parts, x, y, z, 0.025, h, w, "#2B2F36", { noShadow: true });
    box(parts, x + 0.014, y, z, 0.004, h - 0.05, w - 0.05, "#FFFFFF", { noShadow: true });
    box(parts, x + 0.018, y, z, 0.004, h - 0.14, w - 0.14, color, { noShadow: true });
  }
}

