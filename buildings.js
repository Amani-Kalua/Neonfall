/* ============================================================
   NEONFALL — buildings.js
   District grammars, silhouette generation, facade textures,
   and the textured-prism drawing routine.
   ============================================================ */
'use strict';

const FLOOR_H = 2.6;      // world units per floor (~metres)
const BAY_W = 2.1;       // world units per window bay
const PX_FLOOR = 4;        // texture px per floor
const PX_BAY = 5;        // texture px per bay

/* ---------------------------------------------------------------
   DISTRICTS
   Each entry defines silhouette language, palette and roof clutter.
   --------------------------------------------------------------- */
const DISTRICTS = {
  CENTRAL: {
    name: 'CENTRAL BD',
    tag: 'corporate spires · glass · cold light',
    base: '#0b0e13', baseTop: '#101620',
    win: ['#cfe1ff', '#9fc4ff', '#eaf3ff', '#7fe9ff'],
    winWeight: [5, 3, 2, 1.4],
    accent: ['#67e8ff', '#a8d8ff', '#ffffff'],
    litProb: 0.30, bandProb: 0.10, mullion: 0.55,
    h: [46, 132], fw: [8, 18], fd: [8, 18],
    variants: 5,
    roof: [['antenna', 4], ['spire', 3], ['helipad', 2], ['beacon', 4], ['vent', 2], ['dish', 2]],
    fillerH: [10, 40], glow: 0.9
  },
  LOWTOWN: {
    name: 'LOWTOWN',
    tag: 'dense · wet streets · sodium haze',
    base: '#120f0d', baseTop: '#1a1512',
    win: ['#ffb463', '#ff8a4a', '#ff5f52', '#ffe2a8', '#ff5ac8'],
    winWeight: [5, 3, 2, 2, 1],
    accent: ['#ff4a3d', '#ff9b3d', '#ff58c4', '#ffd35c'],
    litProb: 0.44, bandProb: 0.20, mullion: 0.25,
    h: [12, 46], fw: [9, 24], fd: [9, 24],
    variants: 5,
    roof: [['tank', 5], ['vent', 5], ['antenna', 3], ['sign', 4], ['clutter', 5], ['pipes', 4], ['laundry', 3]],
    fillerH: [6, 22], glow: 1.15
  },
  EDEN: {
    name: 'NEW EDEN',
    tag: 'arcologies · terraces · bio-light',
    base: '#0a1210', baseTop: '#0f1a17',
    win: ['#9dffd6', '#6ff0c8', '#dfffee', '#59d6ff'],
    winWeight: [4, 3, 2, 1.6],
    accent: ['#57ffbf', '#8effe0', '#3ad1a8'],
    litProb: 0.27, bandProb: 0.14, mullion: 0.40,
    h: [34, 104], fw: [11, 24], fd: [11, 24],
    variants: 5,
    roof: [['garden', 6], ['dome', 3], ['beacon', 3], ['antenna', 2], ['dish', 2], ['spire', 2]],
    fillerH: [10, 32], glow: 0.95
  },
  OMEGA: {
    name: 'OMEGA CORP.',
    tag: 'monolithic · brutal · violet cores',
    base: '#0d0a12', baseTop: '#150f1c',
    win: ['#ff6ad5', '#b07cff', '#e9d6ff', '#5f7bff'],
    winWeight: [4, 3, 2, 1.5],
    accent: ['#ff5ad0', '#9a5cff', '#ff2fa0'],
    litProb: 0.18, bandProb: 0.28, mullion: 0.15,
    h: [56, 150], fw: [14, 30], fd: [14, 30],
    variants: 5,
    roof: [['logo', 6], ['beacon', 4], ['antenna', 3], ['vent', 3], ['pylon', 4]],
    fillerH: [14, 46], glow: 1.0
  },
  ALPHA: {
    name: 'ALPHA CORP.',
    tag: 'ziggurats · crowns · amber cores',
    base: '#12100a', baseTop: '#1b1710',
    win: ['#ffcf7a', '#ffab4d', '#fff0cf', '#ff7d5c'],
    winWeight: [4, 3, 2, 1.5],
    accent: ['#ffb54a', '#ff8a2e', '#ffe08a'],
    litProb: 0.26, bandProb: 0.22, mullion: 0.35,
    h: [48, 140], fw: [13, 28], fd: [13, 28],
    variants: 5,
    roof: [['crown', 6], ['spire', 4], ['beacon', 3], ['helipad', 3], ['antenna', 2], ['pylon', 2]],
    fillerH: [12, 40], glow: 1.0
  }
};

const DISTRICT_KEYS = ['CENTRAL', 'LOWTOWN', 'EDEN', 'OMEGA', 'ALPHA'];

/* ---------------------------------------------------------------
   footprint polygons (local, centred, unrotated)
   --------------------------------------------------------------- */
function polyRect(w, d) {
  const x = w * 0.5, z = d * 0.5;
  return [-x, -z, x, -z, x, z, -x, z];
}
function polyNgon(n, w, d, rot) {
  const p = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * TAU;
    p.push(Math.cos(a) * w * 0.5, Math.sin(a) * d * 0.5);
  }
  return p;
}
function polyChamfer(w, d, c) {
  const x = w * 0.5, z = d * 0.5;
  c = Math.min(c, Math.min(x, z) * 0.8);
  return [-x + c, -z, x - c, -z, x, -z + c, x, z - c, x - c, z, -x + c, z, -x, z - c, -x, -z + c];
}
function scalePoly(p, sx, sz, ox, oz) {
  const o = new Array(p.length);
  for (let i = 0; i < p.length; i += 2) { o[i] = p[i] * sx + (ox || 0); o[i + 1] = p[i + 1] * sz + (oz || 0); }
  return o;
}

