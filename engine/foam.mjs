/** dC/dF/dB, score, and grade. Pure and checkable. */

import {
  COVER_GATE_HI,
  COVER_GATE_LO,
  FOAM_B_ALIGN,
  FOAM_B_GAIN,
  FOAM_B_IDLE,
  FOAM_B_SPLASH,
  FOAM_C_GAIN,
  FOAM_C_IDLE,
  FOAM_F_ALIGN,
  FOAM_F_ALIGN_EXP,
  FOAM_F_ENERGY,
  FOAM_F_ENERGY_SCALE,
  FOAM_F_IDLE,
  FOAM_F_OVER,
  OVERSHOOT_ALIGN,
  OVERSPEED_MARGIN,
  OVERSPEED_MAX,
  clamp,
  gradeForScore,
} from "./constants.mjs";

export { gradeForScore };

export function smoothstep(x, a, b) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

/** 0 at C = 0.15, 1 at C = 0.45, smooth step in between. */
export function coverGate(C) {
  return smoothstep(C, COVER_GATE_LO, COVER_GATE_HI);
}

/** How far the whisk runs past tempo_target + 0.6·tol, in tolerances (0–1.5). */
export function overspeedValue(tempo, params) {
  const tTol = Math.max(Number(params?.tempoTol) || 0, 1e-6);
  const tThresh = (Number(params?.tempoTarget) || 0) + OVERSPEED_MARGIN * tTol;
  const t = Number(tempo) || 0;
  const v = t > tThresh ? (t - tThresh) / tTol : 0;
  return clamp(v, 0, OVERSPEED_MAX);
}

/**
 * The part of (1 − aligned) that sits below 0.25.
 * 0 when aligned ≥ 0.25; at most 0.25 when aligned is 0.
 */
export function overshootValue(aligned) {
  const a = Number(aligned) || 0;
  return Math.max(0, OVERSHOOT_ALIGN - a);
}

export function foamRates({ C, F, B, energy, aligned, overspeed, splash = 0, idle, params }) {
  const matchaK = Math.max(Number(params?.matchaK) || 1, 1e-6);
  const tempK = Number(params?.tempK) || 1;
  const tempFineK = Number(params?.tempFineK) || 1;
  const tempBubbleK = Number(params?.tempBubbleK) || 1;
  const idleN = idle ? 1 : 0;
  const gate = coverGate(C);
  const overshoot = overshootValue(aligned);
  const a = Math.max(Number(aligned) || 0, 0);
  const e = Number(energy) || 0;
  const os = Number(overspeed) || 0;
  const dC = (FOAM_C_GAIN / matchaK) * tempK * e - FOAM_C_IDLE * idleN;
  const dF =
    (FOAM_F_ALIGN * Math.pow(a, FOAM_F_ALIGN_EXP) + FOAM_F_ENERGY * e * FOAM_F_ENERGY_SCALE) *
      tempFineK *
      gate -
    FOAM_F_OVER * overshoot * F -
    FOAM_F_IDLE * idleN * F;
  const sp = clamp(Number(splash) || 0, 0, 1);
  const dB =
    (FOAM_B_GAIN * os + FOAM_B_SPLASH * sp) * tempBubbleK - FOAM_B_ALIGN * a * B - FOAM_B_IDLE * idleN * B;
  return { dC, dF, dB, overshoot, coverGate: gate };
}

export function stepFoam({ C, F, B }, dt, ctx) {
  const r = foamRates({ C, F, B, ...ctx });
  const t = Number(dt) || 0;
  return {
    C: clamp(C + r.dC * t, 0, 1),
    F: clamp(F + r.dF * t, 0, 1),
    B: clamp(B + r.dB * t, 0, 1),
  };
}

export function computeScore(C, F, B) {
  const c = clamp(C, 0, 1);
  const f = clamp(F, 0, 1);
  const b = clamp(B, 0, 1);
  return Math.round(100 * c * (0.2 + 0.8 * f) * (1 - 0.55 * b));
}
