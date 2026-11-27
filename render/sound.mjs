/**
 * Web Audio だけで鳴らす効果音。ファイルもライブラリも使わない。
 * エンジンは触らず、state の変化から鳴らす音を決める。落ち着いた音にする。
 */

import * as constants from "../engine/constants.mjs";

export const MUTE_KEY = constants.STORAGE_MUTED ?? "ippuku-tate:muted";
const MASTER_GAIN = 0.36;

function readMuted(storage) {
  if (!storage) return false;
  try {
    const v = storage.getItem(MUTE_KEY);
    return v === "1" || v === "true";
  } catch {
    return false;
  }
}

function writeMuted(muted, storage) {
  if (!storage) return;
  try {
    storage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    /* ignore quota / private mode */
  }
}

export function loadMuted(storage = globalThis.localStorage) {
  return readMuted(storage);
}

function snapshot(state) {
  return {
    status: state?.status || "title",
    phase: state?.phase || "pour",
    C: Number(state?.C) || 0,
    F: Number(state?.F) || 0,
    B: Number(state?.B) || 0,
    energy: Number(state?.energy) || 0,
    aligned: Number(state?.aligned) || 0,
    tempo: Number(state?.right?.tempo) || 0,
    steady: Number(state?.steady) || 0,
    grade: state?.grade ?? null,
    score: Math.max(0, Math.floor(Number(state?.score) || 0)),
  };
}

/**
 * 直前の snapshot と新しい state から、鳴らすべき単発の音を決める。純関数。
 * @returns {{ type: "pour"|"coarse"|"reveal", grade?: string, amount?: number } | null}
 */
export function soundEvent(prev, state) {
  if (!state) return null;
  const now = snapshot(state);
  const before = prev || { status: "idle", phase: "none", B: 0 };
  if (
    now.status === "playing" &&
    now.phase === "pour" &&
    (before.status !== "playing" || before.phase !== "pour")
  ) {
    return { type: "pour" };
  }
  if (before.phase !== "reveal" && now.phase === "reveal") {
    return { type: "reveal", grade: now.grade || "early", score: now.score };
  }
  if (before.status !== "over" && now.status === "over" && before.phase !== "reveal") {
    return { type: "reveal", grade: now.grade || "early", score: now.score };
  }
  if (now.status === "playing" && now.phase === "whisk" && now.B > (Number(before.B) || 0) + 0.03) {
    return { type: "coarse", amount: now.B - (Number(before.B) || 0) };
  }
  return null;
}

export function createSfx() {
  return {
    prev: null,
    muted: loadMuted(),
    ctx: null,
    master: null,
    compressor: null,
    noiseBuf: null,
    swishGain: null,
    swishFilter: null,
    swishSrc: null,
    sheenOsc: null,
    sheenGain: null,
    lastCoarseAt: 0,
  };
}

export function resetSfx(sfx) {
  if (!sfx) return;
  sfx.prev = null;
  sfx.lastCoarseAt = 0;
  stopLoops(sfx, true);
}

function applyMuteGain(sfx, now) {
  if (!sfx?.master || !sfx.ctx) return;
  const g = sfx.master.gain;
  const t = now ?? sfx.ctx.currentTime;
  g.cancelScheduledValues(t);
  g.setValueAtTime(g.value, t);
  g.linearRampToValueAtTime(sfx.muted ? 0 : MASTER_GAIN, t + 0.03);
}

export function setMuted(sfx, muted, storage = globalThis.localStorage) {
  if (!sfx) return;
  sfx.muted = !!muted;
  writeMuted(sfx.muted, storage);
  applyMuteGain(sfx);
}

export function isMuted(sfx) {
  return !!sfx?.muted;
}

/** 最初の操作で AudioContext を作り、iOS 向けに resume する。 */
export function unlockSfx(sfx) {
  if (!sfx) return;
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) return;
  try {
    if (!sfx.ctx) {
      const ctx = new AC();
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -16;
      compressor.knee.value = 12;
      compressor.ratio.value = 2.8;
      compressor.attack.value = 0.004;
      compressor.release.value = 0.18;
      const master = ctx.createGain();
      master.gain.value = sfx.muted ? 0 : MASTER_GAIN;
      master.connect(compressor);
      compressor.connect(ctx.destination);
      sfx.ctx = ctx;
      sfx.master = master;
      sfx.compressor = compressor;
    }
    if (sfx.ctx.state === "suspended") {
      const p = sfx.ctx.resume();
      if (p && typeof p.catch === "function") p.catch(() => {});
    }
  } catch {
    /* AudioContext unavailable */
  }
}