/* ---------------------------------------------------------------
   silhouette generation
   Returns { segs, h } where seg = {y0,y1,p0,p1,kind}
   --------------------------------------------------------------- */
function genSegments(dk, variant, seed, w, d, h) {
  const D = DISTRICTS[dk];
  const rnd = mulberry32(seed * 7919 + 13);
  const segs = [];
  const add = (y0, y1, p0, p1, kind) => { if (y1 > y0 + 0.2) segs.push({ y0: y0, y1: y1, p0: p0, p1: p1, kind: kind || 'body' }); };

  if (dk === 'CENTRAL') {
    if (variant === 0) { // slab tower + mech cap
      const base = polyRect(w, d);
      add(0, h * 0.97, base, scalePoly(base, 0.955, 0.955), 'body');
      const capP = scalePoly(base, 0.80, 0.80);
      add(h * 0.97, h * 1.02, capP, capP, 'mech');
    } else if (variant === 1) { // triple setback
      let p = polyRect(w, d), y = 0;
      const cuts = [0.52, 0.30, 0.18];
      for (let i = 0; i < 3; i++) {
        const y1 = y + h * cuts[i];
        const q = scalePoly(p, 0.87, 0.87);
        add(y, y1, p, i === 2 ? q : p, 'body');
        y = y1; p = q;
      }
      add(y, y + 4 + rnd() * 5, scalePoly(p, 0.55, 0.55), scalePoly(p, 0.42, 0.42), 'mech');
    } else if (variant === 2) { // twin blades
      const bw = w * 0.42, gap = w * 0.10;
      const off = bw * 0.5 + gap * 0.5;
      const h2 = h * (0.72 + rnd() * 0.22);
      add(0, h, scalePoly(polyRect(bw, d), 1, 1, -off, 0), scalePoly(polyRect(bw, d), 0.96, 0.96, -off, 0), 'body');
      add(0, h2, scalePoly(polyRect(bw, d), 1, 1, off, 0), scalePoly(polyRect(bw, d), 0.96, 0.96, off, 0), 'body');
      add(h * 0.42, h * 0.47, polyRect(w, d * 0.30), polyRect(w, d * 0.30), 'mech'); // link
    } else if (variant === 3) { // needle
      const p = polyNgon(8, w * 0.62, d * 0.62, 0.39);
      add(0, h * 0.9, p, scalePoly(p, 0.72, 0.72), 'body');
      add(h * 0.9, h * 1.14, scalePoly(p, 0.5, 0.5), scalePoly(p, 0.12, 0.12), 'spire');
    } else { // podium + tower
      const pd = polyRect(w * 1.35, d * 1.35);
      add(0, h * 0.16, pd, pd, 'podium');
      const t = polyChamfer(w * 0.86, d * 0.86, w * 0.16);
      add(h * 0.16, h, t, scalePoly(t, 0.9, 0.9), 'body');
    }
  } else if (dk === 'LOWTOWN') {
    if (variant === 0) { // squat block
      const p = polyRect(w, d);
      add(0, h, p, p, 'body');
    } else if (variant === 1) { // mismatched stack
      let y = 0, cw = w, cd = d;
      const n = 2 + Math.floor(rnd() * 3);
      for (let i = 0; i < n; i++) {
        const seg = h * (i === n - 1 ? 1 - y / h : (0.28 + rnd() * 0.24));
        const ox = (rnd() - 0.5) * cw * 0.24, oz = (rnd() - 0.5) * cd * 0.24;
        const p = scalePoly(polyRect(cw, cd), 1, 1, ox, oz);
        add(y, y + seg, p, p, 'body');
        y += seg; cw *= 0.78 + rnd() * 0.14; cd *= 0.78 + rnd() * 0.14;
        if (y > h * 0.98) break;
      }
    } else if (variant === 2) { // wide podium + small tower
      const pd = polyRect(w, d);
      add(0, h * 0.42, pd, pd, 'podium');
      const t = scalePoly(polyRect(w * 0.5, d * 0.5), 1, 1, (rnd() - 0.5) * w * 0.2, (rnd() - 0.5) * d * 0.2);
      add(h * 0.42, h, t, t, 'body');
    } else if (variant === 3) { // silo cluster
      const p = polyNgon(10, w * 0.6, d * 0.6, 0);
      add(0, h, p, p, 'body');
      const p2 = scalePoly(polyNgon(10, w * 0.34, d * 0.34, 0), 1, 1, w * 0.42, d * 0.2);
      add(0, h * 0.68, p2, p2, 'body');
    } else { // slanted terrace block
      const p = polyRect(w, d);
      add(0, h * 0.6, p, p, 'body');
      const q = scalePoly(polyRect(w * 0.7, d), 1, 1, -w * 0.14, 0);
      add(h * 0.6, h, q, q, 'body');
    }
  } else if (dk === 'EDEN') {
    if (variant === 0) { // octagonal taper
      const p = polyNgon(8, w, d, 0.39);
      add(0, h, p, scalePoly(p, 0.62, 0.62), 'body');
    } else if (variant === 1) { // terraced arcology
      let y = 0, s = 1;
      const n = 4;
      const p = polyNgon(8, w, d, 0.39);
      for (let i = 0; i < n; i++) {
        const y1 = y + h * (0.34 - i * 0.06);
        const ns = s * (0.80 - i * 0.03);
        add(y, y1, scalePoly(p, s, s), scalePoly(p, ns, ns), 'terrace');
        y = y1; s = ns;
        if (y > h * 0.99) break;
      }
    } else if (variant === 2) { // twin oct + bridge
      const p = polyNgon(8, w * 0.5, d * 0.5, 0.39);
      const off = w * 0.34;
      add(0, h, scalePoly(p, 1, 1, -off, 0), scalePoly(p, 0.7, 0.7, -off, 0), 'body');
      add(0, h * 0.82, scalePoly(p, 1, 1, off, 0), scalePoly(p, 0.7, 0.7, off, 0), 'body');
      const by = h * 0.55;
      add(by, by + 3.2, polyRect(off * 2, d * 0.16), polyRect(off * 2, d * 0.16), 'mech');
    } else if (variant === 3) { // dome-topped
      const p = polyNgon(12, w, d, 0);
      add(0, h * 0.78, p, scalePoly(p, 0.9, 0.9), 'body');
      let y = h * 0.78, s = 0.9;
      for (let i = 0; i < 4; i++) {
        const ns = s * Math.cos((i + 1) / 5 * 1.35);
        add(y, y + h * 0.055, scalePoly(p, s, s), scalePoly(p, ns, ns), 'dome');
        y += h * 0.055; s = ns;
      }
    } else { // vertical farm tower — banded
      const p = polyChamfer(w * 0.9, d * 0.9, w * 0.2);
      add(0, h, p, scalePoly(p, 0.82, 0.82), 'farm');
    }
  } else if (dk === 'OMEGA') {
    if (variant === 0) { // monolith
      const p = polyRect(w, d);
      add(0, h, p, scalePoly(p, 0.93, 0.93), 'mono');
    } else if (variant === 1) { // notched megablock
      const bw = w * 0.44, off = w * 0.28;
      add(0, h, scalePoly(polyRect(bw, d), 1, 1, -off, 0), scalePoly(polyRect(bw, d), 1, 1, -off, 0), 'mono');
      add(0, h * 0.94, scalePoly(polyRect(bw, d), 1, 1, off, 0), scalePoly(polyRect(bw, d), 1, 1, off, 0), 'mono');
      add(0, h * 0.34, polyRect(w, d * 0.82), polyRect(w, d * 0.82), 'podium');
      add(h * 0.72, h * 0.80, polyRect(w, d * 0.5), polyRect(w, d * 0.5), 'mech');
    } else if (variant === 2) { // inverted taper (wider up top)
      const p = polyRect(w * 0.72, d * 0.72);
      add(0, h, p, scalePoly(p, 1.42, 1.42), 'mono');
      const cap = scalePoly(p, 1.42, 1.42);
      add(h, h + 5, cap, scalePoly(cap, 0.86, 0.86), 'mech');
    } else if (variant === 3) { // slab + buttresses
      const p = polyRect(w, d * 0.6);
      add(0, h, p, p, 'mono');
      for (let i = -1; i <= 1; i += 2) {
        const b = scalePoly(polyRect(w * 0.16, d * 0.34), 1, 1, i * w * 0.36, d * 0.42);
        add(0, h * 0.66, b, b, 'body');
      }
    } else { // ziggurat mega
      let y = 0, s = 1;
      const p = polyRect(w, d);
      for (let i = 0; i < 3; i++) {
        const y1 = y + h * [0.5, 0.32, 0.18][i];
        const ns = s * 0.72;
        add(y, y1, scalePoly(p, s, s), scalePoly(p, s, s), 'mono');
        y = y1; s = ns;
      }
      add(y, y + 8, scalePoly(p, s * 0.5, s * 0.5), scalePoly(p, s * 0.3, s * 0.3), 'pylon');
    }
  } else { // ALPHA
    if (variant === 0) { // ziggurat
      let y = 0, s = 1;
      const p = polyRect(w, d);
      const steps = 5;
      for (let i = 0; i < steps; i++) {
        const y1 = y + h / steps;
        add(y, y1, scalePoly(p, s, s), scalePoly(p, s, s), 'body');
        y = y1; s *= 0.80;
      }
    } else if (variant === 1) { // tapered tower + crown
      const p = polyChamfer(w, d, w * 0.18);
      add(0, h * 0.9, p, scalePoly(p, 0.66, 0.66), 'body');
      const c = scalePoly(p, 0.72, 0.72);
      add(h * 0.9, h * 0.97, c, scalePoly(c, 1.16, 1.16), 'crown');
      add(h * 0.97, h * 1.20, scalePoly(c, 0.34, 0.34), scalePoly(c, 0.06, 0.06), 'spire');
    } else if (variant === 2) { // pyramid
      const p = polyRect(w, d);
      let y = 0, s = 1;
      for (let i = 0; i < 8; i++) {
        const ns = s * 0.84;
        add(y, y + h / 8, scalePoly(p, s, s), scalePoly(p, ns, ns), 'body');
        y += h / 8; s = ns;
      }
    } else if (variant === 3) { // flared top
      const p = polyNgon(6, w, d, 0.52);
      add(0, h * 0.72, p, scalePoly(p, 0.76, 0.76), 'body');
      add(h * 0.72, h, scalePoly(p, 0.76, 0.76), scalePoly(p, 1.10, 1.10), 'crown');
    } else { // twin ziggurat with atrium
      const p = polyRect(w * 0.4, d);
      add(0, h, scalePoly(p, 1, 1, -w * 0.3, 0), scalePoly(p, 0.8, 0.8, -w * 0.3, 0), 'body');
      add(0, h * 0.86, scalePoly(p, 1, 1, w * 0.3, 0), scalePoly(p, 0.8, 0.8, w * 0.3, 0), 'body');
      add(0, h * 0.22, polyRect(w, d * 0.9), polyRect(w, d * 0.9), 'podium');
    }
  }

  let top = 0;
  for (const s of segs) top = Math.max(top, s.y1);
  return { segs: segs, top: top };
}

