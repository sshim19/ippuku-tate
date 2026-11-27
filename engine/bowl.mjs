/**
 * Left hand: hold the bowl steady. The whisk pushes the bowl; a thumb on the rim
 * pins it, and moving the thumb moves the bowl (position control, not rate).
 * Pure functions, no DOM.
 */

import {
  BOWL_CX,
  BOWL_CY,
  BOWL_MAX_OFFSET,
  DRIFT_GAIN,
  DRIFT_MAX,
  FREE_RETURN,
  FREE_SLIDE,
  HOLD_R0,
  HOLD_R1,
  HOLD_RATE,
  HOLD_SLIP_R,
  PUSH_OSC,
  SETTLE_RATE,
  SPLASH_R,
  SPLASH_W,
  STEADY_DEAD,
  STEADY_TAU,
  STEADY_VEL_W,
  WHISK_SPEED_TAU,
  WHISK_VEL_TAU,
  clamp,
} from "./constants.mjs";

function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function emptyBowl() {
  return {
    x: 0, // offset from home, wu
    y: 0,
    vx: 0, // d' (wu/s), for drawing and steadiness
    vy: 0,
    held: false,
    grabX: 0, // thumb − bowl centre at grab
    grabY: 0,
    wvx: 0, // smoothed whisk finger velocity
    wvy: 0,
    wspeed: 0, // smoothed |whisk velocity|
    prevWX: null,
    prevWY: null,
    steady: 0, // 0–1 smoothed
    offset: 0, // |d|
  };
}

/** Is a point on the bowl's rim band (relative to the bowl's current centre)? */
export function onRim(bowl, x, y) {
  const r = Math.hypot(x - (BOWL_CX + bowl.x), y - (BOWL_CY + bowl.y));
  return r >= HOLD_R0 && r <= HOLD_R1;
}

/** Unit drift direction at whisk time t. Slowly swings around the daily angle. */
export function driftDir(params, t) {
  const period = Math.max(Number(params?.driftPeriod) || 9, 1);
  const ang =
    (Number(params?.driftAngle) || 0) +
    num(params?.driftSwing, 1) * Math.sin((2 * Math.PI * (Number(t) || 0)) / period + (Number(params?.driftPhase) || 0));
  return { x: Math.cos(ang), y: Math.sin(ang) };
}

/** Steadiness of one instant: 0 when not held. */
export function steadyInstant(bowl, params) {
  if (!bowl.held) return 0;
  const tol = Math.max(Number(params?.steadyTol) || 12, 1e-6);
  const err = Math.hypot(bowl.x, bowl.y) + STEADY_VEL_W * Math.hypot(bowl.vx, bowl.vy);
  return Math.max(0, 1 - Math.max(0, err - STEADY_DEAD) / tol);
}

/** 0–1. Whisking while the bowl is far from home slops tea over the rim. */
export function splashValue(bowl, whisking) {
  if (!whisking) return 0;
  return clamp((Math.hypot(bowl.x, bowl.y) - SPLASH_R) / SPLASH_W, 0, 1);
}

/**
 * One frame of the bowl.
 * @param bowl previous bowl
 * @param leftPos {x,y}|null  thumb (null when lifted / portrait)
 * @param rightPos {x,y}|null whisk finger
 * @param ctx { dt, params, whiskT, whisking }  whisking: in the whisk phase and landscape
 */
export function updateBowl(bowl, leftPos, rightPos, { dt, params, whiskT, whisking }) {
  const b = { ...bowl };
  const t = Math.max(0, Number(dt) || 0);
  if (!(t > 0)) return b;

  // Whisk finger velocity → push.
  let vxi = 0;
  let vyi = 0;
  if (rightPos && b.prevWX != null) {
    vxi = (rightPos.x - b.prevWX) / t;
    vyi = (rightPos.y - b.prevWY) / t;
  }
  b.prevWX = rightPos ? rightPos.x : null;
  b.prevWY = rightPos ? rightPos.y : null;
  const kv = 1 - Math.exp(-t / WHISK_VEL_TAU);
  b.wvx += (vxi - b.wvx) * kv;
  b.wvy += (vyi - b.wvy) * kv;
  const ks = 1 - Math.exp(-t / WHISK_SPEED_TAU);
  b.wspeed += (Math.hypot(vxi, vyi) - b.wspeed) * ks;

  // Thumb: grab on the rim band, slip off when too far.
  const cx = BOWL_CX + b.x;
  const cy = BOWL_CY + b.y;
  if (leftPos) {
    const r = Math.hypot(leftPos.x - cx, leftPos.y - cy);
    if (!b.held) {
      if (r >= HOLD_R0 && r <= HOLD_R1) {
        b.held = true;
        b.grabX = leftPos.x - cx;
        b.grabY = leftPos.y - cy;
      }
    } else if (r > HOLD_SLIP_R) {
      b.held = false;
    }
  } else {
    b.held = false;
  }

  const px = b.x;
  const py = b.y;
  if (!whisking) {
    // Pour / reveal: the bowl settles home on its own. A held thumb still leads it.
    const tx = b.held ? leftPos.x - b.grabX - BOWL_CX : 0;
    const ty = b.held ? leftPos.y - b.grabY - BOWL_CY : 0;
    const k = 1 - Math.exp(-t * SETTLE_RATE);
    b.x += (clamp(tx, -BOWL_MAX_OFFSET, BOWL_MAX_OFFSET) * (b.held ? 1 : 0) - b.x) * k;
    b.y += (clamp(ty, -BOWL_MAX_OFFSET, BOWL_MAX_OFFSET) * (b.held ? 1 : 0) - b.y) * k;
  } else {
    const pushK = num(params?.pushK, 1);
    const dir = driftDir(params, whiskT);
    // The steady push saturates: the bowl never asks the thumb to travel more than DRIFT_MAX.
    const drift = DRIFT_MAX * Math.tanh((DRIFT_GAIN * pushK * b.wspeed) / DRIFT_MAX);
    const ux = PUSH_OSC * pushK * b.wvx + drift * dir.x;
    const uy = PUSH_OSC * pushK * b.wvy + drift * dir.y;
    if (b.held) {
      const hx = leftPos.x - b.grabX - BOWL_CX;
      const hy = leftPos.y - b.grabY - BOWL_CY;
      const k = 1 - Math.exp(-t * HOLD_RATE);
      b.x += (hx + ux - b.x) * k;
      b.y += (hy + uy - b.y) * k;
    } else {
      b.x += (FREE_SLIDE * ux - FREE_RETURN * b.x) * t;
      b.y += (FREE_SLIDE * uy - FREE_RETURN * b.y) * t;
    }
  }
  const off = Math.hypot(b.x, b.y);
  if (off > BOWL_MAX_OFFSET) {
    b.x *= BOWL_MAX_OFFSET / off;
    b.y *= BOWL_MAX_OFFSET / off;
  }
  b.vx = (b.x - px) / t;
  b.vy = (b.y - py) / t;
  b.offset = Math.hypot(b.x, b.y);
  const inst = whisking ? steadyInstant(b, params) : b.held ? 1 : 0;
  const ka = 1 - Math.exp(-t / STEADY_TAU);
  b.steady += (inst - b.steady) * ka;
  return b;
}
