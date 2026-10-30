// 아이소메트릭 그리기 도구. 세계 좌표(px, TILE=32)를 2:1 아이소 좌표로 옮겨 그린다.
// 스프라이트 없이 면 세 개(윗면·왼면·오른면)로 가구와 벽을 만든다.

export const WALL_H = 18;

export const ISO = {
  bg: "#EEF1F6",
  slabTop: "#F5F6F8",
  slabLeft: "#D5DBE5",
  slabRight: "#C3CAD6",
  corridor: "#F7F8FA",
  corridorLine: "rgba(22, 40, 139, 0.045)",
  wallTop: "#FFFFFF",
  wallLeft: "#DCE1EA",
  wallRight: "#C9D0DC",
  aiFloor: "#E3F4F5",
  featureFloor: "#EBEEF9",
  plannedFloor: "#E9ECF1",
  greenFloor: "#E2F1E5",
  navy: "#16288B",
  teal: "#00A0AD",
  tealDeep: "#006B73",
  ink: "#1F2937",
  muted: "#6B7280",
  line: "#D9DEE7",
};

export function iso(wx: number, wy: number, h = 0): [number, number] {
  return [wx - wy, (wx + wy) / 2 - h];
}

export function fromIso(ix: number, iy: number): [number, number] {
  return [(ix + 2 * iy) / 2, (2 * iy - ix) / 2];
}

function shade(hex: string, amount: number) {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amount));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amount));
  const b = Math.max(0, Math.min(255, (n & 255) + amount));
  return `rgb(${r}, ${g}, ${b})`;
}

function poly(ctx: CanvasRenderingContext2D, pts: [number, number][], fill: string, stroke?: string) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  // 같은 색 선을 얇게 둘러 타일 사이 틈을 없앤다.
  ctx.strokeStyle = stroke ?? fill;
  ctx.lineWidth = 0.6;
  ctx.stroke();
}

export function floorQuad(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  d: number,
  fill: string,
  stroke?: string,
  h = 0,
) {
  poly(ctx, [iso(x, y, h), iso(x + w, y, h), iso(x + w, y + d, h), iso(x, y + d, h)], fill, stroke);
}

type BoxFaces = { top?: string; left?: string; right?: string; faces?: { left: boolean; right: boolean } };

// (x, y)는 바닥 모서리, w는 세계 x 길이, d는 세계 y 길이, h는 높이, z는 바닥에서 띄운 높이.
export function box(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  d: number,
  h: number,
  color: string,
  z = 0,
  opts: BoxFaces = {},
) {
  const top = opts.top ?? color;
  const left = opts.left ?? shade(color, -22);
  const right = opts.right ?? shade(color, -38);
  const showLeft = opts.faces?.left ?? true;
  const showRight = opts.faces?.right ?? true;
  if (showLeft) {
    // 남쪽 면(y + d): 화면 왼쪽 아래
    poly(ctx, [iso(x, y + d, z), iso(x + w, y + d, z), iso(x + w, y + d, z + h), iso(x, y + d, z + h)], left);
  }
  if (showRight) {
    // 동쪽 면(x + w): 화면 오른쪽 아래
    poly(ctx, [iso(x + w, y, z), iso(x + w, y + d, z), iso(x + w, y + d, z + h), iso(x + w, y, z + h)], right);
  }
  poly(ctx, [iso(x, y, z + h), iso(x + w, y, z + h), iso(x + w, y + d, z + h), iso(x, y + d, z + h)], top);
}