/* ---------------------------------------------------------------
   facade textures
   --------------------------------------------------------------- */
const FACADE_CACHE = new Map();   // shared pool for filler buildings

function litBucket(v) { return Math.round(clamp01(v) * 4); }

function makeFacadeTex(dk, kind, cols, rows, seed, bucket) {
  const D = DISTRICTS[dk];
  const W = Math.max(2, cols * PX_BAY), H = Math.max(2, rows * PX_FLOOR);
  const body = makeCanvas(W, H), bx = body.getContext('2d');
  const lit = makeCanvas(W, H), lx = lit.getContext('2d');
  const rnd = mulberry32(seed * 2654435761 + bucket * 7 + 1);

  const base = hexToRgb(D.base), baseTop = hexToRgb(D.baseTop);
  const g = bx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, rgbStr(baseTop));
  g.addColorStop(1, rgbStr(base));
  bx.fillStyle = g; bx.fillRect(0, 0, W, H);

  // vertical mullion striping
  if (D.mullion > 0.05) {
    bx.fillStyle = 'rgba(255,255,255,' + (0.028 * D.mullion).toFixed(3) + ')';
    for (let c = 0; c < cols; c++) if (((c * 7 + seed) % 3) !== 0) bx.fillRect(c * PX_BAY, 0, 1, H);
  }
  // horizontal floor lines
  bx.fillStyle = 'rgba(0,0,0,0.30)';
  for (let r0 = 0; r0 < rows; r0++) bx.fillRect(0, r0 * PX_FLOOR + PX_FLOOR - 1, W, 1);

  // mechanical / dark bands
  const bandEvery = 5 + Math.floor(rnd() * 8);
  for (let r0 = 1; r0 < rows; r0++) {
    if (r0 % bandEvery === 0) {
      bx.fillStyle = 'rgba(0,0,0,0.45)';
      bx.fillRect(0, r0 * PX_FLOOR, W, PX_FLOOR);
    }
  }
  // grime / streaks
  for (let i = 0; i < cols * 0.7; i++) {
    const x = Math.floor(rnd() * cols) * PX_BAY;
    const y = Math.floor(rnd() * rows * 0.7) * PX_FLOOR;
    bx.fillStyle = 'rgba(0,0,0,' + (0.06 + rnd() * 0.12).toFixed(3) + ')';
    bx.fillRect(x, y, PX_BAY, (rows * PX_FLOOR - y) * (0.3 + rnd() * 0.7));
  }
  // podium/mono: fewer window openings, more solid
  const solid = (kind === 'mono' || kind === 'mech' || kind === 'crown' || kind === 'pylon' || kind === 'spire' || kind === 'dome');

  /* lit windows */
  const lb = clamp01(bucket / 4);
  const p = D.litProb * (0.06 + lb * 1.15) * (solid ? 0.35 : 1);
  const winTable = D.win.map((c, i) => [c, D.winWeight[i] || 1]);

  for (let r0 = 0; r0 < rows; r0++) {
    const isBand = (r0 % bandEvery === 0);
    // occasional fully-lit floor
    const fullFloor = !solid && rnd() < D.bandProb * lb * 0.5;
    for (let c = 0; c < cols; c++) {
      const hv = hash2(c, r0, seed);
      let on = fullFloor || hv < p;
      if (isBand) on = on && hv < p * 0.25;
      if (!on) continue;
      const col = hexToRgb(pickWeighted(winTable, hash2(c * 3 + 1, r0 * 5 + 7, seed + 99)));
      const a = 0.45 + hash2(c + 31, r0 + 17, seed + 5) * 0.55;
      // small pin-light windows, not full-bay panels
      const wx = c * PX_BAY + 1, wy = r0 * PX_FLOOR + 1;
      const ww = Math.max(1, PX_BAY - 3), wh = Math.max(1, PX_FLOOR - 2);
      lx.fillStyle = rgbStr(col, a);
      lx.fillRect(wx, wy, ww, wh);
      // a few very bright screens
      if (hash2(c + 5, r0 + 91, seed + 41) < 0.035 * lb) {
        lx.fillStyle = rgbStr(mixRgb(col, { r: 255, g: 255, b: 255 }, 0.7), 0.95);
        lx.fillRect(wx, wy, ww, wh);
      }
    }
  }
  // vertical neon strip on the facade
  if (!solid && rnd() < 0.30 * (0.3 + lb)) {
    const col = hexToRgb(pick(D.accent, rnd()));
    const x = Math.floor(rnd() * cols) * PX_BAY + 1;
    const y0 = Math.floor(rnd() * rows * 0.4) * PX_FLOOR;
    const y1 = y0 + Math.floor((rows - y0 / PX_FLOOR) * (0.4 + rnd() * 0.6)) * PX_FLOOR;
    lx.fillStyle = rgbStr(col, 0.85);
    lx.fillRect(x, y0, Math.max(1, PX_BAY - 3), y1 - y0);
  }
  // horizontal accent bands
  if (rnd() < 0.35 * (0.3 + lb)) {
    const col = hexToRgb(pick(D.accent, rnd()));
    const n = 1 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) {
      const y = Math.floor(rnd() * rows) * PX_FLOOR;
      lx.fillStyle = rgbStr(col, 0.6);
      lx.fillRect(0, y, W, 1);
    }
  }

  return { body: body, lit: lit, w: W, h: H, cols: cols, rows: rows, base: D.base };
}

