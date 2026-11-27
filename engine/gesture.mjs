/** Whisk positions → tempo, pathQ; with bowl steadiness → energy, aligned. No drawing. */

import {
  ALIGN_TEMPO_MIN,
  AMP_MAX,
  AMP_MIN,
  AMP_PEAK,
  AMP_WEIGHT,
  AXIS_ALIGN_DEG,
  AXIS_WEIGHT,
  CIRCLE_PATHQ_MAX,
  PATHQ_LOW,
  PATHQ_MIN_STROKES,
  REV_INTERVAL_MAX,
  REV_INTERVAL_MIN,
  SAMPLE_MAX,
  SAMPLE_WINDOW,
  STABLE_WEIGHT,
  STROKE_MIN_PATH,
  TEMPO_DECAY_TAU,
  TEMPO_SMOOTH_TAU,
  VERTICAL_ONLY_DX,
  VERTICAL_ONLY_PATHQ_MAX,
  WIDTH_MAX,
  WIDTH_MIN,
  WIDTH_PEAK,
  WIDTH_WEIGHT,
  clamp,
} from "./constants.mjs";

export function bump(x, t, tol) {
  const w = Number(tol) || 0;
  const d = Math.abs((Number(x) || 0) - (Number(t) || 0));
  if (!(w > 0)) return d === 0 ? 1 : 0;
  return Math.max(0, 1 - d / w);
}

function mean(xs) {
  if (!xs.length) return 0;
  let s = 0;
  for (const v of xs) s += v;
  return s / xs.length;
}

function variance(xs) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  let s = 0;
  for (const v of xs) {
    const d = v - m;
    s += d * d;
  }
  return s / xs.length;
}

function stddev(xs) {
  return Math.sqrt(variance(xs));
}

function decayTowardZero(value, dt, tau) {
  return (Number(value) || 0) * Math.exp(-dt / tau);
}

export function emptyRight() {
  return {
    samples: [],
    prevX: null,
    prevY: null,
    prevAxisV: null,
    lastRevT: null,
    lastRevX: null,
    tempo: 0,
    pathQ: 0,
    revs: [],
    pathSinceRev: 0,
    origin: null,
    axis: "y",
  };
}

function pruneWindow(list, now, window) {
  const t0 = now - window;
  let i = 0;
  while (i < list.length && list[i].t < t0 - 1e-12) i += 1;
  return i ? list.slice(i) : list;
}

function trimToMax(list, max) {
  if (list.length <= max) return list;
  return list.slice(list.length - max);
}

function mainAxis(samples) {
  if (samples.length < 3) return "y";
  // Use motion energy (sum of squared steps), not variance of steps.
  // A straight slash has constant deltas, so variance is ~0 on both axes.
  let sx = 0;
  let sy = 0;
  for (let i = 1; i < samples.length; i++) {
    const dx = samples[i].x - samples[i - 1].x;
    const dy = samples[i].y - samples[i - 1].y;
    sx += dx * dx;
    sy += dy * dy;
  }
  // Prefer vertical when the two are close.
  if (sy >= sx * 0.75) return "y";
  return "x";
}

function axisCoord(p, axis) {
  return axis === "x" ? p.x : p.y;
}

function angleFromVertical(samples) {
  if (samples.length < 3) return 0;
  let mx = 0;
  let my = 0;
  for (const p of samples) {
    mx += p.x;
    my += p.y;
  }
  mx /= samples.length;
  my /= samples.length;
  let cxx = 0;
  let cyy = 0;
  let cxy = 0;
  for (const p of samples) {
    const dx = p.x - mx;
    const dy = p.y - my;
    cxx += dx * dx;
    cyy += dy * dy;
    cxy += dx * dy;
  }
  const theta = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
  return Math.abs(Math.PI / 2 - Math.abs(theta));
}

function ampScore(amp) {
  if (amp < AMP_MIN || amp > AMP_MAX) return 0;
  // "52wu 付近が 1": a small band around the peak stays at 1.
  const band = 8;
  if (Math.abs(amp - AMP_PEAK) <= band) return 1;
  if (amp < AMP_PEAK) return (amp - AMP_MIN) / (AMP_PEAK - band - AMP_MIN);
  return (AMP_MAX - amp) / (AMP_MAX - (AMP_PEAK + band));
}

function widthShape(mag) {
  // In the design's 12–70wu band the score stays high; 40wu is the peak.
  if (mag >= 18 && mag <= 55) return 1;
  if (mag >= WIDTH_MIN && mag < 18) return 0.75 + 0.25 * ((mag - WIDTH_MIN) / (18 - WIDTH_MIN));
  if (mag > 55 && mag <= WIDTH_MAX) return 0.75 + 0.25 * ((WIDTH_MAX - mag) / (WIDTH_MAX - 55));
  if (mag < WIDTH_MIN) return clamp(mag / WIDTH_MIN, 0, 1) * 0.4;
  const over = mag - WIDTH_MAX;
  return clamp(1 - over / WIDTH_MAX, 0, 1) * 0.4;
}

