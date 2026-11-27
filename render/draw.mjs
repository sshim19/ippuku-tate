/**
 * 茶室・碗・茶・泡・茶せん・左右の域。640×360 論理座標。Y は下向き。
 * 画像アセットは使わない。定数の意味は書き換えない。
 */

import * as constants from "../engine/constants.mjs";
import { drawFx, drawSheen, revealZoom } from "./fx.mjs";
import { drawMotionGuides } from "./hand-guides.mjs";

export const VIEW_W = constants.VIEW_W ?? 640;
export const VIEW_H = constants.VIEW_H ?? 360;

export const LEFT_X0 = constants.LEFT_X0 ?? 0;
export const LEFT_X1 = constants.LEFT_X1 ?? 300;
export const LEFT_Y0 = constants.LEFT_Y0 ?? 36;
export const LEFT_Y1 = constants.LEFT_Y1 ?? 360;

export const RIGHT_X0 = constants.RIGHT_X0 ?? 340;
export const RIGHT_X1 = constants.RIGHT_X1 ?? 640;
export const RIGHT_Y0 = constants.RIGHT_Y0 ?? 36;
export const RIGHT_Y1 = constants.RIGHT_Y1 ?? 360;
export const RIGHT_EDGE_SLACK = constants.RIGHT_EDGE_SLACK ?? 20;

export const BOWL_CX = constants.BOWL_CX ?? 208;
export const BOWL_CY = constants.BOWL_CY ?? 196;
export const BOWL_R = constants.BOWL_VISUAL_R ?? constants.BOWL_R ?? 86;

const WALL_A = "#efe6d4";
const WALL_B = "#e4d5bc";
const TATAMI_A = "#c4a574";
const TATAMI_B = "#d4b896";
const TATAMI_C = "#b3915e";
const HERI = "#6b3a10";
const RAKU = "#2a2420";
const MIKOMI = "#3a2a1c";
const TEA_A = "#1a4a28";
const TEA_B = "#2d6a38";
const FOAM = "#f4f7e8";
const BAMBOO = "#c9a36a";
const BAMBOO_DARK = "#8a6a32";
const GUIDE = "#1c2430";

const TEA_R = 62;
const WHISK_HOME_X = 492;
const WHISK_HOME_Y = 210;

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function clamp01(n) {
  return clamp(Number(n) || 0, 0, 1);
}