function getFacade(dk, kind, cols, rows, seed, bucket, shared) {
  if (shared) {
    // quantise so filler buildings share a small pool of textures
    const qc = clamp(Math.round(cols / 2) * 2, 2, 16);
    const qr = clamp(Math.round(rows / 3) * 3, 3, 24);
    const key = dk + '|' + kind + '|' + qc + '|' + qr + '|' + (seed % 6) + '|' + bucket;
    let t = FACADE_CACHE.get(key);
    if (!t) { t = makeFacadeTex(dk, kind, qc, qr, seed % 6 + 1, bucket); FACADE_CACHE.set(key, t); }
    return t;
  }
  return makeFacadeTex(dk, kind, cols, rows, seed, bucket);
}

/* ---------------------------------------------------------------
   Building
   --------------------------------------------------------------- */
let _bid = 1;

class Building {
  constructor(o) {
    this.id = o.id || _bid++;
    this.dk = o.dk;
    this.x = o.x; this.z = o.z;
    this.rot = o.rot || 0;
    this.w = o.w; this.d = o.d; this.h = o.h;
    this.variant = o.variant || 0;
    this.seed = o.seed || ((Math.random() * 1e9) | 0);
    this.lights = o.lights === undefined ? 0.0 : o.lights;
    this.filler = !!o.filler;
    this.decos = o.decos || [];
    this.roofProps = null;
    this.segs = null;
    this._litBucket = -1;
    this.rebuild();
  }