export function shadow(ctx: CanvasRenderingContext2D, wx: number, wy: number, rx = 10, alpha = 0.16) {
  const [sx, sy] = iso(wx, wy);
  ctx.fillStyle = `rgba(22, 40, 70, ${alpha})`;
  ctx.beginPath();
  ctx.ellipse(sx, sy, rx, rx / 2, 0, 0, Math.PI * 2);
  ctx.fill();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export type PersonStyle = { body: string; head: string; hair: string; badge?: string };

export const PLAYER_STYLE: PersonStyle = { body: ISO.navy, head: "#F2D7C4", hair: "#2B2F3A" };
export const OFFICER_STYLE: PersonStyle = { body: ISO.teal, head: "#F2D7C4", hair: "#3A3530", badge: "AI" };

// 사람: 그림자 + 둥근 몸통 + 머리. 걷는 동안 살짝 흔들린다. dir은 화면 기준 -1(왼쪽 봄)/1(오른쪽 봄).
export function person(
  ctx: CanvasRenderingContext2D,
  wx: number,
  wy: number,
  style: PersonStyle,
  bob: number,
  dir: number,
  back: boolean,
) {
  shadow(ctx, wx, wy, 10, 0.18);
  const [sx, sy] = iso(wx, wy);
  const lift = Math.abs(bob) * 2;
  // 다리
  ctx.fillStyle = shade(style.body, -40);
  roundRect(ctx, sx - 5, sy - 10 - lift, 4, 10, 2);
  ctx.fill();
  roundRect(ctx, sx + 1, sy - 10 - lift + bob, 4, 10 - bob, 2);
  ctx.fill();
  // 몸통
  ctx.fillStyle = style.body;
  roundRect(ctx, sx - 8, sy - 30 - lift, 16, 22, 7);
  ctx.fill();
  ctx.fillStyle = "rgba(255, 255, 255, 0.18)";
  roundRect(ctx, sx - 8 + (dir < 0 ? 9 : 1), sy - 28 - lift, 6, 16, 3);
  ctx.fill();
  // 머리
  const hy = sy - 38 - lift;
  ctx.fillStyle = style.head;
  ctx.beginPath();
  ctx.arc(sx, hy, 7.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = style.hair;
  ctx.beginPath();
  if (back) ctx.arc(sx, hy, 7.6, 0, Math.PI * 2);
  else ctx.arc(sx, hy - 1.5, 7.6, Math.PI * 1.02, Math.PI * 1.98);
  ctx.fill();
  if (!back) {
    ctx.fillStyle = "#2B2F3A";
    ctx.beginPath();
    ctx.arc(sx + dir * 3, hy + 1, 1.1, 0, Math.PI * 2);
    ctx.fill();
  }
  if (style.badge) {
    const by = hy - 20;
    ctx.fillStyle = "#FFFFFF";
    roundRect(ctx, sx - 11, by - 7, 22, 14, 7);
    ctx.fill();
    ctx.strokeStyle = ISO.teal;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = ISO.tealDeep;
    ctx.font = "700 9px 'IBM Plex Sans KR', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(style.badge, sx, by + 0.5);
  }
}

export function pill(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  text: string,
  tone: "ai" | "feature" | "planned" | "place" | "facility" | "focus",
  sub?: string,
) {
  ctx.font = "600 12px 'IBM Plex Sans KR', sans-serif";
  const tw = ctx.measureText(text).width;
  ctx.font = "500 10.5px 'IBM Plex Sans KR', sans-serif";
  const sw = sub ? ctx.measureText(sub).width + 8 : 0;
  const dot = tone === "planned" || tone === "place" ? 0 : 12;
  const w = tw + sw + dot + 18;
  const h = 24;
  const x = Math.round(sx - w / 2);
  const y = Math.round(sy - h / 2);
  ctx.shadowColor = "rgba(22, 40, 70, 0.12)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = tone === "planned" ? "rgba(255, 255, 255, 0.82)" : "#FFFFFF";
  roundRect(ctx, x, y, w, h, 12);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = tone === "focus" ? ISO.teal : ISO.line;
  ctx.lineWidth = tone === "focus" ? 1.5 : 1;
  ctx.stroke();
  let cx = x + 9;
  if (dot) {
    ctx.fillStyle = tone === "ai" || tone === "focus" ? ISO.teal : ISO.navy;
    ctx.beginPath();
    ctx.arc(cx + 3.5, y + h / 2, 3.5, 0, Math.PI * 2);
    ctx.fill();
    cx += dot;
  }
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = "600 12px 'IBM Plex Sans KR', sans-serif";
  ctx.fillStyle = tone === "planned" ? ISO.muted : ISO.ink;
  ctx.fillText(text, cx, y + h / 2 + 0.5);
  if (sub) {
    ctx.font = "500 10.5px 'IBM Plex Sans KR', sans-serif";
    ctx.fillStyle = tone === "ai" ? ISO.tealDeep : ISO.muted;
    ctx.fillText(sub, cx + tw + 8, y + h / 2 + 0.5);
  }
}