function rgba(hex, a) {
  const n = parseInt(String(hex || "#ffffff").replace("#", ""), 16);
  if (!Number.isFinite(n)) return `rgba(255, 255, 255, ${a})`;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

function u32(n) {
  return n >>> 0;
}

function mix(a, b) {
  let h = u32(a);
  h = Math.imul(h ^ u32(b), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return u32(h ^ (h >>> 16));
}

function rand01(h) {
  return u32(h) / 4294967296;
}

function hashSeed(state) {
  const s = String(state?.seed || state?.dateJst || "ippuku-tate");
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return u32(h);
}

/**
 * キャンバスを CSS サイズ × DPR に合わせ、描画は CSS ピクセル座標で行う。
 * @returns {{ cssW: number, cssH: number, dpr: number }}
 */
export function syncCanvasSize(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const cssW = Math.max(1, canvas.clientWidth || VIEW_W);
  const cssH = Math.max(1, canvas.clientHeight || VIEW_H);
  const w = Math.round(cssW * dpr);
  const h = Math.round(cssH * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  return { cssW, cssH, dpr };
}

/**
 * 高さに合わせて 640×360 を伸ばし、幅が足りなければ contain する。
 * 余った部分は同じ壁色で埋める。
 */
export function makeView(cssW, cssH) {
  let scale = cssH / VIEW_H;
  if (VIEW_W * scale > cssW + 0.5) scale = cssW / VIEW_W;
  const drawW = VIEW_W * scale;
  const drawH = VIEW_H * scale;
  const ox = (cssW - drawW) / 2;
  const oy = (cssH - drawH) / 2;
  return {
    scale,
    ox,
    oy,
    drawW,
    drawH,
    cssW,
    cssH,
    sx(x) {
      return ox + x * scale;
    },
    sy(y) {
      return oy + y * scale;
    },
    px(wu) {
      return wu * scale;
    },
    worldX(cssX) {
      return (cssX - ox) / scale;
    },
    worldY(cssY) {
      return (cssY - oy) / scale;
    },
  };
}

/**
 * クライアント座標をキャンバス論理座標（0..640, 0..360, Y 下向き）へ。
 * @returns {{ x: number, y: number }}
 */
export function clientToLogical(canvas, clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const cssW = canvas.clientWidth || rect.width || VIEW_W;
  const cssH = canvas.clientHeight || rect.height || VIEW_H;
  const view = makeView(cssW, cssH);
  const cssX = ((clientX - rect.left) / (rect.width || 1)) * cssW;
  const cssY = ((clientY - rect.top) / (rect.height || 1)) * cssH;
  return { x: view.worldX(cssX), y: view.worldY(cssY) };
}

export function inLeftZone(x, y) {
  return x >= LEFT_X0 && x <= LEFT_X1 && y >= LEFT_Y0 && y <= LEFT_Y1;
}

export function inRightZone(x, y, slack = 0) {
  return x >= RIGHT_X0 - slack && x <= RIGHT_X1 + slack && y >= RIGHT_Y0 - slack && y <= RIGHT_Y1 + slack;
}

function teaColors(matcha) {
  if (matcha === "light") return { a: "#2a6234", b: "#4a8a50", deep: "#1e4a28" };
  if (matcha === "heavy") return { a: "#102818", b: "#1a4a28", deep: "#0a1c10" };
  return { a: TEA_A, b: TEA_B, deep: "#12351c" };
}

function fillWall(ctx, view) {
  const g = ctx.createLinearGradient(0, view.sy(0), 0, view.sy(VIEW_H));
  g.addColorStop(0, WALL_A);
  g.addColorStop(0.42, WALL_B);
  g.addColorStop(1, WALL_B);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, view.cssW, view.cssH);
}

function drawShoji(ctx, view, seed) {
  const x = view.sx(28);
  const y = view.sy(10);
  const w = view.px(150);
  const h = view.px(78);
  ctx.save();
  ctx.fillStyle = rgba("#f5f0e6", 0.72);
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = rgba("#8a6a32", 0.45);
  ctx.lineWidth = Math.max(1, view.px(1.6));
  ctx.strokeRect(x, y, w, h);
  ctx.beginPath();
  const cols = 4;
  const rows = 3;
  for (let i = 1; i < cols; i++) {
    const gx = x + (w * i) / cols;
    ctx.moveTo(gx, y);
    ctx.lineTo(gx, y + h);
  }
  for (let j = 1; j < rows; j++) {
    const gy = y + (h * j) / rows;
    ctx.moveTo(x, gy);
    ctx.lineTo(x + w, gy);
  }
  ctx.stroke();
  const glow = ctx.createRadialGradient(view.sx(120), view.sy(90), view.px(10), view.sx(170), view.sy(150), view.px(220));
  glow.addColorStop(0, rgba("#f5f0e6", 0.22));
  glow.addColorStop(1, rgba("#f5f0e6", 0));
  ctx.fillStyle = glow;
  ctx.fillRect(view.sx(0), view.sy(0), view.px(360), view.px(240));
  ctx.restore();
  void seed;
}

function drawTatami(ctx, view, seed) {
  const top = 118;
  ctx.fillStyle = TATAMI_B;
  ctx.fillRect(view.sx(-4), view.sy(top), view.px(VIEW_W + 8), view.px(VIEW_H - top + 8));

  const bands = [
    { y: 118, h: 80, c: TATAMI_A },
    { y: 198, h: 86, c: TATAMI_B },
    { y: 284, h: 80, c: TATAMI_C },
  ];
  for (const b of bands) {
    ctx.fillStyle = b.c;
    ctx.fillRect(view.sx(-4), view.sy(b.y), view.px(VIEW_W + 8), view.px(b.h));
    ctx.strokeStyle = rgba(HERI, 0.55);
    ctx.lineWidth = Math.max(2, view.px(5));
    ctx.beginPath();
    ctx.moveTo(view.sx(-4), view.sy(b.y));
    ctx.lineTo(view.sx(VIEW_W + 4), view.sy(b.y));
    ctx.stroke();
  }

  ctx.save();
  ctx.strokeStyle = rgba("#8a6a32", 0.18);
  ctx.lineWidth = Math.max(0.6, view.px(0.7));
  for (let y = 124; y < VIEW_H; y += 6) {
    ctx.beginPath();
    ctx.moveTo(view.sx(0), view.sy(y));
    ctx.lineTo(view.sx(VIEW_W), view.sy(y));
    ctx.stroke();
  }
  ctx.strokeStyle = rgba("#6b5224", 0.08);
  for (let x = 8; x < VIEW_W; x += 18) {
    const jitter = (rand01(mix(seed, x * 13)) - 0.5) * 2;
    ctx.beginPath();
    ctx.moveTo(view.sx(x + jitter), view.sy(120));
    ctx.lineTo(view.sx(x + jitter), view.sy(VIEW_H));
    ctx.stroke();
  }
  ctx.restore();
}

function drawStillLife(ctx, view) {
  const x = view.sx(560);
  const y = view.sy(132);
  ctx.save();
  ctx.fillStyle = rgba("#3a2a1c", 0.92);
  ctx.beginPath();
  ctx.ellipse(x, y, view.px(16), view.px(11), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = rgba("#2a2420", 0.95);
  ctx.beginPath();
  ctx.ellipse(x, y - view.px(8), view.px(11), view.px(8), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = rgba("#c9a36a", 0.35);
  ctx.lineWidth = Math.max(1, view.px(1));
  ctx.stroke();

  ctx.strokeStyle = rgba("#8a6a32", 0.45);
  ctx.lineWidth = Math.max(1.2, view.px(1.4));
  ctx.beginPath();
  ctx.moveTo(view.sx(600), view.sy(128));
  ctx.quadraticCurveTo(view.sx(618), view.sy(118), view.sx(628), view.sy(138));
  ctx.stroke();
  ctx.restore();
}

function drawBowlBody(ctx, view, angle) {
  const cx = view.sx(BOWL_CX);
  const cy = view.sy(BOWL_CY);
  const r = view.px(BOWL_R);
  ctx.save();
  const body = ctx.createRadialGradient(cx - r * 0.25, cy - r * 0.2, r * 0.15, cx, cy, r);
  body.addColorStop(0, "#3a332e");
  body.addColorStop(0.55, RAKU);
  body.addColorStop(1, "#1a1613");
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = rgba("#1a1613", 0.85);
  ctx.lineWidth = Math.max(2, view.px(3.2));
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, view.px(70), 0, Math.PI * 2);
  ctx.fillStyle = MIKOMI;
  ctx.fill();

  ctx.strokeStyle = rgba("#c9a36a", 0.22);
  ctx.lineWidth = Math.max(1, view.px(1.6));
  ctx.beginPath();
  ctx.arc(cx, cy, r - view.px(3.5), 0, Math.PI * 2);
  ctx.stroke();

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.strokeStyle = rgba("#f5f0e6", 0.07);
  ctx.lineWidth = Math.max(1, view.px(1.2));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(0, 0, r - view.px(8), a, a + 0.18);
    ctx.stroke();
  }
  ctx.restore();
  ctx.restore();
}

function drawTea(ctx, view, state, angle, reduced) {
  const C = clamp01(state?.C);
  const F = clamp01(state?.F);
  const B = clamp01(state?.B);
  const colors = teaColors(state?.params?.matcha);
  const cx = view.sx(BOWL_CX);
  const cy = view.sy(BOWL_CY);
  const r = view.px(TEA_R);
  const pour = state?.status === "playing" && state?.phase === "pour";
  const pourT = Number(state?.phaseT) || 0;
  const fill = pour ? clamp01(pourT / 1.6) : 1;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();

  const liquidR = r * (0.55 + 0.45 * fill);
  // 碗が押されて動くと、茶が逆へ寄る（揺れ）。
  const slx = clamp(-(Number(state?.bowl?.vx) || 0) * 0.05, -6, 6);
  const sly = clamp(-(Number(state?.bowl?.vy) || 0) * 0.05, -6, 6);
  const tea = ctx.createRadialGradient(cx - r * 0.15 + view.px(slx), cy - r * 0.15 + view.px(sly), r * 0.1, cx + view.px(slx), cy + view.px(sly), liquidR);
  tea.addColorStop(0, colors.b);
  tea.addColorStop(0.7, colors.a);
  tea.addColorStop(1, colors.deep);
  ctx.fillStyle = tea;
  ctx.beginPath();
  ctx.arc(cx, cy, liquidR, 0, Math.PI * 2);
  ctx.fill();

  if (fill > 0.2) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.strokeStyle = rgba(colors.b, 0.28 + 0.2 * clamp01(state?.energy));
    ctx.lineWidth = Math.max(0.8, view.px(1.1));
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.ellipse(0, 0, liquidR * (0.28 * i), liquidR * (0.16 * i), 0.4, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  if (C > 0.02 && fill > 0.55) {
    ctx.fillStyle = rgba(FOAM, 0.14 + 0.22 * C + 0.48 * C * F);
    ctx.beginPath();
    ctx.arc(cx, cy, liquidR * (0.92), 0, Math.PI * 2);
    ctx.fill();
    drawFoamGrains(ctx, view, { C, F, B, angle, reduced, seed: hashSeed(state) });
    drawCoarseBubbles(ctx, view, { B, C, angle, reduced, seed: hashSeed(state) ^ 0x9e3779b9 });
  }

  ctx.restore();
}

function drawFoamGrains(ctx, view, { C, F, B, angle, reduced, seed }) {
  const count = reduced ? 22 : Math.round(34 + C * 30 + F * 24);
  const size = (5.4 - F * 4.15) * (1 + B * 0.32);
  const tight = 0.5 + F * 0.46;
  for (let i = 0; i < count; i++) {
    const h = mix(seed, i * 97 + 11);
    const u = rand01(h);
    const v = rand01(mix(h, 19));
    const rad = Math.sqrt(u) * TEA_R * tight;
    const th = v * Math.PI * 2 + angle * (0.7 + F * 0.4);
    const x = view.sx(BOWL_CX + Math.cos(th) * rad);
    const y = view.sy(BOWL_CY + Math.sin(th) * rad);
    const rr = view.px(size * (0.65 + rand01(mix(h, 7)) * 0.7));
    ctx.fillStyle = rgba(FOAM, 0.2 + C * 0.58 * (0.45 + F * 0.55));
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0.55, rr), 0, Math.PI * 2);
    ctx.fill();
  }
  if (!reduced && F > 0.4) {
    const extra = Math.round((F - 0.4) * 56);
    for (let i = 0; i < extra; i++) {
      const h = mix(seed, i * 191 + 61);
      const u = rand01(h);
      const v = rand01(mix(h, 29));
      const rad = Math.sqrt(u) * TEA_R * (0.72 + F * 0.2);
      const th = v * Math.PI * 2 + angle * 1.05;
      const x = view.sx(BOWL_CX + Math.cos(th) * rad);
      const y = view.sy(BOWL_CY + Math.sin(th) * rad);
      ctx.fillStyle = rgba(FOAM, 0.28 + F * 0.45);
      ctx.beginPath();
      ctx.arc(x, y, Math.max(0.4, view.px(0.7 + rand01(mix(h, 3)) * 0.6)), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawCoarseBubbles(ctx, view, { B, C, angle, reduced, seed }) {
  if (B < 0.04) return;
  const count = Math.round((reduced ? 4 : 8) * B + 1);
  for (let i = 0; i < count; i++) {
    const h = mix(seed, i * 131 + 3);
    const u = rand01(h);
    const v = rand01(mix(h, 23));
    const rad = 10 + Math.sqrt(u) * (TEA_R - 16);
    const th = v * Math.PI * 2 + angle * 0.35;
    const x = view.sx(BOWL_CX + Math.cos(th) * rad);
    const y = view.sy(BOWL_CY + Math.sin(th) * rad);
    const rr = view.px(6 + B * 10 * (0.6 + rand01(mix(h, 41)) * 0.8));
    ctx.strokeStyle = rgba(FOAM, 0.28 + B * 0.4);
    ctx.fillStyle = rgba(FOAM, 0.08 + B * 0.12 * C);
    ctx.lineWidth = Math.max(0.8, view.px(1));
    ctx.beginPath();
    ctx.arc(x, y, Math.max(1.5, rr), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

function drawPour(ctx, view, fx) {
  const t = Number(fx?.pourT) || 0;
  if (t <= 0 || t > 1.62) return;
  const u = clamp01(t / 1.6);
  const lift = u < 0.12 ? u / 0.12 : u > 0.88 ? (1 - u) / 0.12 : 1;
  const hx = BOWL_CX - 28;
  const hy = BOWL_CY - 118 + (1 - lift) * 20;
  const cx = view.sx(hx);
  const cy = view.sy(hy);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.55);
  ctx.fillStyle = BAMBOO;
  ctx.strokeStyle = BAMBOO_DARK;
  ctx.lineWidth = Math.max(1, view.px(1));
  ctx.beginPath();
  ctx.moveTo(view.px(-36), 0);
  ctx.lineTo(view.px(22), 0);
  ctx.lineTo(view.px(28), view.px(8));
  ctx.lineTo(view.px(6), view.px(14));
  ctx.lineTo(view.px(-4), view.px(6));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = rgba("#f5f0e6", 0.35);
  ctx.fillRect(view.px(-36), view.px(-2.2), view.px(40), view.px(4));
  ctx.restore();

  const fromX = view.sx(hx + 18);
  const fromY = view.sy(hy + 12);
  const toX = view.sx(BOWL_CX + 4);
  const toY = view.sy(BOWL_CY - 20);
  const midX = (fromX + toX) / 2 + view.px(8);
  const midY = (fromY + toY) / 2 + view.px(6);
  ctx.strokeStyle = rgba(TEA_B, 0.55 * lift);
  ctx.lineWidth = Math.max(1.6, view.px(3.2 * (0.7 + 0.3 * Math.sin(t * 22))));
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.quadraticCurveTo(midX, midY, toX, toY);
  ctx.stroke();
  ctx.strokeStyle = rgba(FOAM, 0.25 * lift);
  ctx.lineWidth = Math.max(0.8, view.px(1.2));
  ctx.stroke();
}

function whiskHeadInBowl(right, off = { x: 0, y: 0 }) {
  const active = !!right?.active;
  const fx = active ? right.x - WHISK_HOME_X : 0;
  const fy = active ? right.y - WHISK_HOME_Y : 0;
  const scale = 0.32;
  let x = BOWL_CX + fx * scale;
  let y = BOWL_CY + fy * scale - 4;
  const dx = x - BOWL_CX;
  const dy = y - BOWL_CY;
  const d = Math.hypot(dx, dy);
  const max = TEA_R - 14;
  if (d > max) {
    x = BOWL_CX + (dx / d) * max;
    y = BOWL_CY + (dy / d) * max;
  }
  return { x: x + off.x, y: y + off.y, active };
}

function drawChasen(ctx, view, right, reduced, off) {
  const head = whiskHeadInBowl(right, off);
  const handX = right?.active ? right.x : WHISK_HOME_X + 16;
  const handY = right?.active ? right.y : WHISK_HOME_Y + 8;
  const clampX = clamp(handX, RIGHT_X0 + 8, VIEW_W - 8);
  const clampY = clamp(handY, RIGHT_Y0 + 8, VIEW_H - 8);

  const hx = view.sx(head.x);
  const hy = view.sy(head.y);
  const tx = view.sx(clampX);
  const ty = view.sy(clampY);

  ctx.save();
  ctx.strokeStyle = BAMBOO_DARK;
  ctx.lineWidth = Math.max(2.2, view.px(3.4));
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.quadraticCurveTo((tx + hx) / 2 + view.px(18), (ty + hy) / 2 - view.px(16), hx, hy - view.px(10));
  ctx.stroke();
  ctx.strokeStyle = BAMBOO;
  ctx.lineWidth = Math.max(1.6, view.px(2.2));
  ctx.stroke();

  const tines = reduced ? 10 : 16;
  const splay = 9 + (head.active ? 2 : 0);
  ctx.strokeStyle = BAMBOO;
  ctx.lineWidth = Math.max(0.8, view.px(1.05));
  ctx.lineCap = "round";
  for (let i = 0; i < tines; i++) {
    const t = tines === 1 ? 0 : i / (tines - 1);
    const ox = (t - 0.5) * splay;
    const tipY = 16 + Math.sin(t * Math.PI) * 3;
    ctx.beginPath();
    ctx.moveTo(hx + view.px(ox * 0.25), hy - view.px(10));
    ctx.quadraticCurveTo(
      hx + view.px(ox * 0.7),
      hy + view.px(2),
      hx + view.px(ox),
      hy + view.px(tipY),
    );
    ctx.stroke();
  }
  ctx.fillStyle = BAMBOO_DARK;
  ctx.beginPath();
  ctx.ellipse(hx, hy - view.px(11), view.px(7), view.px(3.2), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function bumpMatch(x, t, tol) {
  const w = Number(tol) || 0;
  const d = Math.abs((Number(x) || 0) - (Number(t) || 0));
  if (!(w > 0)) return d === 0 ? 1 : 0;
  return Math.max(0, 1 - d / w);
}

function guideColor(match, a) {
  const m = clamp01(match);
  const r = Math.round(28 + m * 90);
  const g = Math.round(36 + m * 70);
  const b = Math.round(48 - m * 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function drawGuideBead(ctx, view, x, y, match, pulse, reduced) {
  const rad = view.px((reduced ? 4.2 : 5.6) * pulse * (0.92 + 0.18 * match));
  ctx.beginPath();
  ctx.arc(view.sx(x), view.sy(y), rad + view.px(2.4 + match * 2), 0, Math.PI * 2);
  ctx.fillStyle = rgba("#f5f0e6", 0.14 + 0.28 * match);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(view.sx(x), view.sy(y), rad, 0, Math.PI * 2);
  ctx.fillStyle = guideColor(match, 0.55 + 0.4 * match);
  ctx.fill();
  ctx.strokeStyle = rgba("#f5f0e6", 0.7 + 0.25 * match);
  ctx.lineWidth = Math.max(0.8, view.px(1.15));
  ctx.stroke();
}

function drawTempoGuides(ctx, view, state, clock, reduced) {
  if (state?.status !== "playing") return;
  if (state.phase !== "pour" && state.phase !== "whisk") return;
  const tempoT = Number(state?.params?.tempoTarget) || 4;
  const tempoTol = Number(state?.params?.tempoTol) || 0.85;
  const tempoMatch = bumpMatch(state?.right?.tempo, tempoT, tempoTol) * clamp01(state?.right?.pathQ);
  const t = Number(clock) || 0;
  const pulse = reduced ? 1 : 0.86 + 0.14 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2 * Math.max(2.2, tempoT * 0.5)));

  ctx.save();
  const amp = 52;
  const width = 40;
  const cx = 492;
  const cy = 200;
  const rightA = 0.34 + 0.42 * tempoMatch;
  ctx.strokeStyle = guideColor(tempoMatch, rightA);
  ctx.lineWidth = Math.max(1.2, view.px(1.5 + tempoMatch * 0.8));
  ctx.setLineDash(tempoMatch > 0.72 ? [] : [view.px(3.5), view.px(4)]);
  ctx.beginPath();
  const steps = 24;
  for (let i = 0; i <= steps; i++) {
    const p = i / steps;
    const y = cy - amp / 2 + p * amp;
    const x = cx + Math.sin(p * Math.PI * 2) * (width / 2);
    if (i === 0) ctx.moveTo(view.sx(x), view.sy(y));
    else ctx.lineTo(view.sx(x), view.sy(y));
  }
  ctx.stroke();
  ctx.setLineDash([]);

  const half = 1 / Math.max(0.5, tempoT);
  const phase = (t % (half * 2)) / (half * 2);
  const tri = phase < 0.5 ? phase * 2 : 1 - (phase - 0.5) * 2;
  const gy = cy - amp / 2 + tri * amp;
  const gx = cx + Math.sin(tri * Math.PI * 2) * (width / 2);
  const beat = reduced ? 1 : 0.82 + 0.18 * (0.5 + 0.5 * Math.cos(phase * Math.PI * 2));
  drawGuideBead(ctx, view, gx, gy, tempoMatch, pulse * beat, reduced);
  ctx.restore();
}

/** 茶碗の置き場所の輪（畳の上）。碗がずれると輪から外れて見える。茶碗より先に描く。 */
function drawHomeRing(ctx, view, state) {
  if (state?.status !== "playing") return;
  if (state.phase !== "pour" && state.phase !== "whisk") return;
  const held = !!state?.bowl?.held;
  const steady = held ? clamp01(state?.steady ?? state?.bowl?.steady) : 0;
  ctx.save();
  ctx.strokeStyle = guideColor(steady, 0.45 + 0.4 * steady);
  ctx.lineWidth = Math.max(1.4, view.px(2 + steady));
  ctx.setLineDash(steady > 0.72 ? [] : [view.px(4), view.px(4)]);
  ctx.beginPath();
  ctx.arc(view.sx(BOWL_CX), view.sy(BOWL_CY), view.px(BOWL_R + 7), 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

/** 押さえる場所。左の指が碗に乗っていないあいだだけ、縁に印を出す。 */
function drawGripMark(ctx, bview, state, clock, reduced) {
  if (state?.status !== "playing") return;
  if (state.phase !== "pour" && state.phase !== "whisk") return;
  if (state?.bowl?.held) return;
  const t = Number(clock) || 0;
  const pulse = reduced ? 1 : 0.85 + 0.15 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 1.2));
  drawGuideBead(ctx, bview, BOWL_CX - 80, BOWL_CY, 0.2, pulse * 1.3, reduced);
}

function drawAlignCue(ctx, view, fx, reduced) {
  const cue = Number(fx?.alignCue) || 0;
  const fade = Math.max(0, Math.min(1, (cue - 0.32) / 0.28));
  if (fade < 0.2) return;
  const text = "そろっている";
  const pulse = reduced ? 1 : 1 + 0.04 * Math.sin((Number(fx?.clock) || 0) * Math.PI * 2 * 2.4);
  const x = view.sx(BOWL_CX);
  const y = view.sy(BOWL_CY - BOWL_R - 32);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(pulse, pulse);
  ctx.globalAlpha = 0.55 + 0.45 * fade;
  ctx.font = `700 ${Math.max(13, view.px(14))}px "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const tw = ctx.measureText(text).width;
  const padX = 9;
  const padY = 5;
  const h = Math.max(18, view.px(16));
  ctx.fillStyle = rgba("#f5f0e6", 0.96);
  ctx.strokeStyle = rgba("#1c2430", 0.18);
  ctx.lineWidth = Math.max(1, view.px(1));
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(-tw / 2 - padX, -h / 2 - padY, tw + padX * 2, h + padY * 2, 6);
  } else {
    ctx.rect(-tw / 2 - padX, -h / 2 - padY, tw + padX * 2, h + padY * 2);
  }
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#1c2430";
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

function drawTouchRings(ctx, view, opts) {
  const left = opts.left;
  const right = opts.right;
  for (const p of [left, right]) {
    if (!p?.active) continue;
    ctx.save();
    ctx.strokeStyle = rgba(GUIDE, 0.4);
    ctx.lineWidth = Math.max(1.2, view.px(1.6));
    ctx.beginPath();
    ctx.arc(view.sx(p.x), view.sy(p.y), view.px(8), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * 押さえている縁の点。茶せんに押されて碗が指からずれると、指との間に細い線が出る。
 * 線が伸びた向きと逆へ指を動かせば、碗は輪に戻る。
 */
function drawGripContact(ctx, view, state, left, off) {
  const b = state?.bowl;
  if (!b?.held || !left?.active) return;
  if (state?.status !== "playing" || state.phase === "reveal") return;
  const gx = BOWL_CX + off.x + (Number(b.grabX) || 0);
  const gy = BOWL_CY + off.y + (Number(b.grabY) || 0);
  const gap = Math.hypot(left.x - gx, left.y - gy);
  ctx.save();
  if (gap > 3) {
    ctx.strokeStyle = rgba("#7a2e1a", Math.min(0.75, 0.25 + gap / 40));
    ctx.lineWidth = Math.max(1.2, view.px(1.8));
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(view.sx(left.x), view.sy(left.y));
    ctx.lineTo(view.sx(gx), view.sy(gy));
    ctx.stroke();
  }
  ctx.fillStyle = rgba("#f5f0e6", 0.85);
  ctx.strokeStyle = rgba(GUIDE, 0.55);
  ctx.lineWidth = Math.max(1, view.px(1.2));
  ctx.beginPath();
  ctx.arc(view.sx(gx), view.sy(gy), view.px(4), 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** state.bowl のずれ（wu）。描画用に ±48 に切る。 */
function bowlOffset(state) {
  const x = clamp(Number(state?.bowl?.x) || 0, -48, 48);
  const y = clamp(Number(state?.bowl?.y) || 0, -48, 48);
  return { x, y };
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} state
 * @param {{ reducedMotion?: boolean, fx?: object, left?: object, right?: object }} [opts]
 */
export function drawScene(ctx, state, opts = {}) {
  const canvas = ctx.canvas;
  const { cssW, cssH, dpr } = syncCanvasSize(canvas);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const base = makeView(cssW, cssH);
  const reduced = !!opts.reducedMotion;
  const fx = opts.fx;
  const zoom = revealZoom(fx, reduced);
  const view =
    zoom === 1
      ? base
      : {
          ...base,
          sx(x) {
            return base.sx(BOWL_CX + (x - BOWL_CX) * zoom);
          },
          sy(y) {
            return base.sy(BOWL_CY + (y - BOWL_CY) * zoom);
          },
          px(wu) {
            return base.px(wu * zoom);
          },
        };

  fillWall(ctx, base);
  const seed = hashSeed(state);
  drawShoji(ctx, view, seed);
  drawTatami(ctx, view, seed);
  drawStillLife(ctx, view);

  const angle = Number(fx?.bowlAngle) || 0;
  const off = bowlOffset(state);
  const bview = {
    ...view,
    sx(x) {
      return view.sx(x + off.x);
    },
    sy(y) {
      return view.sy(y + off.y);
    },
  };
  drawHomeRing(ctx, view, state);
  drawBowlBody(ctx, bview, angle);
  drawTea(ctx, bview, state, angle, reduced);
  drawSheen(ctx, bview, fx, TEA_R);
  drawPour(ctx, bview, fx);
  drawChasen(ctx, view, opts.right || { active: false, x: WHISK_HOME_X, y: WHISK_HOME_Y }, reduced, off);
  if (state.hintLeft === false) drawGripMark(ctx, bview, state, fx?.clock || 0, reduced);
  if (state.hintRight === false) drawTempoGuides(ctx, view, state, fx?.clock || 0, reduced);
  drawMotionGuides(ctx, view, state);
  drawGripContact(ctx, view, state, opts.left, off);
  drawTouchRings(ctx, view, opts);
  drawFx(ctx, fx, { ...view, reducedMotion: reduced }, state);
  drawAlignCue(ctx, view, fx, reduced);
}