  rebuild() {
    const g = genSegments(this.dk, this.variant, this.seed, this.w, this.d, this.h);
    this.segs = g.segs;
    this.top = g.top;
    this.bakeWorld();
    this.makeRoofProps();
    this._litBucket = -1;
    this.dirtyTex = true;
    // bounding radius for culling / picking
    let r = 0;
    for (const s of this.segs) {
      for (let i = 0; i < s.p0.length; i += 2) r = Math.max(r, Math.hypot(s.p0[i], s.p0[i + 1]));
      for (let i = 0; i < s.p1.length; i += 2) r = Math.max(r, Math.hypot(s.p1[i], s.p1[i + 1]));
    }
    this.radius = r;
  }

  bakeWorld() {
    const c = Math.cos(this.rot), s = Math.sin(this.rot);
    for (const sg of this.segs) {
      const n = sg.p0.length >> 1;
      sg.n = n;
      sg.b = new Float64Array(n * 3);  // bottom ring xyz
      sg.t = new Float64Array(n * 3);  // top ring xyz
      for (let i = 0; i < n; i++) {
        const x0 = sg.p0[i * 2], z0 = sg.p0[i * 2 + 1];
        const x1 = sg.p1[i * 2], z1 = sg.p1[i * 2 + 1];
        sg.b[i * 3] = this.x + x0 * c - z0 * s;
        sg.b[i * 3 + 1] = sg.y0;
        sg.b[i * 3 + 2] = this.z + x0 * s + z0 * c;
        sg.t[i * 3] = this.x + x1 * c - z1 * s;
        sg.t[i * 3 + 1] = sg.y1;
        sg.t[i * 3 + 2] = this.z + x1 * s + z1 * c;
      }
      // side widths for texture uv
      sg.sideW = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        sg.sideW[i] = Math.hypot(sg.b[j * 3] - sg.b[i * 3], sg.b[j * 3 + 2] - sg.b[i * 3 + 2]);
      }
      sg.maxSideW = Math.max.apply(null, Array.from(sg.sideW));
      sg.cx = this.x; sg.cz = this.z;
    }
  }

  ensureTex() {
    const bucket = litBucket(this.lights);
    if (!this.dirtyTex && bucket === this._litBucket) return;
    this._litBucket = bucket;
    this.dirtyTex = false;
    for (const sg of this.segs) {
      const cols = clamp(Math.round(sg.maxSideW / BAY_W), 2, 26);
      const rows = clamp(Math.round((sg.y1 - sg.y0) / FLOOR_H), 1, 60);
      sg.tex = getFacade(this.dk, sg.kind, cols, rows, this.seed + Math.round(sg.y0 * 3.7), bucket, this.filler);
    }
  }

  makeRoofProps() {
    const D = DISTRICTS[this.dk];
    const rnd = mulberry32(this.seed * 131 + 7);
    this.roofProps = [];
    if (this.filler) {
      if (rnd() < 0.4) {
        const y = this.top;
        this.roofProps.push({
          t: rnd() < 0.5 ? 'antenna' : 'vent', x: 0, z: 0, y: y,
          s: 0.5 + rnd() * 0.6, r: rnd() * TAU, ph: rnd() * TAU,
          col: pick(DISTRICTS[this.dk].accent, rnd())
        });
      }
      return;
    }
    const n = 1 + Math.floor(rnd() * 3);
    // find top segment footprint extent
    let topSeg = this.segs[0];
    for (const s of this.segs) if (s.y1 > topSeg.y1) topSeg = s;
    let ex = 0, ez = 0;
    for (let i = 0; i < topSeg.p1.length; i += 2) { ex = Math.max(ex, Math.abs(topSeg.p1[i])); ez = Math.max(ez, Math.abs(topSeg.p1[i + 1])); }
    for (let i = 0; i < n; i++) {
      const t = pickWeighted(D.roof, rnd());
      this.roofProps.push({
        t: t,
        x: (rnd() - 0.5) * ex * 1.2,
        z: (rnd() - 0.5) * ez * 1.2,
        y: topSeg.y1,
        s: 0.7 + rnd() * 0.9,
        r: rnd() * TAU,
        ph: rnd() * TAU,
        col: pick(D.accent, rnd())
      });
    }
  }

  /* world-space AABB test for picking: ray vs vertical cylinder then per-seg box */
  hitTest(ray) {
    // cylinder around building
    const ox = ray.ox - this.x, oz = ray.oz - this.z;
    const a = ray.dx * ray.dx + ray.dz * ray.dz;
    const b = 2 * (ox * ray.dx + oz * ray.dz);
    const R = this.radius * 1.02;
    const c = ox * ox + oz * oz - R * R;
    if (a < 1e-9) return null;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    const sq = Math.sqrt(disc);
    let t0 = (-b - sq) / (2 * a), t1 = (-b + sq) / (2 * a);
    if (t1 < 0) return null;
    // walk along the ray between t0..t1 looking for a point inside a segment
    const start = Math.max(t0, 0.01);
    const steps = 26;
    for (let i = 0; i <= steps; i++) {
      const t = start + (t1 - start) * (i / steps);
      const y = ray.oy + ray.dy * t;
      if (y < 0 || y > this.top + 1) continue;
      const px = ray.ox + ray.dx * t, pz = ray.oz + ray.dz * t;
      if (this.containsXZ(px, pz, y)) {
        return { t: t, y: y, frac: clamp01(y / Math.max(1, this.top)) };
      }
    }
    return null;
  }

  containsXZ(px, pz, y) {
    const c = Math.cos(-this.rot), s = Math.sin(-this.rot);
    const lx = (px - this.x) * c - (pz - this.z) * s;
    const lz = (px - this.x) * s + (pz - this.z) * c;
    for (const sg of this.segs) {
      if (y < sg.y0 - 0.3 || y > sg.y1 + 0.3) continue;
      const f = clamp01((y - sg.y0) / Math.max(0.01, sg.y1 - sg.y0));
      const n = sg.p0.length >> 1;
      // interpolated polygon at height y
      let inside = false;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const xi = lerp(sg.p0[i * 2], sg.p1[i * 2], f), zi = lerp(sg.p0[i * 2 + 1], sg.p1[i * 2 + 1], f);
        const xj = lerp(sg.p0[j * 2], sg.p1[j * 2], f), zj = lerp(sg.p0[j * 2 + 1], sg.p1[j * 2 + 1], f);
        if (((zi > lz) !== (zj > lz)) && (lx < (xj - xi) * (lz - zi) / (zj - zi + 1e-9) + xi)) inside = !inside;
      }
      if (inside) return true;
    }
    return false;
  }

  serialize() {
    return {
      dk: this.dk, x: +this.x.toFixed(2), z: +this.z.toFixed(2), rot: +this.rot.toFixed(3),
      w: +this.w.toFixed(2), d: +this.d.toFixed(2), h: +this.h.toFixed(2),
      variant: this.variant, seed: this.seed, lights: +this.lights.toFixed(2),
      decos: this.decos.map(d => d.serialize ? d.serialize() : d)
    };
  }
}