function noiseBuffer(sfx) {
  if (sfx.noiseBuf) return sfx.noiseBuf;
  const ctx = sfx.ctx;
  const len = Math.floor(ctx.sampleRate * 1.2);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    last = last * 0.92 + white * 0.08;
    data[i] = last * 2.2;
  }
  sfx.noiseBuf = buf;
  return buf;
}

function playTone(ctx, dest, { freq, type = "sine", t0, dur, peak, attack = 0.012, endFreq }) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (endFreq && endFreq !== freq) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t0 + dur);
  }
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(dest);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
  osc.onended = () => {
    try {
      osc.disconnect();
      g.disconnect();
    } catch {
      /* already gone */
    }
  };
}

function playNoise(sfx, dest, { t0, dur, peak, attack = 0.008, freq = 1200, type = "lowpass", q = 0.7, endFreq }) {
  const ctx = sfx.ctx;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(sfx);
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.setValueAtTime(freq, t0);
  if (endFreq) filter.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), t0 + dur);
  filter.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter);
  filter.connect(g);
  g.connect(dest);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
  src.onended = () => {
    try {
      src.disconnect();
      filter.disconnect();
      g.disconnect();
    } catch {
      /* already gone */
    }
  };
}

/** 短い、柔らかい湯の音。 */
function playPour(sfx) {
  const ctx = sfx.ctx;
  const dest = sfx.master;
  const t0 = ctx.currentTime + 0.01;
  playNoise(sfx, dest, {
    t0,
    dur: 0.55,
    peak: 0.11,
    attack: 0.06,
    freq: 1600,
    type: "bandpass",
    q: 0.7,
    endFreq: 700,
  });
  playTone(ctx, dest, {
    freq: 280,
    endFreq: 190,
    type: "sine",
    t0,
    dur: 0.4,
    peak: 0.035,
    attack: 0.05,
  });
}

/** 少しだけ水っぽい、低い音。粗い泡が増えるとき。 */
function playCoarse(sfx, ev) {
  const now = sfx.ctx.currentTime;
  if (now - (sfx.lastCoarseAt || 0) < 0.28) return;
  sfx.lastCoarseAt = now;
  const amount = Math.max(0.03, Math.min(0.2, Number(ev?.amount) || 0.05));
  playNoise(sfx, sfx.master, {
    t0: now + 0.002,
    dur: 0.14,
    peak: 0.04 + amount * 0.2,
    attack: 0.02,
    freq: 280,
    type: "lowpass",
    q: 0.6,
    endFreq: 140,
  });
  playTone(sfx.ctx, sfx.master, {
    freq: 140,
    endFreq: 90,
    type: "sine",
    t0: now + 0.004,
    dur: 0.16,
    peak: 0.03,
    attack: 0.02,
  });
}

/** 碗を置く短い音のあと、等級に応じた穏やかな余韻。 */
function playReveal(sfx, ev) {
  const ctx = sfx.ctx;
  const dest = sfx.master;
  const t0 = ctx.currentTime + 0.004;
  playTone(ctx, dest, {
    freq: 196,
    endFreq: 130,
    type: "sine",
    t0,
    dur: 0.16,
    peak: 0.08,
    attack: 0.006,
  });
  playNoise(sfx, dest, {
    t0,
    dur: 0.08,
    peak: 0.04,
    attack: 0.004,
    freq: 800,
    type: "lowpass",
    q: 0.6,
  });

  const grade = ev?.grade || "early";
  if (grade === "fine" || grade === "good") {
    const root = grade === "fine" ? 659 : 523;
    playTone(ctx, dest, {
      freq: root,
      type: "sine",
      t0: t0 + 0.08,
      dur: 0.42,
      peak: 0.09,
      attack: 0.02,
    });
    playTone(ctx, dest, {
      freq: root * 1.5,
      type: "sine",
      t0: t0 + 0.14,
      dur: 0.5,
      peak: 0.05,
      attack: 0.03,
    });
    if (grade === "fine") {
      playTone(ctx, dest, {
        freq: root * 2,
        type: "sine",
        t0: t0 + 0.2,
        dur: 0.46,
        peak: 0.035,
        attack: 0.04,
      });
    }
  } else if (grade === "close") {
    playTone(ctx, dest, {
      freq: 330,
      type: "sine",
      t0: t0 + 0.08,
      dur: 0.28,
      peak: 0.06,
      attack: 0.02,
    });
  } else {
    playNoise(sfx, dest, {
      t0: t0 + 0.06,
      dur: 0.12,
      peak: 0.045,
      attack: 0.01,
      freq: 420,
      type: "bandpass",
      q: 0.7,
      endFreq: 180,
    });
    playTone(ctx, dest, {
      freq: 170,
      endFreq: 96,
      type: "sine",
      t0: t0 + 0.06,
      dur: 0.14,
      peak: 0.04,
      attack: 0.012,
    });
  }
}