function isCirclePath(samples) {
  if (samples.length < 12) return false;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of samples) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const w = maxX - minX;
  const h = maxY - minY;
  if (w < 20 || h < 20) return false;
  const aspect = w / h;
  if (aspect < 0.7 || aspect > 1 / 0.7) return false;
  let pos = 0;
  let neg = 0;
  for (let i = 0; i < samples.length - 2; i++) {
    const x0 = samples[i].x;
    const y0 = samples[i].y;
    const x1 = samples[i + 1].x;
    const y1 = samples[i + 1].y;
    const x2 = samples[i + 2].x;
    const y2 = samples[i + 2].y;
    const c = (x1 - x0) * (y2 - y1) - (y1 - y0) * (x2 - x1);
    if (c > 1e-6) pos += 1;
    else if (c < -1e-6) neg += 1;
  }
  const total = pos + neg;
  if (total < 8) return false;
  return Math.max(pos, neg) / total >= 0.85;
}

function pathQuality(samples, strokes, axis = "y") {
  if (strokes.length < PATHQ_MIN_STROKES + 1) {
    return Math.min(PATHQ_LOW, 0.12);
  }
  const amps = [];
  const dxs = [];
  const intervals = [];
  for (let i = 1; i < strokes.length; i++) {
    const a = strokes[i - 1];
    const b = strokes[i];
    const dy = Math.abs((b.y ?? 0) - (a.y ?? 0));
    const dx = Math.abs((b.x ?? 0) - (a.x ?? 0));
    amps.push(axis === "x" ? dx : dy);
    dxs.push(b.x - a.x);
    intervals.push(Math.max(1e-6, b.t - a.t));
  }
  const ampS = ampScore(mean(amps));
  const mags = dxs.map(Math.abs);
  const meanDx = mean(mags);
  const xs = strokes.map((p) => p.x);
  const midX = mean(xs);
  const hasLeft = xs.some((x) => x < midX - 4);
  const hasRight = xs.some((x) => x > midX + 4);
  const sideFactor = hasLeft && hasRight ? 1 : 0.85;
  const widthS = widthShape(meanDx) * sideFactor;
  const fromV = angleFromVertical(samples);
  const lim = (AXIS_ALIGN_DEG * Math.PI) / 180;
  let axisS;
  if (fromV <= lim) axisS = 1;
  else axisS = clamp(1 - (fromV - lim) / (Math.PI / 2 - lim), 0, 1);
  const cv = mean(intervals) > 0 ? stddev(intervals) / mean(intervals) : 1;
  const stableS = clamp(1 - cv / 0.5, 0, 1);
  let q = AMP_WEIGHT * ampS + WIDTH_WEIGHT * widthS + AXIS_WEIGHT * axisS + STABLE_WEIGHT * stableS;
  if (meanDx < VERTICAL_ONLY_DX) q = Math.min(q, VERTICAL_ONLY_PATHQ_MAX);
  if (isCirclePath(samples)) q = Math.min(q, CIRCLE_PATHQ_MAX);
  return clamp(q, 0, 1);
}

function tempoFromRevs(revs, now, origin) {
  const events = [];
  // The start of a valid first stroke is the missing "previous reversal" so a
  // steady 4/s W reports ~4/s as soon as the first turn lands, not only after two.
  if (origin && now - origin.t <= SAMPLE_WINDOW + 1e-9) events.push(origin);
  for (const r of revs) {
    if (!events.length || r.t - events[events.length - 1].t > 1e-9) events.push(r);
  }
  const recent = pruneWindow(events, now, SAMPLE_WINDOW);
  if (recent.length < 2) return 0;
  const span = recent[recent.length - 1].t - recent[0].t;
  if (!(span > 1e-6)) return 0;
  // Rate from event span, not a raw count / 0.80 (that jitters 3.75–5.0 for a steady 4/s).
  return (recent.length - 1) / span;
}

/**
 * Update whisk tracking. tempo is reversals / second.
 * Taps shorter than 32wu are not strokes. Circles clamp pathQ.
 */
