/** Dimensions, zones, time constants, foam coefficients, grades, and storage keys. Y is down. */

export const VIEW_W = 640;
export const VIEW_H = 360;

export const LEFT_X0 = 0;
export const LEFT_X1 = 300;
export const LEFT_Y0 = 36;
export const LEFT_Y1 = 360;

export const RIGHT_X0 = 340;
export const RIGHT_X1 = 640;
export const RIGHT_Y0 = 36;
export const RIGHT_Y1 = 360;
/** After assignment only: play.mjs may keep the right pointer this far past the edge. */
export const RIGHT_EDGE_SLACK = 20;

export const BOWL_CX = 208;
export const BOWL_CY = 196;
export const BOWL_VISUAL_R = 86;

/** Spin weight: 0 at 44, 1 on 56–108, 0 at 128; outside 128 decays. */
export const SPIN_R0 = 44;
export const SPIN_R1 = 56;
export const SPIN_R2 = 108;
export const SPIN_R3 = 128;

export const POUR_TIME = 1.6;
export const WHISK_TIME = 75;
export const SERVE_MIN = 20;
export const REVEAL_TIME = 1.6;
export const DAILY_LINE_TIME = 2.5;
export const FIXED_DT = 1 / 60;
export const MAX_DT = 0.05;

export const OMEGA_SMOOTH_TAU = 0.12;
export const OMEGA_DECAY_TAU = 0.2;
export const TEMPO_SMOOTH_TAU = 0.15;
export const TEMPO_DECAY_TAU = 0.2;

export const SAMPLE_WINDOW = 0.8;
export const SAMPLE_MAX = 48;
export const STROKE_MIN_PATH = 32;
export const REV_INTERVAL_MIN = 0.07;
export const REV_INTERVAL_MAX = 0.55;

export const PATHQ_MIN_STROKES = 2;
export const PATHQ_LOW = 0.15;
export const CIRCLE_PATHQ_MAX = 0.2;
export const VERTICAL_ONLY_PATHQ_MAX = 0.65;
export const VERTICAL_ONLY_DX = 12;

export const AMP_MIN = 32;
export const AMP_PEAK = 52;
export const AMP_MAX = 96;
export const AMP_WEIGHT = 0.35;

export const WIDTH_MIN = 12;
export const WIDTH_PEAK = 40;
export const WIDTH_MAX = 70;
export const WIDTH_WEIGHT = 0.3;

export const AXIS_ALIGN_DEG = 32;
export const AXIS_WEIGHT = 0.2;
export const STABLE_WEIGHT = 0.15;

export const ALIGN_OMEGA_MIN = 0.15;
export const ALIGN_TEMPO_MIN = 1.0;
export const RATIO_OMEGA_FLOOR = 0.05;

export const FOAM_C_GAIN = 0.022;
export const FOAM_C_IDLE = 0.004;
export const FOAM_F_ALIGN = 0.024;
export const FOAM_F_ALIGN_EXP = 1.2;
export const FOAM_F_ENERGY = 0.01;
export const FOAM_F_ENERGY_SCALE = 0.25;
export const FOAM_F_OVER = 0.02;
export const FOAM_F_IDLE = 0.012;
/** Tuned from 0.035 so a 1.35×-tempo novice does not fill B in 20s (see DESIGN.md §3). */
export const FOAM_B_GAIN = 0.012;
export const FOAM_B_ALIGN = 0.018;
export const FOAM_B_IDLE = 0.01;
export const COVER_GATE_LO = 0.15;
export const COVER_GATE_HI = 0.45;
export const OVERSPEED_MARGIN = 0.6;
export const OVERSPEED_MAX = 1.5;
export const OVERSHOOT_ALIGN = 0.25;

export const SCORE_FINE = 88;
export const SCORE_GOOD = 72;
export const SCORE_CLOSE = 55;
export const SCORE_COARSE = 32;

export const JUDGE_BALLOON_OFFSET = 70;

export const STORAGE_BEST = "ippuku-tate:bestScore";
export const STORAGE_DAILY_PREFIX = "ippuku-tate:daily:";
export const STORAGE_MUTED = "ippuku-tate:muted";
export const SEED_PREFIX = "ippuku-tate:";

export const OMEGA_TARGET_MIN = 0.45;
export const OMEGA_TARGET_MAX = 0.85;
export const TEMPO_TARGET_MIN = 3.0;
export const TEMPO_TARGET_MAX = 5.2;
export const OMEGA_TOL_MIN = 0.22;
export const OMEGA_TOL_MAX = 0.32;
export const TEMPO_TOL_MIN = 0.7;
export const TEMPO_TOL_MAX = 1.0;
export const RATIO_TOL_MIN = 0.55;
export const RATIO_TOL_MAX = 0.8;

export const MATCHA_TABLE = [
  { matcha: "light", matchaK: 0.82 },
  { matcha: "normal", matchaK: 1.0 },
  { matcha: "heavy", matchaK: 1.22 },
];

export const TEMP_TABLE = [
  { temp: "cool", tempK: 0.82, tempFineK: 1.1, tempBubbleK: 0.7 },
  { temp: "normal", tempK: 1.0, tempFineK: 1.0, tempBubbleK: 1.0 },
  { temp: "hot", tempK: 1.22, tempFineK: 0.88, tempBubbleK: 1.4 },
];

export const MATCHA_LABELS = { light: "軽め", normal: "ふつう", heavy: "多め" };
export const TEMP_LABELS = { cool: "ぬるめ", normal: "ふつう", hot: "熱め" };

export const GRADE_LABELS = {
  fine: "きめ細かい泡",
  good: "よい泡",
  close: "おしい泡",
  coarse: "粗い泡",
  early: "まだ早い",
};

export const GRADE_BALLOONS = {
  fine: "きめ細かい！",
  good: "よい泡",
  close: "おしい",
  coarse: "粗い",
  early: "まだ早い",
};

export function seedString(dateJst) {
  return SEED_PREFIX + dateJst;
}

export function dailyKey(dateJst) {
  return STORAGE_DAILY_PREFIX + dateJst;
}

export function gradeForScore(score) {
  const s = Number(score) || 0;
  if (s >= SCORE_FINE) return "fine";
  if (s >= SCORE_GOOD) return "good";
  if (s >= SCORE_CLOSE) return "close";
  if (s >= SCORE_COARSE) return "coarse";
  return "early";
}

export function clamp(x, lo, hi) {
  const n = Number(x);
  if (!Number.isFinite(n)) return lo;
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}

export function spinWeight(r) {
  const x = Number(r) || 0;
  if (x <= SPIN_R0 || x >= SPIN_R3) return 0;
  if (x < SPIN_R1) return (x - SPIN_R0) / (SPIN_R1 - SPIN_R0);
  if (x <= SPIN_R2) return 1;
  return (SPIN_R3 - x) / (SPIN_R3 - SPIN_R2);
}