function ensureLoops(sfx) {
  if (!sfx.ctx || !sfx.master) return;
  if (sfx.swishSrc) return;
  const ctx = sfx.ctx;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(sfx);
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 1400;
  filter.Q.value = 0.8;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  src.connect(filter);
  filter.connect(gain);
  gain.connect(sfx.master);
  src.start();
  sfx.swishSrc = src;
  sfx.swishFilter = filter;
  sfx.swishGain = gain;

  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.value = 880;
  const sheen = ctx.createGain();
  sheen.gain.value = 0;
  osc.connect(sheen);
  sheen.connect(sfx.master);
  osc.start();
  sfx.sheenOsc = osc;
  sfx.sheenGain = sheen;
}

function stopLoops(sfx, hard = false) {
  if (!sfx) return;
  const t = sfx.ctx?.currentTime ?? 0;
  if (sfx.swishGain) {
    try {
      sfx.swishGain.gain.cancelScheduledValues(t);
      sfx.swishGain.gain.setTargetAtTime(0, t, 0.04);
    } catch {
      /* ignore */
    }
  }
  if (sfx.sheenGain) {
    try {
      sfx.sheenGain.gain.cancelScheduledValues(t);
      sfx.sheenGain.gain.setTargetAtTime(0, t, 0.05);
    } catch {
      /* ignore */
    }
  }
  if (!hard) return;
  try {
    sfx.swishSrc?.stop();
    sfx.swishSrc?.disconnect();
    sfx.swishFilter?.disconnect();
    sfx.swishGain?.disconnect();
  } catch {
    /* already gone */
  }
  try {
    sfx.sheenOsc?.stop();
    sfx.sheenOsc?.disconnect();
    sfx.sheenGain?.disconnect();
  } catch {
    /* already gone */
  }
  sfx.swishSrc = null;
  sfx.swishFilter = null;
  sfx.swishGain = null;
  sfx.sheenOsc = null;
  sfx.sheenGain = null;
}

function syncLoops(sfx, state) {
  if (!sfx.ctx || sfx.muted) {
    if (sfx.swishGain) stopLoops(sfx, false);
    return;
  }
  const playing = state?.status === "playing" && state?.phase === "whisk";
  const energy = Math.max(0, Math.min(1.2, Number(state?.energy) || 0));
  const aligned = Math.max(0, Math.min(1, Number(state?.aligned) || 0));
  const fine = Math.max(0, Math.min(1, Number(state?.F) || 0));
  const tempo = Math.max(0, Number(state?.right?.tempo) || 0);
  if (!playing || energy < 0.04) {
    if (sfx.swishGain) {
      const t = sfx.ctx.currentTime;
      sfx.swishGain.gain.setTargetAtTime(0, t, 0.08);
      if (sfx.sheenGain) sfx.sheenGain.gain.setTargetAtTime(0, t, 0.1);
    }
    return;
  }
  ensureLoops(sfx);
  const t = sfx.ctx.currentTime;
  const swish = 0.015 + energy * 0.055;
  sfx.swishGain.gain.setTargetAtTime(swish, t, 0.08);
  const freq = 900 + Math.min(1800, tempo * 180);
  sfx.swishFilter.frequency.setTargetAtTime(freq, t, 0.1);
  const sheenOn = aligned > 0.35 ? (aligned - 0.35) * (0.4 + 0.6 * fine) : 0;
  const sheenPeak = sheenOn * 0.028;
  sfx.sheenGain.gain.setTargetAtTime(sheenPeak, t, 0.12);
  const sheenFreq = 720 + fine * 520;
  sfx.sheenOsc.frequency.setTargetAtTime(sheenFreq, t, 0.16);
}

/**
 * state の差分を見て効果音を鳴らす。点て中の擦れはループで追従する。
 * @param {object} sfx
 * @param {object} state
 */
export function syncSound(sfx, state) {
  if (!sfx) return null;
  const ev = soundEvent(sfx.prev, state);
  sfx.prev = snapshot(state);
  if (sfx.ctx && !sfx.muted) {
    try {
      syncLoops(sfx, state);
      if (ev?.type === "pour") playPour(sfx);
      else if (ev?.type === "coarse") playCoarse(sfx, ev);
      else if (ev?.type === "reveal") {
        stopLoops(sfx, false);
        playReveal(sfx, ev);
      }
    } catch {
      /* audio graph failed; ignore */
    }
  } else if (ev?.type === "reveal") {
    stopLoops(sfx, false);
  }
  return ev;
}
