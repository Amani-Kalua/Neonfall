/* ============================================================
   NEONFALL — util.js
   Math, RNG, colour helpers. No dependencies.
   ============================================================ */
'use strict';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function invLerp(a, b, v) { return (v - a) / (b - a || 1); }
function smoothstep(t) { t = clamp01(t); return t * t * (3 - 2 * t); }
function smootherstep(t) { t = clamp01(t); return t * t * t * (t * (t * 6 - 15) + 10); }
function easeOut(t) { return 1 - Math.pow(1 - clamp01(t), 3); }
function sign(v) { return v < 0 ? -1 : 1; }
function wrapAngle(a) { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; }

/* deterministic PRNG — same seed always yields the same city */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* stable hash for grid coordinates, returns 0..1 */
function hash2(x, y, seed) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function hash1(x, seed) { return hash2(x, 9871, seed); }

/* value noise on a 1D line, smooth */
function noise1(x, seed) {
  const i = Math.floor(x), f = x - i;
  const a = hash1(i, seed), b = hash1(i + 1, seed);
  return lerp(a, b, smoothstep(f));
}

/* fractal 1D noise */
function fbm1(x, seed, oct) {
  let v = 0, amp = 0.5, fr = 1, norm = 0;
  for (let i = 0; i < (oct || 4); i++) {
    v += noise1(x * fr, seed + i * 77) * amp;
    norm += amp; amp *= 0.5; fr *= 2.03;
  }
  return v / norm;
}

function noise2(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = smoothstep(x - xi), yf = smoothstep(y - yi);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return lerp(lerp(a, b, xf), lerp(c, d, xf), yf);
}

/* pick from a weighted table: [[value, weight], ...] */
function pickWeighted(table, r) {
  let total = 0;
  for (let i = 0; i < table.length; i++) total += table[i][1];
  let t = r * total;
  for (let i = 0; i < table.length; i++) {
    t -= table[i][1];
    if (t <= 0) return table[i][0];
  }
  return table[table.length - 1][0];
}

function pick(arr, r) { return arr[Math.min(arr.length - 1, Math.floor(r * arr.length))]; }

/* ---------------- colour ---------------- */

function hexToRgb(hex) {
  if (typeof hex !== 'string') return hex;
  let h = hex.replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbStr(c, a) {
  if (a === undefined || a >= 1) return 'rgb(' + (c.r | 0) + ',' + (c.g | 0) + ',' + (c.b | 0) + ')';
  return 'rgba(' + (c.r | 0) + ',' + (c.g | 0) + ',' + (c.b | 0) + ',' + a.toFixed(3) + ')';
}

function mixRgb(a, b, t) {
  return { r: lerp(a.r, b.r, t), g: lerp(a.g, b.g, t), b: lerp(a.b, b.b, t) };
}

function scaleRgb(c, k) { return { r: clamp(c.r * k, 0, 255), g: clamp(c.g * k, 0, 255), b: clamp(c.b * k, 0, 255) }; }

function hsl(h, s, l) { return 'hsl(' + (h | 0) + ',' + (s | 0) + '%,' + (l | 0) + '%)'; }

/* hsl -> rgb object, h 0..360 s,l 0..1 */
function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  let r, g, b;
  if (s === 0) { r = g = b = l; }
  else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const f = (t) => {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    r = f(h + 1 / 3); g = f(h); b = f(h - 1 / 3);
  }
  return { r: r * 255, g: g * 255, b: b * 255 };
}

/* offscreen canvas helper */
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0);
  return c;
}

/* ---------------- safe storage ----------------
   localStorage throws outright in a few real situations — Safari on file://,
   private windows, and any browser with site data blocked. Never let that
   take the game down; just behave as if there were no saves. */
const Store = {
  ok: (function () {
    try {
      const k = '__nf_probe';
      window.localStorage.setItem(k, '1');
      window.localStorage.removeItem(k);
      return true;
    } catch (e) { return false; }
  })(),
  get(k) { try { return this.ok ? localStorage.getItem(k) : null; } catch (e) { return null; } },
  set(k, v) { try { if (this.ok) { localStorage.setItem(k, v); return true; } } catch (e) { } return false; },
  del(k) { try { if (this.ok) localStorage.removeItem(k); } catch (e) { } },
  json(k, fallback) {
    const raw = this.get(k);
    if (!raw) return fallback;
    try { const v = JSON.parse(raw); return v === null ? fallback : v; } catch (e) { return fallback; }
  }
};

function fmtTime(t) { // t in 0..24
  const hh = Math.floor(t) % 24;
  const mm = Math.floor((t - Math.floor(t)) * 60);
  return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
}
