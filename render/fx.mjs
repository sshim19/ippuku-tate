/**
 * 寄る開示、吹き出し、湯気、そろったときのつや。
 * エンジンは触らず、state の差分から演出を進める。
 */

import * as constants from "../engine/constants.mjs";
import { dailyCondition, formatScore, gradeCallout } from "./share.mjs";

export const JUDGE_BALLOON_OFFSET = constants.JUDGE_BALLOON_OFFSET ?? 70;
const BOWL_CX = constants.BOWL_CX ?? 208;
const BOWL_CY = constants.BOWL_CY ?? 196;
const BOWL_R = constants.BOWL_VISUAL_R ?? constants.BOWL_R ?? 86;
// 70wu above the center would sit inside a bowl of radius 86. Place just above the rim.
const BALLOON_Y = -(BOWL_R + 22);
const STEAM_CAP = 28;
const FONT = `"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif`;

function clamp01(n) {
  return Math.max(0, Math.min(1, Number(n) || 0));
}

function rgba(hex, a) {
  const n = parseInt(String(hex || "#f5f0e6").replace("#", ""), 16);
  if (!Number.isFinite(n)) return `rgba(245, 240, 230, ${a})`;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function tempSteam(temp) {
  if (temp === "hot") return 1;
  if (temp === "cool") return 0.28;
  return 0.62;
}

export function createFx() {
  return {
    clock: 0,
    bowlAngle: 0,
    steam: [],
    floats: [],
    sheen: 0,
    alignCue: 0,
    revealZoom: 1,
    pourT: 0,
    dailyAlpha: 0,
    prev: null,
  };
}

export function resetFx(fx) {
  if (!fx) return;
  fx.clock = 0;
  fx.bowlAngle = 0;
  fx.steam.length = 0;
  fx.floats.length = 0;
  fx.sheen = 0;
  fx.alignCue = 0;
  fx.revealZoom = 1;
  fx.pourT = 0;
  fx.dailyAlpha = 0;
  fx.prev = null;
}

function addSteam(fx, temp, reduced) {
  const cap = reduced ? 10 : STEAM_CAP;
  if (fx.steam.length >= cap) return;
  const strength = tempSteam(temp);
  if (Math.random() > 0.55 + strength * 0.35) return;
  const ang = (Math.random() - 0.5) * 1.1;
  fx.steam.push({
    x: BOWL_CX + (Math.random() - 0.5) * 36,
    y: BOWL_CY - 18 + (Math.random() - 0.5) * 10,
    vx: Math.sin(ang) * (6 + Math.random() * 10),
    vy: -(18 + Math.random() * 22) * (0.7 + strength * 0.5),
    r: 4 + Math.random() * 7,
    life: 0.7 + Math.random() * 0.7,
    max: 1.1 + Math.random() * 0.4,
  });
}

function spawnBalloons(fx, state) {
  const grade = state?.grade || "early";
  const score = Math.max(0, Math.floor(Number(state?.score) || 0));
  fx.floats.length = 0;
  fx.floats.push({
    kind: "grade",
    text: gradeCallout(grade),
    life: 1.6,
    max: 1.6,
    yWu: BALLOON_Y,
    color: "#1c2430",
  });
  fx.floats.push({
    kind: "score",
    text: `${formatScore(score)}点`,
    life: 1.6,
    max: 1.6,
    yWu: BALLOON_Y + 22,
    color: "#1c2430",
  });
}

/**
 * @param {object} fx
 * @param {object} state
 * @param {number} dt
 * @param {{ reducedMotion?: boolean }} [opts]
 */
export function syncFx(fx, state, dt, opts = {}) {
  if (!fx) return;
  const reduced = !!opts.reducedMotion;
  const t = Math.max(0, Number(dt) || 0);
  fx.clock += t;

  // 茶碗は回さない。茶せんの勢いで茶の面だけがゆっくり渦を巻く。
  if (state?.status === "playing" && state?.phase === "whisk" && !reduced) {
    fx.bowlAngle += clamp01(state?.energy) * 0.5 * t;
  }

  const phase = state?.phase;
  const playing = state?.status === "playing";
  fx.pourT = phase === "pour" && playing ? Number(state?.phaseT) || 0 : 0;

  const aligned = clamp01(state?.aligned);
  const targetSheen = playing && phase === "whisk" ? aligned * (0.35 + 0.65 * clamp01(state?.F)) : 0;
  const k = 1 - Math.exp(-t / 0.18);
  fx.sheen += (targetSheen - fx.sheen) * k;
  if (playing && (phase === "pour" || phase === "whisk")) {
    const targetCue = aligned;
    fx.alignCue += (targetCue - (Number(fx.alignCue) || 0)) * (1 - Math.exp(-t / 0.16));
  } else {
    fx.alignCue = 0;
  }

  const wantDaily = !!(playing && state?.showDailyLine && phase === "whisk");
  fx.dailyAlpha += ((wantDaily ? 1 : 0) - fx.dailyAlpha) * (1 - Math.exp(-t / 0.2));

  const zoomTarget = playing && phase === "reveal" ? (reduced ? 1.04 : 1.12) : 1;
  fx.revealZoom += (zoomTarget - fx.revealZoom) * (1 - Math.exp(-t / (reduced ? 0.2 : 0.35)));

  const prevPhase = fx.prev?.phase;
  const prevStatus = fx.prev?.status;
  if ((prevPhase !== "reveal" && phase === "reveal") ||
      (prevStatus !== "over" && state?.status === "over" && fx.floats.length === 0)) {
    spawnBalloons(fx, state);
  }

  if (playing && (phase === "pour" || phase === "whisk")) {
    const rate = phase === "pour" ? 18 : 10;
    const steps = reduced ? 1 : Math.max(1, Math.round(rate * t));
    for (let i = 0; i < steps; i++) addSteam(fx, state?.params?.temp, reduced);
  }

  for (let i = fx.steam.length - 1; i >= 0; i--) {
    const p = fx.steam[i];
    p.life -= t;
    p.x += p.vx * t;
    p.y += p.vy * t;
    p.vx *= Math.exp(-t / 0.8);
    if (p.life <= 0) fx.steam.splice(i, 1);
  }
  if (fx.steam.length > STEAM_CAP) fx.steam.splice(0, fx.steam.length - STEAM_CAP);

  for (let i = fx.floats.length - 1; i >= 0; i--) {
    const f = fx.floats[i];
    if (phase === "reveal") {
      f.life = Math.max(f.life, 0.2);
    } else {
      f.life -= t;
      if (f.life <= 0) fx.floats.splice(i, 1);
    }
  }

  fx.prev = {
    status: state?.status,
    phase: state?.phase,
    grade: state?.grade,
    score: state?.score,
  };
}

export function revealZoom(fx, reduced) {
  if (!fx) return 1;
  const z = Number(fx.revealZoom) || 1;
  if (reduced) return Math.min(z, 1.04);
  return z;
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} fx
 * @param {{ sx: Function, sy: Function, px: Function, reducedMotion?: boolean }} view
 * @param {object} [state]
 */
export function drawFx(ctx, fx, view, state) {
  if (!fx) return;
  const reduced = !!view.reducedMotion;
  const sx = (x) => view.sx(x);
  const sy = (y) => view.sy(y);
  const px = (w) => view.px(w);

  for (const p of fx.steam) {
    const u = Math.max(0, Math.min(1, p.life / (p.max || 1)));
    const a = 0.08 + 0.18 * u;
    ctx.fillStyle = rgba("#f5f0e6", a);
    ctx.beginPath();
    ctx.ellipse(sx(p.x), sy(p.y), px(p.r * (1.1 + (1 - u) * 0.6)), px(p.r * 1.4 * (1.2 - 0.2 * u)), 0, 0, Math.PI * 2);
    ctx.fill();
  }

  if (fx.dailyAlpha > 0.04 && state?.showDailyLine !== false) {
    const text = dailyCondition(state?.params);
    const x = sx(BOWL_CX);
    const y = sy(BOWL_CY + 86 + 16);
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, fx.dailyAlpha));
    ctx.font = `700 ${Math.max(11, px(11))}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = rgba("#f5f0e6", 0.86);
    const padX = 8;
    const padY = 4;
    const h = Math.max(16, px(14));
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(x - tw / 2 - padX, y - h / 2 - padY, tw + padX * 2, h + padY * 2, 6);
    } else {
      ctx.rect(x - tw / 2 - padX, y - h / 2 - padY, tw + padX * 2, h + padY * 2);
    }
    ctx.fill();
    ctx.fillStyle = "#1c2430";
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  for (const f of fx.floats) {
    const dur = f.max || 1.6;
    const u = Math.max(0, Math.min(1, f.life / dur));
    const age = 1 - u;
    let pop = 1;
    if (!reduced) {
      if (age < 0.12) pop = 0.7 + 0.55 * (age / 0.12);
      else if (age < 0.22) pop = 1.25 - 0.25 * ((age - 0.12) / 0.1);
      else pop = 1;
    }
    const fade = age < 0.08 ? age / 0.08 : 1;
    const lift = reduced ? 0 : Math.min(8, age * 10);
    const x = sx(BOWL_CX);
    const y = sy(BOWL_CY) + px((f.yWu || BALLOON_Y) - lift);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(pop, pop);
    ctx.globalAlpha = fade;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const size = f.kind === "grade" ? Math.max(16, px(20)) : Math.max(13, px(15));
    ctx.font = `700 ${size}px ${FONT}`;
    const tw = ctx.measureText(f.text).width;
    ctx.fillStyle = rgba("#f5f0e6", 0.92);
    const padX = 8;
    const padY = 4;
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(-tw / 2 - padX, -size / 2 - padY, tw + padX * 2, size + padY * 2, 6);
    } else {
      ctx.rect(-tw / 2 - padX, -size / 2 - padY, tw + padX * 2, size + padY * 2);
    }
    ctx.fill();
    ctx.fillStyle = f.color || "#1c2430";
    ctx.fillText(f.text, 0, 0);
    ctx.restore();
  }
}

/**
 * そろっているときの茶の面のつや。碗の描画のあとに呼ぶ。
 */
export function drawSheen(ctx, view, fx, teaR) {
  if (!fx || fx.sheen < 0.04) return;
  const a = Math.max(0, Math.min(0.42, fx.sheen * 0.4));
  const x = view.sx(BOWL_CX);
  const y = view.sy(BOWL_CY);
  const r = view.px(teaR || 62);
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip();
  const g = ctx.createLinearGradient(x - r * 0.6, y - r * 0.7, x + r * 0.4, y + r * 0.2);
  g.addColorStop(0, rgba("#f4f7e8", a));
  g.addColorStop(0.35, rgba("#f4f7e8", a * 0.25));
  g.addColorStop(1, rgba("#f4f7e8", 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
}
