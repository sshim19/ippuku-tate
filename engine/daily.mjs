/** dailyParams(rngState) → { params, rngState }. Idempotent daily bowl. */

import {
  DRIFT_PERIOD_MAX,
  DRIFT_PERIOD_MIN,
  DRIFT_SWING_MAX,
  DRIFT_SWING_MIN,
  MATCHA_TABLE,
  PUSH_K_MAX,
  PUSH_K_MIN,
  STEADY_TOL_MAX,
  STEADY_TOL_MIN,
  TEMP_TABLE,
  TEMPO_TARGET_MAX,
  TEMPO_TARGET_MIN,
  TEMPO_TOL_MAX,
  TEMPO_TOL_MIN,
} from "./constants.mjs";
import { rngRange, rngStep } from "./rng.mjs";

function pickRow(a, table) {
  const step = rngStep(a);
  const i = Math.min(table.length - 1, Math.floor(step.value * table.length));
  return { row: table[i], a: step.a };
}

/**
 * Stream order: matcha stage → temp stage → driftAngle → tempo_target → steadyTol →
 * tempoTol → pushK → driftPeriod → driftPhase → driftSwing.
 */
export function dailyParams(rngState) {
  let a = rngState >>> 0;
  let picked = pickRow(a, MATCHA_TABLE);
  a = picked.a;
  const matchaRow = picked.row;
  picked = pickRow(a, TEMP_TABLE);
  a = picked.a;
  const tempRow = picked.row;
  const draw = (lo, hi) => {
    const r = rngRange(a, lo, hi);
    a = r.a;
    return r.value;
  };
  const driftAngle = draw(0, 2 * Math.PI);
  const tempoTarget = draw(TEMPO_TARGET_MIN, TEMPO_TARGET_MAX);
  const steadyTol = draw(STEADY_TOL_MIN, STEADY_TOL_MAX);
  const tempoTol = draw(TEMPO_TOL_MIN, TEMPO_TOL_MAX);
  const pushK = draw(PUSH_K_MIN, PUSH_K_MAX);
  const driftPeriod = draw(DRIFT_PERIOD_MIN, DRIFT_PERIOD_MAX);
  const driftPhase = draw(0, 2 * Math.PI);
  const driftSwing = draw(DRIFT_SWING_MIN, DRIFT_SWING_MAX);
  return {
    params: {
      matcha: matchaRow.matcha,
      temp: tempRow.temp,
      matchaK: matchaRow.matchaK,
      tempK: tempRow.tempK,
      tempFineK: tempRow.tempFineK,
      tempBubbleK: tempRow.tempBubbleK,
      tempoTarget,
      tempoTol,
      steadyTol,
      pushK,
      driftAngle,
      driftPeriod,
      driftPhase,
      driftSwing,
    },
    rngState: a,
  };
}
