// 청사 모형 장면: 바닥 재질, 얇은 벽(뒤쪽은 높게, 앞쪽은 잘라 낸 유리벽), 사무가구.
// 참고 이미지(흰 벽, 밝은 나무 바닥, 흰 책상·파란 의자, 화분)의 3D 모형 느낌을 2D 캔버스로 흉내 낸다.
import { MAP_H, MAP_W, TILE, type Decor, type FloorMap, type Prop } from "./world";
import { ISO, box, iso, shadow } from "./iso";

export type Item = { k: number; draw: () => void };

const T = TILE;
const BACK_H = 54;
const INNER_H = 30;
const FRONT_H = 9;
const GLASS_H = 40;

const WOOD = "#EAD8BC";
const WOOD_LINE = "rgba(150, 110, 60, 0.13)";
const STONE = "#F1F2F4";
const STONE_LINE = "rgba(31, 41, 55, 0.06)";
const GREEN = "#DCEAD6";

const WALL = { top: "#C9CED6", left: "#FBFBFC", right: "#E6E9EE" };
const WOODTOP = "#D9B68A";

function quad(ctx: CanvasRenderingContext2D, pts: [number, number][]) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]);
  ctx.closePath();
}

function rectPts(x: number, y: number, w: number, d: number, h = 0): [number, number][] {
  return [iso(x, y, h), iso(x + w, y, h), iso(x + w, y + d, h), iso(x, y + d, h)];
}

// 판 위에 x축 방향 줄을 그어 마루·타일 결을 낸다.
function grain(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, d: number, step: number, color: string, cross = 0) {
  ctx.save();
  quad(ctx, rectPts(x, y, w, d));
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  for (let yy = y + step; yy < y + d; yy += step) {
    const a = iso(x, yy);
    const b = iso(x + w, yy);
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
  }
  if (cross) {
    for (let xx = x + cross; xx < x + w; xx += cross) {
      const a = iso(xx, y);
      const b = iso(xx, y + d);
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
    }
  }
  ctx.stroke();
  ctx.restore();
}

