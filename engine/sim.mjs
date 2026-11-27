/** tick(state, input, dt) → state. Pour, whisk, reveal, serve. No DOM. */

import {
  DAILY_LINE_TIME,
  FIXED_DT,
  MAX_DT,
  POUR_TIME,
  REVEAL_TIME,
  SERVE_MIN,
  WHISK_TIME,
} from "./constants.mjs";
import { dailyParams } from "./daily.mjs";
import { computeScore, gradeForScore, overspeedValue, stepFoam } from "./foam.mjs";
import { emptyBowl, splashValue, updateBowl } from "./bowl.mjs";
import { computeAlignment, emptyRight, updateRight } from "./gesture.mjs";
import { hashSeed } from "./rng.mjs";

export { computeScore, gradeForScore };

function cloneState(s) {
  return {
    ...s,
    params: { ...s.params },
    bowl: { ...s.bowl },
    right: {
      ...s.right,
      samples: (s.right.samples || []).map((p) => ({ ...p })),
      revs: (s.right.revs || []).map((p) => ({ ...p })),
      origin: s.right.origin ? { ...s.right.origin } : null,
    },
  };
}

function handsActive(input) {
  return { left: !!input?.left?.active, right: !!input?.right?.active };
}

function refreshAlignment(s, input) {
  const hands = handsActive(input);
  const handsOn = hands.left && hands.right && !!s.bowl.held;
  const a = computeAlignment(s.bowl.steady, s.right.tempo, s.right.pathQ, s.params, handsOn);
  s.aligned = a.aligned;
  s.energy = a.energy;
  s.steady = s.bowl.held ? s.bowl.steady : 0;
  s.overspeed = overspeedValue(s.right.tempo, s.params);
  s.splash = splashValue(s.bowl, s.phase === "whisk" && hands.right && s.energy > 0.2);
}

function finitePos(p) {
  const x = Number(p?.x);
  const y = Number(p?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function applyGestures(s, input, dt, now, active) {
  const leftPos = active && input?.left?.active ? finitePos(input.left) : null;
  const rightPos = active && input?.right?.active ? finitePos(input.right) : null;
  const prevRevs = (s.right.revs || []).length;
  s.right = updateRight(s.right, rightPos, dt, now, !!rightPos);
  s.bowl = updateBowl(s.bowl, leftPos, rightPos, {
    dt,
    params: s.params,
    whiskT: s.whiskT,
    whisking: active && s.phase === "whisk",
  });
  if (s.bowl.held) s.hintLeft = false;
  if ((s.right.revs || []).length > prevRevs) s.hintRight = false;
  refreshAlignment(s, active ? input : { left: { active: false }, right: { active: false } });
}

function updateBests(s) {
  if (s.score <= 0) return;
  if (s.score > s.bestScore) s.bestScore = s.score;
  if (s.score > s.todayBestScore) s.todayBestScore = s.score;
}

function finalizeServe(s) {
  s.score = computeScore(s.C, s.F, s.B);
  s.grade = gradeForScore(s.score);
  s.servedAt = s.whiskT;
  s.phase = "reveal";
  s.phaseT = 0;
  s.showDailyLine = false;
  updateBests(s);
}

function canServe(s) {
  return s.status === "playing" && s.phase === "whisk" && s.whiskT + 1e-9 >= SERVE_MIN;
}

function stepPhase(s, input, dt) {
  if (s.status !== "playing") return;
  if (s.phase === "pour") {
    s.phaseT += dt;
    if (s.phaseT + 1e-9 >= POUR_TIME) {
      s.phaseT = Math.max(0, s.phaseT - POUR_TIME);
      s.phase = "whisk";
      s.whiskT = 0;
      s.showDailyLine = true;
    }
    return;
  }
  if (s.phase === "whisk") {
    const idle = !input?.left?.active && !input?.right?.active;
    const foam = stepFoam(
      { C: s.C, F: s.F, B: s.B },
      dt,
      { energy: s.energy, aligned: s.aligned, overspeed: s.overspeed, splash: s.splash, idle, params: s.params },
    );
    s.C = foam.C;
    s.F = foam.F;
    s.B = foam.B;
    s.whiskT += dt;
    s.phaseT += dt;
    s.showDailyLine = s.whiskT < DAILY_LINE_TIME;
    if (s.whiskT + 1e-9 >= WHISK_TIME) {
      s.whiskT = WHISK_TIME;
      finalizeServe(s);
    } else if (input?.serve && canServe(s)) {
      finalizeServe(s);
    }
    return;
  }
  if (s.phase === "reveal") {
    s.phaseT += dt;
    if (s.phaseT + 1e-9 >= REVEAL_TIME) s.status = "over";
  }
}

/**
 * Near-pure: same state+input+dt → same result. Does not mutate state or input.
 * Clamps dt to 50ms and steps foam / phases at 1/60 + remainder.
 * Gestures are applied once per call with the frame dt (positions are samples, not per-substep).
 * When landscape is false, whisk / serve are ignored and time does not advance; tempo decays and the thumb lets go.
 */
export function tick(state, input, dt) {
  if (state.status !== "playing") return cloneState(state);
  const s = cloneState(state);
  const rawDt = Math.min(Math.max(Number(dt) || 0, 0), MAX_DT);
  if (!input?.landscape) {
    applyGestures(s, input, rawDt, s.clock || 0, false);
    return s;
  }
  s.clock = (Number(s.clock) || 0) + rawDt;
  applyGestures(s, input, rawDt, s.clock, true);
  let left = rawDt;
  while (left > 0 && s.status === "playing") {
    const stepDt = Math.min(FIXED_DT, left);
    stepPhase(s, input, stepDt);
    left -= stepDt;
  }
  return s;
}

/**
 * Shared by 「出す」 and the time limit. No-op before 20s, during pour / reveal, or when not playing.
 * Landscape is enforced by tick; a direct call assumes the caller already checked orientation.
 */
export function serveNow(state) {
  const s = cloneState(state);
  if (canServe(s)) finalizeServe(s);
  return s;
}

/** Fresh playing state. bestScore / todayBestScore are in-memory; persist elsewhere. */
export function createInitialState({ seed, dateJst, bestScore = 0, todayBestScore = 0 } = {}) {
  const rng0 = hashSeed(seed);
  const built = dailyParams(rng0);
  return {
    status: "playing",
    phase: "pour",
    seed,
    dateJst: dateJst ?? null,
    phaseT: 0,
    whiskT: 0,
    clock: 0,
    rngState: built.rngState,
    params: built.params,
    bowl: emptyBowl(),
    right: emptyRight(),
    aligned: 0,
    energy: 0,
    steady: 0,
    overspeed: 0,
    splash: 0,
    C: 0,
    F: 0,
    B: 0,
    score: 0,
    grade: null,
    servedAt: null,
    bestScore: bestScore || 0,
    todayBestScore: todayBestScore || 0,
    hintLeft: true,
    hintRight: true,
    showDailyLine: false,
  };
}