/* ---------------------------------------------------------------
   drawing
   --------------------------------------------------------------- */

const _cs = [];   // scratch camera-space points
for (let i = 0; i < 8; i++) _cs.push({ x: 0, y: 0, z: 0 });

function drawTexturedFace(r, bx, by, bz, tx, ty, tz, bx2, by2, bz2, tx2, ty2, tz2, tex, u0, u1, shade, r_, lightMul) {
  /* corners: (bx,by,bz)=bottom-left  (tx..)=top-left  (bx2..)=bottom-right (tx2..)=top-right */
  const cam = r_.cam, ctx = r_.ctx, gctx = r_.gctx, env = r_.env;
  const A = _cs[0], B = _cs[1], C = _cs[2], Dd = _cs[3];
  cam.toCam(tx, ty, tz, A);        // top-left
  cam.toCam(tx2, ty2, tz2, B);     // top-right
  cam.toCam(bx, by, bz, C);        // bottom-left
  cam.toCam(bx2, by2, bz2, Dd);    // bottom-right
  const near = 0.6;
  const behind = (A.z < near) || (B.z < near) || (C.z < near) || (Dd.z < near);

  // screen outline for clipping
  const poly = r_.screenPoly([
    { x: A.x, y: A.y, z: A.z }, { x: B.x, y: B.y, z: B.z },
    { x: Dd.x, y: Dd.y, z: Dd.z }, { x: C.x, y: C.y, z: C.z }
  ]);
  if (!poly) return;
  // quick offscreen reject
  let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
  for (const p of poly) { if (p.x < minx) minx = p.x; if (p.x > maxx) maxx = p.x; if (p.y < miny) miny = p.y; if (p.y > maxy) maxy = p.y; }
  if (maxx < -8 || minx > r_.w + 8 || maxy < -8 || miny > r_.h + 8) return;
  const areaW = maxx - minx, areaH = maxy - miny;
  if (areaW < 0.6 || areaH < 0.6) return;

  const fogTop = r_.fog(A.z, ty), fogBot = r_.fog(C.z, by);
  const baseCol = hexToRgb(tex.base || '#0b0e13');

  if (behind || areaW < 2.5 || areaH < 3.5 || r_.lowDetail) {
    // flat fill fallback
    ctx.save();
    r_.pathFrom(ctx, poly);
    const f = (fogTop + fogBot) * 0.5;
    ctx.fillStyle = rgbStr(mixRgb(scaleRgb(baseCol, shade), r_.fogRgb, clamp01(f)));
    ctx.fill();
    ctx.restore();
    occludeGlow(r_, poly);
    return;
  }

  // solid geometry must block the light of whatever sits behind it, otherwise
  // the additive emissive buffer makes the whole city look translucent
  occludeGlow(r_, poly);

  ctx.save();
  r_.pathFrom(ctx, poly);
  ctx.clip();

  const S = clamp(Math.ceil(areaH / 46 * (r_.stripScale || 1)), 1, 10);
  const texW = tex.w, texH = tex.h;
  const sx0 = u0 * texW, sw = Math.max(1, (u1 - u0) * texW);

  const useGlow = lightMul > 0.02;
  const glowScale = r_.glowScale;
  if (useGlow) { gctx.save(); }

  for (let i = 0; i < S; i++) {
    const v0 = i / S, v1 = (i + 1) / S;
    // 3D points (perspective-correct per strip)
    const aX = lerp(tx, bx, v0), aY = lerp(ty, by, v0), aZ = lerp(tz, bz, v0);
    const bX = lerp(tx2, bx2, v0), bY = lerp(ty2, by2, v0), bZ = lerp(tz2, bz2, v0);
    const cX = lerp(tx, bx, v1), cY = lerp(ty, by, v1), cZ = lerp(tz, bz, v1);
    const dX = lerp(tx2, bx2, v1), dY = lerp(ty2, by2, v1), dZ = lerp(tz2, bz2, v1);
    const Pa = cam.project(aX, aY, aZ, _pa);
    const Pb = cam.project(bX, bY, bZ, _pb);
    const Pc = cam.project(cX, cY, cZ, _pc);
    const Pd = cam.project(dX, dY, dZ, _pd);
    if (Pa.z < near || Pb.z < near || Pc.z < near || Pd.z < near) continue;

    const sy0 = v0 * texH, sh = Math.max(1, (v1 - v0) * texH);
    const ax = (Pb.x - Pa.x) / sw, ay = (Pb.y - Pa.y) / sw;
    const cx2 = (Pc.x - Pa.x) / sh, cy2 = (Pc.y - Pa.y) / sh;
    const e = Pa.x - ax * sx0 - cx2 * sy0;
    const f2 = Pa.y - ay * sx0 - cy2 * sy0;
    if (!isFinite(ax) || !isFinite(cy2)) continue;

    const zMid = (Pa.z + Pc.z) * 0.5;
    const yMid = (aY + cY) * 0.5;
    const fg = clamp01(r_.fog(zMid, yMid));

    // body
    ctx.setTransform(ax, ay, cx2, cy2, e, f2);
    ctx.globalAlpha = 1;
    try { ctx.drawImage(tex.body, sx0, sy0, sw, sh, sx0, sy0, sw, sh); } catch (err) { }
    // lit windows on main canvas
    if (lightMul > 0.02) {
      ctx.globalAlpha = clamp01((1 - fg) * lightMul * 0.80);
      try { ctx.drawImage(tex.lit, sx0, sy0, sw, sh, sx0, sy0, sw, sh); } catch (err) { }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // shade + fog wash over this strip
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.moveTo(Pa.x, Pa.y); ctx.lineTo(Pb.x, Pb.y); ctx.lineTo(Pd.x, Pd.y); ctx.lineTo(Pc.x, Pc.y); ctx.closePath();
    if (shade < 1) { ctx.fillStyle = 'rgba(0,0,0,' + (1 - shade).toFixed(3) + ')'; ctx.fill(); }
    if (fg > 0.004) { ctx.fillStyle = rgbStr(r_.fogRgb, fg); ctx.fill(); }

    // emissive
    if (useGlow) {
      gctx.setTransform(ax * glowScale, ay * glowScale, cx2 * glowScale, cy2 * glowScale, e * glowScale, f2 * glowScale);
      gctx.globalAlpha = clamp01((1 - fg) * lightMul * 0.34);
      gctx.globalCompositeOperation = 'lighter';
      try { gctx.drawImage(tex.lit, sx0, sy0, sw, sh, sx0, sy0, sw, sh); } catch (err) { }
    }
  }
  if (useGlow) { gctx.restore(); gctx.setTransform(glowScale, 0, 0, glowScale, 0, 0); gctx.globalCompositeOperation = 'lighter'; }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.restore();
}

const _pa = { x: 0, y: 0, z: 0 }, _pb = { x: 0, y: 0, z: 0 }, _pc = { x: 0, y: 0, z: 0 }, _pd = { x: 0, y: 0, z: 0 };

/* Paint an opaque-black silhouette into the emissive buffer so lights behind
   this surface stop shining through it. Black adds nothing under 'lighter'. */
function occludeGlow(r, screenPoly) {
  const gc = r.gctx;
  gc.globalCompositeOperation = 'source-over';
  gc.globalAlpha = 1;
  gc.fillStyle = '#000';
  gc.beginPath();
  gc.moveTo(screenPoly[0].x, screenPoly[0].y);
  for (let i = 1; i < screenPoly.length; i++) gc.lineTo(screenPoly[i].x, screenPoly[i].y);
  gc.closePath();
  gc.fill();
  gc.globalCompositeOperation = 'lighter';
}

/* draw one building: queues each segment by depth */
function drawBuilding(r, b, highlight) {
  const cam = r.cam;
  b.ensureTex();
  const D = DISTRICTS[b.dk];
  const lightMul = clamp01(b.lights) * (D.glow || 1) * r.env.windowGlow;

  for (let si = 0; si < b.segs.length; si++) {
    const sg = b.segs[si];
    const n = sg.n;
    const t = cam.toCam(sg.cx, (sg.y0 + sg.y1) * 0.5, sg.cz, r._tmpA);
    const depth = t.z;
    if (depth < -60) continue;
    r.push(depth, function (rr) {
      // sides, back-to-front by their own depth
      const order = [];
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const mx = (sg.b[i * 3] + sg.b[j * 3]) * 0.5;
        const mz = (sg.b[i * 3 + 2] + sg.b[j * 3 + 2]) * 0.5;
        // outward normal in XZ
        const ex = sg.b[j * 3] - sg.b[i * 3], ez = sg.b[j * 3 + 2] - sg.b[i * 3 + 2];
        let nx = ez, nz = -ex;
        const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
        const vx = mx - cam.px, vz = mz - cam.pz;
        const facing = (nx * vx + nz * vz);
        if (facing > 0) continue;   // back face
        const dd = cam.toCam(mx, (sg.y0 + sg.y1) * 0.5, mz, { x: 0, y: 0, z: 0 }).z;
        // light shading from sun azimuth
        const sd = rr.env.sunDir;
        const ndl = clamp01(-(nx * sd.x + nz * sd.z) * 0.5 + 0.5);
        const shade = 0.40 + 0.60 * (0.35 + 0.65 * ndl) * rr.env.ambient;
        order.push({ i: i, j: j, d: dd, shade: clamp01(shade) });
      }
      order.sort((a2, b2) => b2.d - a2.d);
      let uAcc = 0;
      for (const o of order) {
        const i = o.i, j = o.j;
        const tex = sg.tex;
        const cols = Math.max(1, Math.round(sg.sideW[i] / BAY_W));
        const u1 = clamp01(cols / tex.cols);
        drawTexturedFace(rr,
          sg.b[i * 3], sg.b[i * 3 + 1], sg.b[i * 3 + 2],
          sg.t[i * 3], sg.t[i * 3 + 1], sg.t[i * 3 + 2],
          sg.b[j * 3], sg.b[j * 3 + 1], sg.b[j * 3 + 2],
          sg.t[j * 3], sg.t[j * 3 + 1], sg.t[j * 3 + 2],
          tex, 0, u1, o.shade, rr, lightMul);
      }
      // roof cap
      const capCam = [];
      for (let i = 0; i < n; i++) capCam.push(cam.toCam(sg.t[i * 3], sg.t[i * 3 + 1], sg.t[i * 3 + 2], { x: 0, y: 0, z: 0 }));
      const cp = rr.screenPoly(capCam);
      if (cp) {
        const fg = clamp01(rr.fog(capCam[0].z, sg.y1));
        const roofCol = hexToRgb(DISTRICTS[b.dk].baseTop);
        rr.pathFrom(rr.ctx, cp);
        rr.ctx.fillStyle = rgbStr(mixRgb(scaleRgb(roofCol, 0.55 * rr.env.ambient + 0.14), rr.fogRgb, fg));
        rr.ctx.fill();
        occludeGlow(rr, cp);
        // roof edge neon
        if (b.lights > 0.45 && !b.filler && sg.kind !== 'spire' && hash1(b.seed + si * 7, 21) < 0.55) {
          const ac = hexToRgb(pick(DISTRICTS[b.dk].accent, hash1(b.seed + si, 3)));
          const a = clamp01((1 - fg) * (b.lights - 0.4) * 0.9) * rr.env.neonGlow;
          if (a > 0.02) {
            rr.ctx.strokeStyle = rgbStr(ac, a * 0.7);
            rr.ctx.lineWidth = Math.max(0.5, 0.9 * rr.scale);
            rr.ctx.stroke();
            const gc = rr.gctx;
            gc.strokeStyle = rgbStr(ac, a * 0.5);
            gc.lineWidth = Math.max(0.6, 1.2 * rr.scale);
            gc.beginPath();
            gc.moveTo(cp[0].x, cp[0].y);
            for (let k = 1; k < cp.length; k++) gc.lineTo(cp[k].x, cp[k].y);
            gc.closePath(); gc.stroke();
          }
        }
      }
    });
  }

  // roof props
  if (b.roofProps) {
    for (const p of b.roofProps) {
      const c = Math.cos(b.rot), s = Math.sin(b.rot);
      const wx = b.x + p.x * c - p.z * s, wz = b.z + p.x * s + p.z * c;
      const t = cam.toCam(wx, p.y, wz, r._tmpA);
      if (t.z < 0.5) continue;
      r.push(t.z - 0.4, function (rr) { drawRoofProp(rr, b, p, wx, wz); });
    }
  }
  // highlight ring
  if (highlight) {
    const t = cam.toCam(b.x, 0, b.z, r._tmpA);
    r.push(t.z - 900, function (rr) { drawSelectionRing(rr, b.x, b.z, b.radius * 1.25, highlight); });
  }
}