export function drawGround(
  ctx: CanvasRenderingContext2D,
  floor: FloorMap,
  focusId: string | null,
) {
  const solidOut = (x: number, y: number) => x < 0 || y < 0 || x >= MAP_W || y >= MAP_H || floor.grid[y][x] === " ";
  // 바닥판: 층 윤곽(안내도 외곽선) 그대로. 한 경로로 칠해 그림자를 한 번에 준다.
  const footprint = () => {
    ctx.beginPath();
    for (let ty = 0; ty < MAP_H; ty++) {
      for (let tx = 0; tx < MAP_W; tx++) {
        if (solidOut(tx, ty)) continue;
        const pts = rectPts(tx * T, ty * T, T, T);
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]);
        ctx.closePath();
      }
    }
  };
  ctx.save();
  ctx.shadowColor = "rgba(20, 28, 40, 0.28)";
  ctx.shadowBlur = 50;
  ctx.shadowOffsetY = 30;
  footprint();
  ctx.fillStyle = STONE;
  ctx.fill();
  ctx.restore();
  footprint();
  ctx.strokeStyle = STONE;
  ctx.lineWidth = 0.8;
  ctx.stroke();
  for (let ty = 0; ty < MAP_H; ty++) {
    for (let tx = 0; tx < MAP_W; tx++) {
      if (solidOut(tx, ty)) continue;
      if (solidOut(tx, ty + 1)) {
        quad(ctx, [iso(tx * T, (ty + 1) * T, 0), iso((tx + 1) * T, (ty + 1) * T, 0), iso((tx + 1) * T, (ty + 1) * T, -18), iso(tx * T, (ty + 1) * T, -18)]);
        ctx.fillStyle = "#DADDE2";
        ctx.fill();
      }
      if (solidOut(tx + 1, ty)) {
        quad(ctx, [iso((tx + 1) * T, ty * T, 0), iso((tx + 1) * T, (ty + 1) * T, 0), iso((tx + 1) * T, (ty + 1) * T, -18), iso((tx + 1) * T, ty * T, -18)]);
        ctx.fillStyle = "#C4C8CF";
        ctx.fill();
      }
    }
  }
  ctx.save();
  footprint();
  ctx.clip();
  grain(ctx, 0, 0, MAP_W * T, MAP_H * T, 2 * T, STONE_LINE, 2 * T);
  ctx.restore();

  for (let ty = 0; ty < MAP_H; ty++) {
    for (let tx = 0; tx < MAP_W; tx++) {
      const ch = floor.grid[ty][tx];
      if (ch === "r") {
        quad(ctx, rectPts(tx * T, ty * T, T, T));
        ctx.fillStyle = "rgba(0, 160, 173, 0.16)";
        ctx.fill();
      }
    }
  }

  for (const room of floor.rooms) {
    if (room.kind === "void") {
      for (const part of room.parts) {
        quad(ctx, rectPts((part.x - 0.5) * T, (part.y - 0.5) * T, (part.w + 1) * T, (part.h + 1) * T));
        ctx.fillStyle = "#D6D9DF";
        ctx.fill();
      }
      continue;
    }
    for (const part of room.parts) {
      const px = (part.x - 0.5) * T;
      const py = (part.y - 0.5) * T;
      const pw = (part.w + 1) * T;
      const pd = (part.h + 1) * T;
      quad(ctx, rectPts(px, py, pw, pd));
      ctx.fillStyle = room.ground === "g" ? GREEN : room.ground === "t" ? "#ECEDEF" : room.ground === "c" ? "#DEE2E9" : WOOD;
      ctx.fill();
      if (room.ground === "g") grain(ctx, px, py, pw, pd, 12, "rgba(70, 120, 60, 0.10)");
      else if (room.ground === "t") grain(ctx, px, py, pw, pd, T, STONE_LINE, T);
      else if (room.ground === "c") grain(ctx, px, py, pw, pd, 4, "rgba(31, 41, 55, 0.035)");
      else grain(ctx, px, py, pw, pd, 7, WOOD_LINE);
    }
    const x = (room.x - 0.5) * T;
    const y = (room.y - 0.5) * T;
    const w = (room.w + 1) * T;
    const d = (room.h + 1) * T;
    if (room.kind === "utility") continue;
    // 깔개: 불 켜진 방은 청록, 기능 방은 남색 기운.
    const inset = 1;
    if ((room.kind === "ai" || room.kind === "feature") && room.w > 3 && room.h > 3) {
      quad(ctx, rectPts((room.x + inset) * T, (room.y + inset) * T, (room.w - inset * 2) * T, (room.h - inset * 2) * T));
      ctx.fillStyle = room.kind === "ai" ? "rgba(0, 160, 173, 0.16)" : "rgba(22, 40, 139, 0.07)";
      ctx.fill();
      ctx.strokeStyle = room.kind === "ai" ? "rgba(0, 160, 173, 0.35)" : "rgba(22, 40, 139, 0.15)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    // 불 꺼진 방: 어둡게
    if (room.kind === "planned") {
      quad(ctx, rectPts(x, y, w, d));
      ctx.fillStyle = "rgba(38, 46, 60, 0.13)";
      ctx.fill();
    }
    if (room.kind === "ai") {
      const [cx, cy] = iso((room.x + room.w / 2) * T, (room.y + room.h / 2) * T);
      const r = Math.max(room.w, room.h) * T;
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      glow.addColorStop(0, "rgba(255, 255, 240, 0.55)");
      glow.addColorStop(1, "rgba(255, 255, 240, 0)");
      ctx.save();
      quad(ctx, rectPts(x, y, w, d));
      ctx.clip();
      ctx.fillStyle = glow;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      ctx.restore();
    }
    if (focusId === room.id) {
      ctx.save();
      ctx.setLineDash([6, 4]);
      quad(ctx, rectPts(room.x * T + 2, room.y * T + 2, room.w * T - 4, room.h * T - 4));
      ctx.strokeStyle = ISO.teal;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
  }
}

type WallKind = "back" | "inner" | "front";

let wallGrid: string[] = [];
const outside = (x: number, y: number) => x < 0 || y < 0 || x >= MAP_W || y >= MAP_H || wallGrid[y][x] === " ";

// 바깥벽 가운데 앞쪽(남·동쪽이 바깥)은 낮게 자르고, 뒤쪽(북·서쪽이 바깥)은 높게 세운다.
function wallKind(tx: number, ty: number): WallKind {
  if (outside(tx, ty + 1) || outside(tx + 1, ty)) return "front";
  if (outside(tx, ty - 1) || outside(tx - 1, ty)) return "back";
  return "inner";
}

function windowsOn(ctx: CanvasRenderingContext2D, tx: number, ty: number, t: number) {
  // 뒤쪽 바깥벽 안쪽 면에 창을 낸다.
  const pane = "rgba(150, 196, 226, 0.75)";
  const frame = "#FFFFFF";
  if (outside(tx, ty - 1) && !outside(tx, ty + 1) && tx > 0 && tx < MAP_W - 1) {
    const yf = ty * T + T / 2 + t / 2;
    const x = tx * T + 5;
    const pts: [number, number][] = [iso(x, yf, 16), iso(x + T - 10, yf, 16), iso(x + T - 10, yf, 44), iso(x, yf, 44)];
    quad(ctx, pts);
    ctx.fillStyle = pane;
    ctx.fill();
    ctx.strokeStyle = frame;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  if (outside(tx - 1, ty) && !outside(tx + 1, ty) && ty > 0 && ty < MAP_H - 1) {
    const xf = tx * T + T / 2 + t / 2;
    const y = ty * T + 5;
    const pts: [number, number][] = [iso(xf, y, 16), iso(xf, y + T - 10, 16), iso(xf, y + T - 10, 44), iso(xf, y, 44)];
    quad(ctx, pts);
    ctx.fillStyle = "rgba(130, 180, 214, 0.75)";
    ctx.fill();
    ctx.strokeStyle = frame;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

// 벽 칸마다 가운데 기둥과 동·남쪽 이음 벽을 얇게 세운다. 사람 앞을 가리는 안쪽 벽은 반투명하게.
export function wallItems(
  ctx: CanvasRenderingContext2D,
  floor: FloorMap,
  viewers: { x: number; y: number }[],
): Item[] {
  const grid = floor.grid;
  wallGrid = grid;
  const isWall = (x: number, y: number) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H && grid[y][x] === "#";
  const items: Item[] = [];
  const hides = (tx: number, ty: number) =>
    viewers.some((v) => {
      const vx = v.x / T;
      const vy = v.y / T;
      const depth = tx + 0.5 + ty + 0.5 - (vx + vy);
      const side = Math.abs(tx + 0.5 - ty - 0.5 - (vx - vy));
      return depth > 0 && depth < 3.2 && side < 2.6;
    });

  for (let ty = 0; ty < MAP_H; ty++) {
    for (let tx = 0; tx < MAP_W; tx++) {
      if (!isWall(tx, ty)) continue;
      const kind = wallKind(tx, ty);
      const t = kind === "inner" ? 7 : 10;
      const h = kind === "back" ? BACK_H : kind === "front" ? FRONT_H : INNER_H;
      const cx = (tx + 0.5) * T;
      const cy = (ty + 0.5) * T;
      const parts: { x: number; y: number; w: number; d: number; k: number }[] = [
        { x: cx - t / 2, y: cy - t / 2, w: t, d: t, k: cx + cy },
      ];
      if (isWall(tx + 1, ty) && wallKind(tx + 1, ty) === kind) parts.push({ x: cx, y: cy - t / 2, w: T, d: t, k: cx + T / 2 + cy });
      if (isWall(tx, ty + 1) && wallKind(tx, ty + 1) === kind) parts.push({ x: cx - t / 2, y: cy, w: t, d: T, k: cx + cy + T / 2 });
      // 종류가 다른 벽이 만나는 곳도 이어 준다(낮은 쪽 높이로).
      if (isWall(tx + 1, ty) && wallKind(tx + 1, ty) !== kind) parts.push({ x: cx, y: cy - t / 2, w: T, d: t, k: cx + T / 2 + cy });
      if (isWall(tx, ty + 1) && wallKind(tx, ty + 1) !== kind) parts.push({ x: cx - t / 2, y: cy, w: t, d: T, k: cx + cy + T / 2 });
      const fade = kind === "inner" && hides(tx, ty);
      for (const p of parts) {
        const partH =
          p.w === T && wallKind(tx + 1, ty) !== kind
            ? Math.min(h, wallKind(tx + 1, ty) === "back" ? BACK_H : wallKind(tx + 1, ty) === "front" ? FRONT_H : INNER_H)
            : p.d === T && wallKind(tx, ty + 1) !== kind
              ? Math.min(h, wallKind(tx, ty + 1) === "back" ? BACK_H : wallKind(tx, ty + 1) === "front" ? FRONT_H : INNER_H)
              : h;
        items.push({
          k: p.k + (kind === "front" ? T : 0),
          draw: () => {
            if (fade) ctx.globalAlpha = 0.28;
            box(ctx, p.x, p.y, p.w, p.d, partH, WALL.left, 0, WALL);
            if (kind === "back" && p.w === t && p.d === t) windowsOn(ctx, tx, ty, t);
            if (kind === "front") {
              // 앞쪽 바깥벽은 낮게 자르고 위를 유리로 둘러 안이 보이게 한다.
              ctx.globalAlpha = 0.16;
              box(ctx, p.x, p.y, p.w, p.d, GLASS_H, "#BFE0EE", partH, { top: "#9CCBE0", left: "#CBE6F2", right: "#B5D9EA" });
            }
            ctx.globalAlpha = 1;
          },
        });
      }
    }
  }
  return items;
}

function books(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, z: number, rows: number, face: "south" | "east", d = 0) {
  const colors = ["#2F5D8A", "#D97B4A", "#E8C468", "#6AA88E", "#B85C5C", "#7C8DB5"];
  for (let r = 0; r < rows; r++) {
    let off = 2;
    let i = r * 2;
    const len = face === "south" ? w : d;
    while (off < len - 3) {
      const bw = 2 + ((i * 7) % 3);
      const bh = 6 + ((i * 5) % 3);
      const zz = z + 3 + r * 10;
      ctx.fillStyle = colors[i % colors.length];
      if (face === "south") quad(ctx, [iso(x + off, y, zz), iso(x + off + bw, y, zz), iso(x + off + bw, y, zz + bh), iso(x + off, y, zz + bh)]);
      else quad(ctx, [iso(x, y + off, zz), iso(x, y + off + bw, zz), iso(x, y + off + bw, zz + bh), iso(x, y + off, zz + bh)]);
      ctx.fill();
      off += bw + 0.6;
      i++;
    }
  }
}

function monitor(ctx: CanvasRenderingContext2D, x: number, y: number, z: number) {
  box(ctx, x - 1, y - 1, 2, 2, 4, "#9AA3B2", z);
  box(ctx, x - 8, y - 2, 16, 2, 10, "#2B3445", z + 4, { top: "#2B3445", left: "#4E9BD6", right: "#1E2533" });
  // 화면 빛
  quad(ctx, [iso(x - 7, y, z + 5), iso(x + 7, y, z + 5), iso(x + 7, y, z + 13), iso(x - 7, y, z + 13)]);
  const [a, b] = iso(x - 7, y, z + 13);
  const [c, e] = iso(x + 7, y, z + 5);
  const g = ctx.createLinearGradient(a, b, c, e);
  g.addColorStop(0, "#7CC4F2");
  g.addColorStop(1, "#3E83C4");
  ctx.fillStyle = g;
  ctx.fill();
}

function chair(ctx: CanvasRenderingContext2D, x: number, y: number) {
  shadow(ctx, x, y, 7, 0.12);
  box(ctx, x - 1, y - 1, 2, 2, 6, "#3A3F48");
  box(ctx, x - 6, y - 6, 12, 12, 3, "#456A9C", 6, { top: "#5A80B2", left: "#3F6292", right: "#34547E" });
  box(ctx, x - 6, y + 4, 12, 3, 13, "#456A9C", 8, { top: "#5A80B2", left: "#3F6292", right: "#34547E" });
}

function plant(ctx: CanvasRenderingContext2D, x: number, y: number, big = false) {
  shadow(ctx, x, y, 8, 0.14);
  box(ctx, x - 5, y - 5, 10, 10, 10, "#C8693F", 0, { top: "#B95E36", left: "#CF7448", right: "#B05A33" });
  const [sx, sy] = iso(x, y, 10);
  const leaves: [number, number, number, string][] = big
    ? [
        [0, -26, 10, "#3E8E5E"],
        [-7, -18, 8, "#4FA36D"],
        [7, -17, 8, "#3E8E5E"],
        [-3, -34, 7, "#5DB97E"],
        [4, -28, 7, "#5DB97E"],
      ]
    : [
        [0, -14, 8, "#3E8E5E"],
        [-5, -9, 6, "#4FA36D"],
        [5, -9, 6, "#5DB97E"],
        [1, -20, 5, "#5DB97E"],
      ];
  if (big) {
    ctx.strokeStyle = "#5B4630";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx, sy - 22);
    ctx.stroke();
  }
  for (const [dx, dy, r, c] of leaves) {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.ellipse(sx + dx, sy + dy, r, r * 0.8, dx * 0.05, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawProp(ctx: CanvasRenderingContext2D, prop: Prop) {
  const { x, y } = prop;
  switch (prop.sprite) {
    case 0: {
      // 흰 책상 + 모니터 + 키보드
      shadow(ctx, x, y - 8, 22, 0.1);
      box(ctx, x - 18, y - 16, 2, 16, 12, "#E9EBEF");
      box(ctx, x + 16, y - 16, 2, 16, 12, "#E9EBEF");
      box(ctx, x - 18, y - 16, 36, 16, 2, "#FFFFFF", 12, { top: "#FFFFFF", left: "#E3E6EB", right: "#D3D7DE" });
      monitor(ctx, x, y - 12, 14);
      box(ctx, x - 6, y - 7, 12, 4, 1, "#D5D9E0", 14);
      return;
    }
    case 3: {
      // 민원 창구·안내 데스크: 흰 몸체에 나무 상판, 청록 띠
      shadow(ctx, x, y - 6, 26, 0.1);
      box(ctx, x - 22, y - 14, 44, 14, 15, "#FFFFFF", 0, { top: "#FFFFFF", left: "#F1F2F4", right: "#DADDE3" });
      box(ctx, x - 23, y - 15, 46, 16, 2, WOODTOP, 15, { top: WOODTOP, left: "#C9A274", right: "#B48D60" });
      box(ctx, x - 22, y - 0.5, 44, 0.5, 2.5, ISO.teal, 6, { left: ISO.teal, right: ISO.tealDeep, top: ISO.teal });
      monitor(ctx, x + 10, y - 10, 17);
      return;
    }
    case 4:
      chair(ctx, x, y - 2);
      return;
    case 5: {
      // 서류 캐비닛
      shadow(ctx, x, y - 4, 10, 0.1);
      box(ctx, x - 9, y - 10, 18, 12, 26, "#F5F6F8", 0, { top: "#FFFFFF", left: "#ECEEF2", right: "#D7DBE2" });
      ctx.strokeStyle = "rgba(31, 41, 55, 0.18)";
      ctx.lineWidth = 0.8;
      for (const z of [9, 18]) {
        const a = iso(x - 9, y + 2, z);
        const b = iso(x + 9, y + 2, z);
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.stroke();
      }
      return;
    }
    case 1:
      plant(ctx, x, y, true);
      return;
    case 6:
      box(ctx, x - 6, y - 6, 12, 9, 3, "#FFFFFF", 14, { left: "#E3E7ED", right: "#D3D9E2" });
      return;
    case 8: {
      box(ctx, x - 1, y - 1, 2, 2, 12, "#8C94A3");
      box(ctx, x - 8, y - 2, 16, 3, 14, ISO.navy, 12, { left: "#22369E", right: "#101E6B", top: "#2A3FAE" });
      return;
    }
  }
}

export function drawDecor(ctx: CanvasRenderingContext2D, decor: Decor) {
  const { x, y, w, h } = decor;
  switch (decor.kind) {
    case "table":
      shadow(ctx, x + w / 2, y + h / 2, Math.min(w, h) * 0.6, 0.08);
      box(ctx, x + 2, y + 2, 3, 3, 12, "#E3E6EB");
      box(ctx, x + w - 5, y + h - 5, 3, 3, 12, "#E3E6EB");
      box(ctx, x, y, w, h, 2.5, WOODTOP, 12, { top: WOODTOP, left: "#C9A274", right: "#B48D60" });
      return;
    case "sofa":
      shadow(ctx, x + w / 2, y + h / 2, w * 0.5, 0.1);
      box(ctx, x, y, w, h, 8, "#D3D6DC", 0, { top: "#DEE1E6", left: "#C9CDD4", right: "#B7BCC5" });
      box(ctx, x, y, w, 4, 15, "#D3D6DC", 0, { top: "#DEE1E6", left: "#C9CDD4", right: "#B7BCC5" });
      box(ctx, x + w / 2 - 4, y + 4, 8, 3, 6, "#E8C468", 8);
      return;
    case "shelf":
      shadow(ctx, x + w / 2, y + h / 2, 8, 0.08);
      box(ctx, x, y, w, h, 30, "#FFFFFF", 0, { top: "#FFFFFF", left: "#F1F2F4", right: "#DDE0E6" });
      books(ctx, x, y + h, w, 0, 2, "south");
      books(ctx, x + w, y, w, 0, 2, "east", h);
      return;
    case "bench":
      box(ctx, x, y + 3, w, Math.max(4, h - 6), 6, WOODTOP, 0, { top: WOODTOP, left: "#C9A274", right: "#B48D60" });
      return;
    case "cooler":
      shadow(ctx, x + w / 2, y + h - 5, 6, 0.1);
      box(ctx, x, y + h - 10, w - 2, 10, 18, "#FFFFFF", 0, { left: "#ECEEF2", right: "#D7DBE2" });
      box(ctx, x + 2, y + h - 8, w - 6, 6, 8, "#A8D8EE", 18, { top: "#BFE4F3", left: "#9BCFE6", right: "#86C0DA" });
      return;
    case "stairs": {
      // 계단: 한쪽으로 올라가는 단
      const steps = 7;
      for (let i = 0; i < steps; i++) {
        if (decor.dir === "y") box(ctx, x, y + (h / steps) * i, w, h / steps, 3 * (steps - i), "#E4E6EA", 0, { top: "#F2F3F5", left: "#D3D6DC", right: "#C3C7CE" });
        else box(ctx, x + (w / steps) * i, y, w / steps, h, 3 * (steps - i), "#E4E6EA", 0, { top: "#F2F3F5", left: "#D3D6DC", right: "#C3C7CE" });
      }
      return;
    }
    case "screen":
      box(ctx, x, y, w, 3, 18, "#2B3445", 6, { left: "#4E9BD6", right: "#1E2533", top: "#2B3445" });
      return;
    default:
      return;
  }
}