export function updateRight(right, pos, dt, now, active) {
  const next = {
    ...right,
    samples: right.samples.map((p) => ({ ...p })),
    revs: (right.revs || []).map((p) => ({ ...p })),
    origin: right.origin ? { ...right.origin } : null,
  };
  if (!active || !pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) {
    next.tempo = decayTowardZero(next.tempo, dt, TEMPO_DECAY_TAU);
    next.pathQ = decayTowardZero(next.pathQ, dt, TEMPO_DECAY_TAU);
    next.prevAxisV = null;
    if (dt > 0) {
      next.samples = pruneWindow(next.samples, now, SAMPLE_WINDOW);
      next.revs = pruneWindow(next.revs, now, SAMPLE_WINDOW);
    }
    return next;
  }

  if (next.prevX != null && next.prevY != null) {
    next.pathSinceRev = (Number(next.pathSinceRev) || 0) + Math.hypot(pos.x - next.prevX, pos.y - next.prevY);
  } else if (!next.origin) {
    next.origin = { t: now, x: pos.x, y: pos.y };
    next.pathSinceRev = 0;
  }

  next.samples.push({ t: now, x: pos.x, y: pos.y });
  next.samples = trimToMax(pruneWindow(next.samples, now, SAMPLE_WINDOW), SAMPLE_MAX);

  const axis = mainAxis(next.samples);
  next.axis = axis;
  let axisV = next.prevAxisV;
  if (next.prevX != null && next.prevY != null && dt > 0) {
    const prev = { x: next.prevX, y: next.prevY };
    const cur = { x: pos.x, y: pos.y };
    axisV = (axisCoord(cur, axis) - axisCoord(prev, axis)) / dt;
  }

  const prevV = next.prevAxisV;
  const axisChanged = right.axis && right.axis !== axis;
  if (!axisChanged && prevV != null && axisV != null && dt > 0) {
    const signFlipped = prevV !== 0 && axisV !== 0 && Math.sign(prevV) !== Math.sign(axisV);
    // A frame that lands on the peak can have a near-zero new velocity; the incoming speed is enough.
    const bigEnough = Math.abs(prevV) > 8;
    let interval = next.lastRevT == null ? null : now - next.lastRevT;
    if (interval != null && interval > REV_INTERVAL_MAX) {
      // A pause or a missed turn should start a new stroke, not lock the hand out.
      interval = null;
      next.lastRevT = null;
      next.lastRevX = null;
    }
    const intervalOk =
      interval == null
        ? true
        : interval >= REV_INTERVAL_MIN && interval <= REV_INTERVAL_MAX;
    if (signFlipped && bigEnough && (Number(next.pathSinceRev) || 0) >= STROKE_MIN_PATH && intervalOk) {
      // The turn happened between the previous sample (still going the old way)
      // and this one. Recording the previous point keeps amplitude close to the peak.
      const prev = next.samples.length >= 2 ? next.samples[next.samples.length - 2] : null;
      const rev = prev
        ? { t: prev.t, x: prev.x, y: prev.y }
        : { t: now, x: pos.x, y: pos.y };
      next.revs.push(rev);
      next.lastRevT = rev.t;
      next.lastRevX = rev.x;
      next.pathSinceRev = Math.hypot(pos.x - rev.x, pos.y - rev.y);
    }
  }

  next.revs = pruneWindow(next.revs, now, SAMPLE_WINDOW + REV_INTERVAL_MAX);
  next.prevX = pos.x;
  next.prevY = pos.y;
  // Keep the incoming velocity if this frame sat on a peak (near-zero v), so the next
  // frame can still see a sign change against the approach.
  if (axisV != null && Math.abs(axisV) < 8 && prevV != null && Math.abs(prevV) > 8) {
    next.prevAxisV = prevV;
  } else {
    next.prevAxisV = axisV;
  }

  const tempoInst = tempoFromRevs(next.revs, now, next.origin);
  if (dt > 0) {
    const a = 1 - Math.exp(-dt / TEMPO_SMOOTH_TAU);
    next.tempo += (tempoInst - next.tempo) * a;
  }

  const strokePts = [];
  const originInWindow = next.origin && now - next.origin.t <= SAMPLE_WINDOW + 1e-9;
  if (originInWindow && (next.revs.length === 0 || next.origin.t <= next.revs[0].t + 1e-9)) {
    strokePts.push(next.origin);
  }
  for (const r of pruneWindow(next.revs, now, SAMPLE_WINDOW + REV_INTERVAL_MAX)) strokePts.push(r);
  next.pathQ = pathQuality(next.samples, strokePts, axis);
  return next;
}

/**
 * aligned = steady × bump(tempo) × pathQ. Needs both hands: the thumb holding the bowl
 * and a whisk at ≥ 1 reversal/s. energy (cover) only depends on the whisk.
 */
export function computeAlignment(steady, tempo, pathQ, params, handsOn) {
  const energy =
    (Number(pathQ) || 0) *
    clamp((Number(tempo) || 0) / Math.max(Number(params?.tempoTarget) || 0, 0.1), 0, 1.2);
  const alignSteady = clamp(Number(steady) || 0, 0, 1);
  const alignTempo = bump(tempo, params?.tempoTarget, params?.tempoTol) * (Number(pathQ) || 0);
  let aligned = 0;
  if (handsOn && (Number(tempo) || 0) >= ALIGN_TEMPO_MIN) {
    aligned = alignSteady * alignTempo;
  }
  return { aligned, energy, alignSteady, alignTempo };
}
