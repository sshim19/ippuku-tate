/** dailyParams(rngState) → { params, rngState }. Idempotent daily bowl. */

import {
  MATCHA_TABLE,
  OMEGA_TARGET_MAX,
  OMEGA_TARGET_MIN,
  OMEGA_TOL_MAX,
  OMEGA_TOL_MIN,
  RATIO_TOL_MAX,
  RATIO_TOL_MIN,
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
 * Stream order: matcha stage → temp stage → ω_target → tempo_target → three tolerances.
 * ratio_target is tempo_target / ω_target.
 */
export function dailyParams(rngState) {
  let a = rngState >>> 0;
  let picked = pickRow(a, MATCHA_TABLE);
  a = picked.a;
  const matchaRow = picked.row;
  picked = pickRow(a, TEMP_TABLE);
  a = picked.a;
  const tempRow = picked.row;
  let r = rngRange(a, OMEGA_TARGET_MIN, OMEGA_TARGET_MAX);
  a = r.a;
  const omegaTarget = r.value;
  r = rngRange(a, TEMPO_TARGET_MIN, TEMPO_TARGET_MAX);
  a = r.a;
  const tempoTarget = r.value;
  r = rngRange(a, OMEGA_TOL_MIN, OMEGA_TOL_MAX);
  a = r.a;
  const omegaTol = r.value;
  r = rngRange(a, TEMPO_TOL_MIN, TEMPO_TOL_MAX);
  a = r.a;
  const tempoTol = r.value;
  r = rngRange(a, RATIO_TOL_MIN, RATIO_TOL_MAX);
  a = r.a;
  const ratioTol = r.value;
  return {
    params: {
      matcha: matchaRow.matcha,
      temp: tempRow.temp,
      matchaK: matchaRow.matchaK,
      tempK: tempRow.tempK,
      tempFineK: tempRow.tempFineK,
      tempBubbleK: tempRow.tempBubbleK,
      omegaTarget,
      tempoTarget,
      ratioTarget: tempoTarget / omegaTarget,
      omegaTol,
      tempoTol,
      ratioTol,
    },
    rngState: a,
  };
}
