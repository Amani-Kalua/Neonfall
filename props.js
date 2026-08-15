/* ============================================================
   NEONFALL — props.js
   Roof clutter, decorations (billboards / holograms / signs /
   airships / searchlights), traffic, selection gizmos.
   ============================================================ */
'use strict';

/* ---------- small 3D drawing helpers ---------- */

function P3(r, x, y, z) { return r.cam.project(x, y, z, {}); }

function quad3(r, pts, fill, glowCol, glowA) {
  const cam = r.cam;
  const cp = [];
  for (let i = 0; i < pts.length; i += 3) cp.push(cam.toCam(pts[i], pts[i + 1], pts[i + 2], { x: 0, y: 0, z: 0 }));
  const sp = r.screenPoly(cp);
  if (!sp) return null;
  let zAvg = 0, yAvg = 0;
  for (let i = 0; i < cp.length; i++) zAvg += cp[i].z;
  zAvg /= cp.length;
  for (let i = 1; i < pts.length; i += 3) yAvg += pts[i];
  yAvg /= (pts.length / 3);
  const fg = clamp01(r.fog(zAvg, yAvg));
  if (fill) {
    r.pathFrom(r.ctx, sp);
    r.ctx.fillStyle = rgbStr(mixRgb(hexToRgb(fill), r.fogRgb, fg));
    r.ctx.fill();
  }
  if (glowCol && glowA > 0.01) {
    const a = clamp01(glowA * (1 - fg));
    r.pathFrom(r.ctx, sp);
    r.ctx.fillStyle = rgbStr(hexToRgb(glowCol), a * 0.9);
    r.ctx.fill();
    const gc = r.gctx;
    gc.beginPath();
    gc.moveTo(sp[0].x, sp[0].y);
    for (let k = 1; k < sp.length; k++) gc.lineTo(sp[k].x, sp[k].y);
    gc.closePath();
    gc.fillStyle = rgbStr(hexToRgb(glowCol), a);
    gc.fill();
  }
  return { sp: sp, fog: fg, z: zAvg };
}

function line3(r, x0, y0, z0, x1, y1, z1, col, wpx, glow) {
  const cam = r.cam;
  const NEAR = 0.5;
  const a = cam.toCam(x0, y0, z0, { x: 0, y: 0, z: 0 });
  const b = cam.toCam(x1, y1, z1, { x: 0, y: 0, z: 0 });
  if (a.z < NEAR && b.z < NEAR) return;
  let ca = a, cb = b;
  if (a.z < NEAR) {
    const t = (NEAR - a.z) / (b.z - a.z);
    ca = { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: NEAR };
  } else if (b.z < NEAR) {
    const t = (NEAR - b.z) / (a.z - b.z);
    cb = { x: lerp(b.x, a.x, t), y: lerp(b.y, a.y, t), z: NEAR };
  }
  const pa = cam.toScreen(ca, {});
  const pb = cam.toScreen(cb, {});
  const fg = clamp01(r.fog((a.z + b.z) * 0.5, (y0 + y1) * 0.5));
  const c = hexToRgb(col);
  const ctx = r.ctx;
  // thin structural lines out with depth so distant masts don't read as
  // crisp foreground strokes against the haze
  const wAdj = wpx * clamp(1 - fg * 0.62, 0.34, 1);
  ctx.strokeStyle = rgbStr(glow ? c : mixRgb(c, r.fogRgb, fg), glow ? clamp01(1 - fg) : 1);
  ctx.lineWidth = Math.max(0.4, wAdj * r.scale);
  ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
  if (glow) {
    const gc = r.gctx;
    gc.strokeStyle = rgbStr(c, clamp01((1 - fg) * 0.9));
    gc.lineWidth = Math.max(0.6, wAdj * 1.4 * r.scale);
    gc.beginPath(); gc.moveTo(pa.x, pa.y); gc.lineTo(pb.x, pb.y); gc.stroke();
  }
}

/* solid extruded box helper (small props) */
function box3(r, cx, cy, cz, w, h, d, rot, col, shade) {
  const c = Math.cos(rot || 0), s = Math.sin(rot || 0);
  const hw = w * 0.5, hd = d * 0.5;
  const corner = (sx, sz) => [cx + (sx * hw) * c - (sz * hd) * s, cz + (sx * hw) * s + (sz * hd) * c];
  const c0 = corner(-1, -1), c1 = corner(1, -1), c2 = corner(1, 1), c3 = corner(-1, 1);
  const ring = [c0, c1, c2, c3];
  const base = hexToRgb(col);
  // sides
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    const mx = (ring[i][0] + ring[j][0]) * 0.5, mz = (ring[i][1] + ring[j][1]) * 0.5;
    const ex = ring[j][0] - ring[i][0], ez = ring[j][1] - ring[i][1];
    let nx = ez, nz = -ex; const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
    if (nx * (mx - r.cam.px) + nz * (mz - r.cam.pz) > 0) continue;
    const sh = (shade === undefined ? 1 : shade) * (0.55 + 0.45 * clamp01(-(nx * r.env.sunDir.x + nz * r.env.sunDir.z) * 0.5 + 0.5));
    quad3(r, [ring[i][0], cy, ring[i][1], ring[j][0], cy, ring[j][1], ring[j][0], cy + h, ring[j][1], ring[i][0], cy + h, ring[i][1]],
      rgbToHex(scaleRgb(base, sh)));
  }
  quad3(r, [c0[0], cy + h, c0[1], c1[0], cy + h, c1[1], c2[0], cy + h, c2[1], c3[0], cy + h, c3[1]], rgbToHex(scaleRgb(base, 1.15)));
}

function rgbToHex(c) {
  const f = (v) => ('0' + Math.round(clamp(v, 0, 255)).toString(16)).slice(-2);
  return '#' + f(c.r) + f(c.g) + f(c.b);
}

/* ---------- roof props ---------- */

function drawRoofProp(r, b, p, wx, wz) {
  const D = DISTRICTS[b.dk];
  const s = p.s, y = p.y;
  const dark = '#0a0c10';
  const lit = b.lights;
  const t = r.env.time;
  switch (p.t) {
    case 'antenna': {
      const hh = 6 + s * 12;
      line3(r, wx, y, wz, wx, y + hh, wz, dark, 1.6, false);
      for (let i = 1; i <= 3; i++) {
        const yy = y + hh * (i / 4);
        const ww = 1.6 * s * (1 - i / 5);
        line3(r, wx - ww, yy, wz, wx + ww, yy, wz, dark, 1.1, false);
      }
      const bl = 0.5 + 0.5 * Math.sin(t * 2.2 + p.ph);
      blinker(r, wx, y + hh, wz, '#ff3b30', 0.16 + bl * 0.34, 1.9 * s);
      break;
    }
    case 'spire': {
      const hh = 10 + s * 24;
      line3(r, wx, y, wz, wx, y + hh, wz, dark, 2.2, false);
      if (lit > 0.2) line3(r, wx, y, wz, wx, y + hh, wz, p.col, 0.7, true);
      blinker(r, wx, y + hh, wz, '#ff4a3a', 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 1.7 + p.ph)), 2.6 * s);
      break;
    }
    case 'beacon': {
      const bl = 0.5 + 0.5 * Math.sin(t * 3.0 + p.ph);
      blinker(r, wx, y + 1.4 * s, wz, p.col, 0.35 + bl * 0.65, 3.0 * s);
      break;
    }
    case 'helipad': {
      const rad = 3.2 * s + 1.5;
      ring3(r, wx, y + 0.25, wz, rad, '#c8ccd4', 0.25 + lit * 0.3, false);
      const n = 10;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + t * 0.5;
        const bl = (Math.sin(t * 4 - i * 0.6) > 0.4) ? 1 : 0.15;
        blinker(r, wx + Math.cos(a) * rad, y + 0.4, wz + Math.sin(a) * rad, '#ffe08a', 0.25 * bl + lit * 0.25 * bl, 1.4);
      }
      break;
    }
    case 'vent':
      box3(r, wx, y, wz, 2.6 * s, 2.0 * s, 2.6 * s, p.r, dark, 0.9);
      break;
    case 'dish': {
      ring3(r, wx, y + 2.2 * s, wz, 2.4 * s, '#1a1e26', 0.9, false);
      line3(r, wx, y, wz, wx, y + 2.2 * s, wz, dark, 1.6, false);
      break;
    }
    case 'tank': {
      const rad = 2.0 * s;
      // legs
      for (let i = 0; i < 4; i++) {
        const a = i / 4 * TAU + 0.4;
        line3(r, wx + Math.cos(a) * rad * 0.8, y, wz + Math.sin(a) * rad * 0.8, wx + Math.cos(a) * rad * 0.8, y + 2.4 * s, wz + Math.sin(a) * rad * 0.8, dark, 1.2, false);
      }
      cyl3(r, wx, y + 2.4 * s, wz, rad, 3.0 * s, '#171310');
      break;
    }
    case 'pipes': {
      for (let i = 0; i < 3; i++) {
        const ox = (i - 1) * 1.5 * s;
        line3(r, wx + ox, y, wz, wx + ox, y + (3 + i * 1.6) * s, wz, dark, 1.8, false);
      }
      break;
    }
    case 'clutter': {
      const rnd = mulberry32(b.seed + Math.round(p.x * 13 + p.z * 7));
      for (let i = 0; i < 4; i++) {
        box3(r, wx + (rnd() - 0.5) * 5 * s, y, wz + (rnd() - 0.5) * 5 * s, (0.9 + rnd()) * s, (0.8 + rnd() * 1.6) * s, (0.9 + rnd()) * s, rnd() * 3, dark, 0.85);
      }
      break;
    }
    case 'laundry': {
      const n = 4;
      for (let i = 0; i < n; i++) {
        const yy = y + 1.2 + i * 1.0 * s;
        line3(r, wx - 3 * s, yy, wz, wx + 3 * s, yy - 0.3, wz, '#20242c', 0.8, false);
      }
      break;
    }
    case 'sign': {
      const hh = 4 + s * 6, ww = 5 * s;
      line3(r, wx - ww * 0.4, y, wz, wx - ww * 0.4, y + hh, wz, dark, 1.4, false);
      line3(r, wx + ww * 0.4, y, wz, wx + ww * 0.4, y + hh, wz, dark, 1.4, false);
      const a = lit > 0.1 ? (0.5 + lit * 0.5) : 0.12;
      quad3(r, [wx - ww * 0.5, y + hh * 0.35, wz, wx + ww * 0.5, y + hh * 0.35, wz, wx + ww * 0.5, y + hh, wz, wx - ww * 0.5, y + hh, wz],
        '#0a0b0e', p.col, a * 0.55 * r.env.neonGlow);
      break;
    }
    case 'garden': {
      const rad = 3.0 * s;
      ring3(r, wx, y + 0.2, wz, rad, '#16241d', 1, false);
      for (let i = 0; i < 7; i++) {
        const a = hash1(i * 17 + b.seed, 5) * TAU, rr2 = hash1(i * 31 + b.seed, 9) * rad;
        const px = wx + Math.cos(a) * rr2, pz = wz + Math.sin(a) * rr2;
        line3(r, px, y, pz, px, y + 1.4 + hash1(i, 3) * 1.6, pz, '#1b3327', 1.6, false);
      }
      if (lit > 0.2) blinker(r, wx, y + 1.2, wz, '#57ffbf', lit * 0.30, 5 * s);
      break;
    }
    case 'dome': {
      cyl3(r, wx, y, wz, 3.0 * s, 1.4 * s, '#101a17');
      break;
    }
    case 'logo': {
      const hh = 7 * s, ww = 7 * s;
      const spin = t * 0.35 + p.ph;
      const c = Math.cos(spin) * ww * 0.5, s2 = Math.sin(spin) * ww * 0.5;
      const a = (0.35 + lit * 0.65) * r.env.neonGlow;
      // rotating diamond
      const cy2 = y + hh * 0.7;
      const pts = [wx - c, cy2 + hh * 0.5, wz - s2, wx + c, cy2 + hh * 0.5, wz + s2, wx + c, cy2 - hh * 0.5, wz + s2, wx - c, cy2 - hh * 0.5, wz - s2];
      quad3(r, pts, null, p.col, a * 0.35);
      ringV3(r, wx, cy2, wz, ww * 0.5, spin, p.col, a);
      break;
    }
    case 'pylon': {
      const hh = 8 + s * 14;
      for (let i = -1; i <= 1; i += 2) line3(r, wx + i * 1.2 * s, y, wz, wx, y + hh, wz, dark, 1.6, false);
      if (lit > 0.15) line3(r, wx, y + hh * 0.2, wz, wx, y + hh, wz, p.col, 0.8, true);
      blinker(r, wx, y + hh, wz, '#ff3b30', 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 2 + p.ph)), 2.2);
      break;
    }
    case 'crown': {
      const n = 8, rad = 4 * s, hh = 5 * s;
      for (let i = 0; i < n; i++) {
        const a = i / n * TAU;
        const px = wx + Math.cos(a) * rad, pz = wz + Math.sin(a) * rad;
        line3(r, px, y, pz, px, y + hh * (0.6 + 0.4 * Math.abs(Math.sin(a * 2))), pz, dark, 1.5, false);
        if (lit > 0.2) blinker(r, px, y + hh * 0.6, pz, p.col, lit * 0.30, 1.8);
      }
      break;
    }
  }
}

function blinker(r, x, y, z, col, a, rad) {
  const cam = r.cam;
  if (!isFinite(a) || !isFinite(rad) || !isFinite(x) || !isFinite(y) || !isFinite(z)) return;
  const t = cam.toCam(x, y, z, { x: 0, y: 0, z: 0 });
  if (t.z < 0.5) return;
  const p = cam.toScreen(t, {});
  const fg = clamp01(r.fog(t.z, y));
  const aa = clamp01(a * (1 - fg)) * r.env.neonGlow;
  if (aa < 0.01) return;
  const rr = Math.max(0.7, rad * (cam.f / t.z) * 0.12) * r.scale;
  const c = hexToRgb(col);
  r.ctx.fillStyle = rgbStr(c, Math.min(1, aa * 1.1));
  r.ctx.beginPath(); r.ctx.arc(p.x, p.y, rr * 0.55, 0, TAU); r.ctx.fill();
  r.emitDot(p.x, p.y, rr * 3.0, c, aa);
}

function ring3(r, x, y, z, rad, col, a, glow) {
  const cam = r.cam, n = 18;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const ang = i / n * TAU;
    const t = cam.toCam(x + Math.cos(ang) * rad, y, z + Math.sin(ang) * rad, { x: 0, y: 0, z: 0 });
    if (t.z < 0.5) return;
    pts.push(cam.toScreen(t, {}));
  }
  const fg = clamp01(r.fog(cam.toCam(x, y, z, { x: 0, y: 0, z: 0 }).z, y));
  const ctx = r.ctx;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < n; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.fillStyle = rgbStr(mixRgb(hexToRgb(col), r.fogRgb, fg), a);
  ctx.fill();
}

function ringV3(r, x, y, z, rad, rot, col, a) {
  const cam = r.cam, n = 22;
  const c = Math.cos(rot), s = Math.sin(rot);
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const ang = i / n * TAU;
    const lx = Math.cos(ang) * rad, ly = Math.sin(ang) * rad;
    const t = cam.toCam(x + lx * c, y + ly, z + lx * s, { x: 0, y: 0, z: 0 });
    if (t.z < 0.5) return;
    pts.push(cam.toScreen(t, {}));
  }
  const fg = clamp01(r.fog(cam.toCam(x, y, z, { x: 0, y: 0, z: 0 }).z, y));
  const aa = clamp01(a * (1 - fg));
  const cc = hexToRgb(col);
  const ctx = r.ctx;
  ctx.strokeStyle = rgbStr(cc, aa);
  ctx.lineWidth = Math.max(0.7, 1.4 * r.scale);
  ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
  const gc = r.gctx;
  gc.strokeStyle = rgbStr(cc, aa);
  gc.lineWidth = Math.max(0.9, 2.2 * r.scale);
  gc.beginPath(); gc.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) gc.lineTo(pts[i].x, pts[i].y);
  gc.stroke();
}

function cyl3(r, x, y, z, rad, h, col) {
  const n = 10;
  const base = hexToRgb(col);
  for (let i = 0; i < n; i++) {
    const a0 = i / n * TAU, a1 = (i + 1) / n * TAU;
    const x0 = x + Math.cos(a0) * rad, z0 = z + Math.sin(a0) * rad;
    const x1 = x + Math.cos(a1) * rad, z1 = z + Math.sin(a1) * rad;
    const mx = (x0 + x1) * 0.5, mz = (z0 + z1) * 0.5;
    let nx = mx - x, nz = mz - z; const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
    if (nx * (mx - r.cam.px) + nz * (mz - r.cam.pz) > 0) continue;
    const sh = 0.6 + 0.4 * clamp01(-(nx * r.env.sunDir.x + nz * r.env.sunDir.z) * 0.5 + 0.5);
    quad3(r, [x0, y, z0, x1, y, z1, x1, y + h, z1, x0, y + h, z0], rgbToHex(scaleRgb(base, sh)));
  }
  // cap
  const pts = [];
  for (let i = 0; i < n; i++) { const a = i / n * TAU; pts.push(x + Math.cos(a) * rad, y + h, z + Math.sin(a) * rad); }
  quad3(r, pts, rgbToHex(scaleRgb(base, 1.25)));
}

/* ---------- ad / billboard content ---------- */

const AD_GLYPHS = '/\\|-_=+*#@%&$<>[]{}()!?:;01234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const ADS = [];
const AD_NAMES = [];

function makeAd(i) {
  const w = 160, h = 220;
  const c = makeCanvas(w, h), x = c.getContext('2d');
  const rnd = mulberry32(i * 7717 + 3);
  const palettes = [
    ['#ff2d6f', '#ffe9f2', '#12030a'], ['#00e5ff', '#e6ffff', '#001014'],
    ['#ffb400', '#fff4d6', '#140d00'], ['#8f5cff', '#f0e6ff', '#0b0514'],
    ['#39ff88', '#e9fff2', '#001408'], ['#ff5b2e', '#fff0e8', '#140500'],
    ['#ffffff', '#a9b8cc', '#05070a']
  ];
  const pal = palettes[i % palettes.length];
  x.fillStyle = pal[2]; x.fillRect(0, 0, w, h);
  const style = i % 7;
  if (style === 0) { // big glyph column
    x.fillStyle = pal[0];
    x.font = 'bold 54px ui-monospace, monospace';
    x.textAlign = 'center';
    for (let k = 0; k < 3; k++) {
      x.fillText(AD_GLYPHS[Math.floor(rnd() * AD_GLYPHS.length)], w / 2, 62 + k * 62);
    }
  } else if (style === 1) { // face silhouette
    const g = x.createRadialGradient(w / 2, h * 0.42, 4, w / 2, h * 0.42, w * 0.6);
    g.addColorStop(0, pal[1]); g.addColorStop(0.5, pal[0]); g.addColorStop(1, pal[2]);
    x.fillStyle = g;
    x.beginPath(); x.ellipse(w / 2, h * 0.44, w * 0.30, h * 0.24, 0, 0, TAU); x.fill();
    x.fillStyle = pal[2];
    x.beginPath(); x.ellipse(w * 0.40, h * 0.42, 9, 5, 0, 0, TAU); x.fill();
    x.beginPath(); x.ellipse(w * 0.60, h * 0.42, 9, 5, 0, 0, TAU); x.fill();
    x.fillStyle = pal[0];
    x.fillRect(w * 0.12, h * 0.74, w * 0.76, 4);
    x.font = 'bold 20px ui-monospace, monospace'; x.textAlign = 'center';
    x.fillText('SYNTH', w / 2, h * 0.86);
  } else if (style === 2) { // stacked bars
    for (let k = 0; k < 9; k++) {
      x.fillStyle = k % 2 ? pal[0] : pal[1];
      x.globalAlpha = 0.35 + rnd() * 0.65;
      x.fillRect(10, 12 + k * 23, (w - 20) * (0.3 + rnd() * 0.7), 15);
    }
    x.globalAlpha = 1;
  } else if (style === 3) { // circle logo
    x.strokeStyle = pal[0]; x.lineWidth = 6;
    x.beginPath(); x.arc(w / 2, h * 0.40, w * 0.26, 0, TAU); x.stroke();
    x.beginPath(); x.arc(w / 2, h * 0.40, w * 0.14, 0.5, 4.2); x.stroke();
    x.fillStyle = pal[1];
    x.font = 'bold 22px ui-monospace, monospace'; x.textAlign = 'center';
    x.fillText('OMNI', w / 2, h * 0.75);
    x.fillStyle = pal[0];
    x.fillText('CORP', w / 2, h * 0.86);
  } else if (style === 4) { // vertical text
    x.fillStyle = pal[0];
    x.font = 'bold 34px ui-monospace, monospace'; x.textAlign = 'center';
    const word = ['NEO', 'ZEN', 'ICHI', 'VOID', 'KAGE', 'RIN'][i % 6];
    for (let k = 0; k < word.length; k++) x.fillText(word[k], w / 2, 44 + k * 42);
  } else if (style === 5) { // noodle bowl / product
    x.fillStyle = pal[0];
    x.beginPath(); x.moveTo(w * 0.2, h * 0.5); x.lineTo(w * 0.8, h * 0.5);
    x.lineTo(w * 0.68, h * 0.74); x.lineTo(w * 0.32, h * 0.74); x.closePath(); x.fill();
    x.strokeStyle = pal[1]; x.lineWidth = 4;
    for (let k = 0; k < 5; k++) {
      x.beginPath();
      x.moveTo(w * (0.30 + k * 0.1), h * 0.5);
      x.bezierCurveTo(w * (0.28 + k * 0.1), h * 0.34, w * (0.40 + k * 0.08), h * 0.30, w * (0.36 + k * 0.09), h * 0.20);
      x.stroke();
    }
    x.fillStyle = pal[1]; x.font = 'bold 18px ui-monospace, monospace'; x.textAlign = 'center';
    x.fillText('RAMEN 24H', w / 2, h * 0.90);
  } else { // scanline gradient + glyph noise
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, pal[0]); g.addColorStop(1, pal[2]);
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = pal[1]; x.font = '11px ui-monospace, monospace';
    for (let k = 0; k < 40; k++) {
      x.globalAlpha = 0.2 + rnd() * 0.6;
      x.fillText(AD_GLYPHS[Math.floor(rnd() * AD_GLYPHS.length)].repeat(2 + Math.floor(rnd() * 6)), rnd() * w, 12 + rnd() * (h - 12));
    }
    x.globalAlpha = 1;
  }
  // scanlines
  x.globalCompositeOperation = 'multiply';
  x.fillStyle = 'rgba(0,0,0,0.35)';
  for (let y = 0; y < h; y += 4) x.fillRect(0, y, w, 1);
  x.globalCompositeOperation = 'source-over';
  return c;
}

function initAds() {
  for (let i = 0; i < 14; i++) { ADS.push(makeAd(i)); AD_NAMES.push('AD-' + String(i + 1).padStart(2, '0')); }
}

/* ---------- decorations ---------- */

const DECO_TYPES = [
  { id: 'billboard', name: 'BILLBOARD', unlock: 0, icon: '▭', desc: 'wall screen · press I to upload an image' },
  { id: 'neonsign', name: 'NEON SIGN', unlock: 0, icon: '⌇', desc: 'vertical kanji strip' },
  { id: 'holoscreen', name: 'HOLO SCREEN', unlock: 8, icon: '◱', desc: 'floating projection panel' },
  { id: 'holofigure', name: 'HOLO FIGURE', unlock: 14, icon: '☖', desc: 'towering human projection' },
  { id: 'holoanimal', name: 'HOLO KOI', unlock: 20, icon: '≈', desc: 'swimming koi projection' },
  { id: 'holoring', name: 'HOLO RING', unlock: 26, icon: '◎', desc: 'rotating corporate seal' },
  { id: 'helipad', name: 'HELIPAD', unlock: 6, icon: '⊕', desc: 'rooftop landing lights' },
  { id: 'antenna', name: 'ANTENNA', unlock: 3, icon: '↑', desc: 'comms mast with beacon' },
  { id: 'searchlight', name: 'SEARCHLIGHT', unlock: 32, icon: '◤', desc: 'sweeping beam' },
  { id: 'airship', name: 'AIRSHIP', unlock: 38, icon: '⬬', desc: 'drifting ad blimp' },
  { id: 'drones', name: 'DRONE SWARM', unlock: 44, icon: '⁘', desc: 'patrol lights' },
  { id: 'steam', name: 'STEAM VENT', unlock: 10, icon: '≀', desc: 'ground exhaust plume' },
  { id: 'tower', name: 'RADIO TOWER', unlock: 50, icon: '⋀', desc: 'freestanding lattice mast' },
  { id: 'skyway', name: 'SKYWAY', unlock: 56, icon: '═', desc: 'links two nearby towers' }
];

let _did = 1;

class Deco {
  constructor(o) {
    this.id = o.id || _did++;
    this.type = o.type;
    this.x = o.x; this.y = o.y; this.z = o.z;
    this.rot = o.rot || 0;
    this.scale = o.scale || 1;
    this.seed = o.seed === undefined ? ((Math.random() * 1e9) | 0) : o.seed;
    this.ad = o.ad === undefined ? (this.seed % ADS.length) : o.ad;
    this.custom = o.custom || null;   // dataURL image
    this.customImg = null;
    this.col = o.col || null;
    this.host = o.host || null;       // building id it sits on
    this.phase = hash1(this.seed, 3) * TAU;
    if (this.custom) this.loadCustom();
  }
  loadCustom() {
    const im = new Image();
    im.onload = () => { this.customImg = im; };
    im.src = this.custom;
  }
  image() {
    if (this.customImg) return this.customImg;
    return ADS[this.ad % ADS.length];
  }
  serialize() {
    return {
      type: this.type, x: +this.x.toFixed(2), y: +this.y.toFixed(2), z: +this.z.toFixed(2),
      rot: +this.rot.toFixed(3), scale: +this.scale.toFixed(2), seed: this.seed, ad: this.ad,
      col: this.col, host: this.host, custom: this.custom || null
    };
  }
}

function decoRadius(d) {
  switch (d.type) {
    case 'billboard': return 9 * d.scale;
    case 'holoscreen': return 12 * d.scale;
    case 'holofigure': return 12 * d.scale;
    case 'holoanimal': return 14 * d.scale;
    case 'holoring': return 11 * d.scale;
    case 'airship': return 16 * d.scale;
    case 'tower': return 6 * d.scale;
    default: return 5 * d.scale;
  }
}

function drawDeco(r, d, selected) {
  const cam = r.cam;
  const t = cam.toCam(d.x, d.y, d.z, { x: 0, y: 0, z: 0 });
  if (t.z < 0.3) return;
  const zz = t.z - (d.type.startsWith('holo') ? 2 : 0.8);
  r.push(zz, function (rr) { drawDecoNow(rr, d, selected); });
}

function drawDecoNow(r, d, selected) {
  const env = r.env, t = env.time;
  const gl = env.neonGlow;
  const col = d.col || '#7ce7ff';
  switch (d.type) {
    case 'billboard': {
      const w = 10 * d.scale, h = 13 * d.scale;
      const c = Math.cos(d.rot), s = Math.sin(d.rot);
      const ax = c, az = s;
      const x0 = d.x - ax * w * 0.5, z0 = d.z - az * w * 0.5;
      const x1 = d.x + ax * w * 0.5, z1 = d.z + az * w * 0.5;
      // frame
      quad3(r, [x0, d.y, z0, x1, d.y, z1, x1, d.y + h, z1, x0, d.y + h, z0], '#080a0d');
      drawScreen(r, d.image(), x0, d.y + h * 0.06, z0, x1, d.y + h * 0.94, z1, 0.95 * gl, d);
      // frame edge glow
      line3(r, x0, d.y, z0, x0, d.y + h, z0, '#ff3b5c', 1.0, true);
      line3(r, x1, d.y, z1, x1, d.y + h, z1, '#ff3b5c', 1.0, true);
      break;
    }
    case 'neonsign': {
      const h = 11 * d.scale, w = 1.9 * d.scale;
      const c = Math.cos(d.rot), s = Math.sin(d.rot);
      const x1 = d.x + c * w, z1 = d.z + s * w;
      quad3(r, [d.x, d.y, d.z, x1, d.y, z1, x1, d.y + h, z1, d.x, d.y + h, d.z], '#07080b', col, 0.30 * gl);
      const n = 5;
      for (let i = 0; i < n; i++) {
        const yy = d.y + h * (0.10 + i * 0.19);
        const fl = (hash1(i * 13 + d.seed, 7) < 0.12) ? (Math.sin(t * 22 + i) > 0 ? 1 : 0.25) : 1;
        line3(r, d.x + c * w * 0.25, yy, d.z + s * w * 0.25, x1 - c * w * 0.25, yy, z1 - s * w * 0.25, col, 1.6, true);
        if (fl < 1) { }
      }
      break;
    }
    case 'holoscreen': {
      const w = 14 * d.scale, h = 9 * d.scale;
      const c = Math.cos(d.rot), s = Math.sin(d.rot);
      const bob = Math.sin(t * 0.5 + d.phase) * 0.8;
      const y = d.y + bob;
      const x0 = d.x - c * w * 0.5, z0 = d.z - s * w * 0.5;
      const x1 = d.x + c * w * 0.5, z1 = d.z + s * w * 0.5;
      drawScreen(r, d.image(), x0, y, z0, x1, y + h, z1, 0.55 * gl, d, true);
      break;
    }
    case 'holofigure': {
      holoFigure(r, d, t, gl);
      break;
    }
    case 'holoanimal': {
      holoKoi(r, d, t, gl);
      break;
    }
    case 'holoring': {
      const rad = 6 * d.scale;
      const spin = t * 0.4 + d.phase;
      const bob = Math.sin(t * 0.6 + d.phase) * 0.7;
      const y = d.y + bob;
      const cc = d.col || '#8fd8ff';
      ringV3(r, d.x, y, d.z, rad, spin, cc, 0.75 * gl);
      ringV3(r, d.x, y, d.z, rad * 0.62, spin + 1.2, cc, 0.55 * gl);
      ringV3(r, d.x, y, d.z, rad * 0.30, -spin * 1.6, cc, 0.7 * gl);
      blinker(r, d.x, y, d.z, cc, 0.5 * gl, 6 * d.scale);
      break;
    }
    case 'helipad': {
      drawRoofProp(r, { dk: 'CENTRAL', lights: 0.9, seed: d.seed }, { t: 'helipad', x: 0, z: 0, y: d.y, s: d.scale, r: d.rot, ph: d.phase, col: '#ffe08a' }, d.x, d.z);
      break;
    }
    case 'antenna': {
      drawRoofProp(r, { dk: 'CENTRAL', lights: 0.9, seed: d.seed }, { t: 'antenna', x: 0, z: 0, y: d.y, s: d.scale * 1.4, r: d.rot, ph: d.phase, col: '#ff3b30' }, d.x, d.z);
      break;
    }
    case 'searchlight': {
      const sweep = Math.sin(t * 0.22 + d.phase);
      const ang = d.rot + sweep * 0.85;
      const len = 120 * d.scale;
      const tipY = d.y + 70 * d.scale;
      const tx = d.x + Math.cos(ang) * len, tz = d.z + Math.sin(ang) * len;
      const cc = d.col || '#cfe8ff';
      // beam as a thin triangle-ish quad
      const spread = 5 * d.scale;
      quad3(r, [d.x - Math.sin(ang) * 0.6, d.y, d.z + Math.cos(ang) * 0.6,
      d.x + Math.sin(ang) * 0.6, d.y, d.z - Math.cos(ang) * 0.6,
      tx + Math.sin(ang) * spread, tipY, tz - Math.cos(ang) * spread,
      tx - Math.sin(ang) * spread, tipY, tz + Math.cos(ang) * spread], null, cc, 0.11 * gl);
      blinker(r, d.x, d.y, d.z, cc, 0.8 * gl, 4 * d.scale);
      break;
    }
    case 'airship': {
      const drift = t * 0.8 * d.scale;
      const rad = 40 + (d.seed % 40);
      const a = d.phase + drift / rad;
      const x = d.x + Math.cos(a) * rad, z = d.z + Math.sin(a) * rad;
      const y = d.y + Math.sin(t * 0.2 + d.phase) * 1.6;
      const L = 15 * d.scale, R = 4.2 * d.scale;
      const dirx = -Math.sin(a), dirz = Math.cos(a);
      // hull
      const segs = 7;
      for (let i = 0; i < segs; i++) {
        const f0 = i / segs, f1 = (i + 1) / segs;
        const r0 = Math.sin(f0 * Math.PI) * R, r1 = Math.sin(f1 * Math.PI) * R;
        const p0x = x + dirx * (f0 - 0.5) * L, p0z = z + dirz * (f0 - 0.5) * L;
        const p1x = x + dirx * (f1 - 0.5) * L, p1z = z + dirz * (f1 - 0.5) * L;
        quad3(r, [p0x, y - r0, p0z, p1x, y - r1, p1z, p1x, y + r1, p1z, p0x, y + r0, p0z], '#0d1015');
      }
      // ad panel on the side
      const px = x + dirx * -L * 0.15, pz = z + dirz * -L * 0.15;
      const sw = L * 0.5;
      drawScreen(r, d.image(), px - dirx * sw * 0.5, y - R * 0.5, pz - dirz * sw * 0.5,
        px + dirx * sw * 0.5, y + R * 0.5, pz + dirz * sw * 0.5, 0.8 * gl, d);
      blinker(r, x + dirx * L * 0.5, y, z + dirz * L * 0.5, '#ff3b30', 0.5 + 0.5 * Math.sin(t * 3), 2);
      blinker(r, x - dirx * L * 0.5, y, z - dirz * L * 0.5, '#4affa0', 0.4, 1.6);
      break;
    }
    case 'drones': {
      const n = 7;
      for (let i = 0; i < n; i++) {
        const a = t * 0.55 + d.phase + i / n * TAU;
        const rad = 7 * d.scale + Math.sin(t * 0.4 + i) * 2;
        const x = d.x + Math.cos(a) * rad;
        const z = d.z + Math.sin(a) * rad;
        const y = d.y + Math.sin(t * 0.9 + i * 1.7) * 2.2;
        blinker(r, x, y, z, i % 3 === 0 ? '#ff4a5a' : '#8fe8ff', 0.75, 1.5);
      }
      break;
    }
    case 'steam': {
      const n = 5;
      for (let i = 0; i < n; i++) {
        const ph = (t * 0.22 + i / n + d.phase) % 1;
        const y = d.y + ph * 22 * d.scale;
        const rad = (1.5 + ph * 9) * d.scale;
        const a = (1 - ph) * 0.10 * (1 - ph);
        softBlob(r, d.x + Math.sin(ph * 5 + d.phase) * 2, y, d.z, rad, '#c9d6e4', a);
      }
      break;
    }
    case 'tower': {
      const h = 40 * d.scale;
      const legs = 3, rad = 2.6 * d.scale;
      for (let i = 0; i < legs; i++) {
        const a = i / legs * TAU + d.rot;
        const bx = d.x + Math.cos(a) * rad, bz = d.z + Math.sin(a) * rad;
        line3(r, bx, d.y, bz, d.x, d.y + h, d.z, '#0b0d11', 2.0, false);
      }
      for (let k = 1; k < 7; k++) {
        const f = k / 7, yy = d.y + h * f, rr2 = rad * (1 - f * 0.9);
        for (let i = 0; i < legs; i++) {
          const a0 = i / legs * TAU + d.rot, a1 = (i + 1) / legs * TAU + d.rot;
          line3(r, d.x + Math.cos(a0) * rr2, yy, d.z + Math.sin(a0) * rr2, d.x + Math.cos(a1) * rr2, yy, d.z + Math.sin(a1) * rr2, '#0b0d11', 1.2, false);
        }
        if (k % 2 === 0) blinker(r, d.x, yy, d.z, '#ff3b30', 0.3 + 0.4 * (Math.sin(t * 2 + k) > 0 ? 1 : 0.2), 1.6);
      }
      blinker(r, d.x, d.y + h, d.z, '#ff3b30', 0.5 + 0.5 * Math.sin(t * 2.2 + d.phase), 3);
      break;
    }
    case 'skyway': {
      // rot encodes direction, scale encodes length
      const L = 22 * d.scale;
      const c = Math.cos(d.rot), s = Math.sin(d.rot);
      const x1 = d.x + c * L, z1 = d.z + s * L;
      const wdt = 2.2, hgt = 2.6;
      const nx = -s * wdt * 0.5, nz = c * wdt * 0.5;
      quad3(r, [d.x + nx, d.y, d.z + nz, x1 + nx, d.y, z1 + nz, x1 + nx, d.y + hgt, z1 + nz, d.x + nx, d.y + hgt, d.z + nz], '#0a0c11');
      quad3(r, [d.x - nx, d.y, d.z - nz, x1 - nx, d.y, z1 - nz, x1 - nx, d.y + hgt, z1 - nz, d.x - nx, d.y + hgt, d.z - nz], '#0d1017');
      quad3(r, [d.x + nx, d.y + hgt, d.z + nz, x1 + nx, d.y + hgt, z1 + nz, x1 - nx, d.y + hgt, z1 - nz, d.x - nx, d.y + hgt, d.z - nz], '#111620');
      const nlit = 7;
      for (let i = 1; i < nlit; i++) {
        const f = i / nlit;
        blinker(r, lerp(d.x, x1, f), d.y + hgt * 0.55, lerp(d.z, z1, f), '#9fd6ff', 0.45, 1.4);
      }
      break;
    }
  }
  if (selected) {
    drawSelectionRing(r, d.x, d.z, decoRadius(d) * 0.6, '#7ce7ff');
  }
}

function softBlob(r, x, y, z, rad, col, a) {
  const cam = r.cam;
  const t = cam.toCam(x, y, z, { x: 0, y: 0, z: 0 });
  if (t.z < 0.5) return;
  const p = cam.toScreen(t, {});
  const fg = clamp01(r.fog(t.z, y));
  const aa = clamp01(a * (1 - fg));
  if (aa < 0.004) return;
  const rr = rad * (cam.f / t.z);
  const g = r.ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rr);
  const c = hexToRgb(col);
  g.addColorStop(0, rgbStr(c, aa));
  g.addColorStop(1, rgbStr(c, 0));
  r.ctx.fillStyle = g;
  r.ctx.fillRect(p.x - rr, p.y - rr, rr * 2, rr * 2);
}

/* project an image onto a 3D quad given bottom-left / top-right pair */
function drawScreen(r, img, x0, y0, z0, x1, y1, z1, alpha, d, ghost) {
  const cam = r.cam;
  let A = cam.toCam(x0, y1, z0, { x: 0, y: 0, z: 0 });   // top-left
  let B = cam.toCam(x1, y1, z1, { x: 0, y: 0, z: 0 });   // top-right
  let C = cam.toCam(x0, y0, z0, { x: 0, y: 0, z: 0 });   // bottom-left
  let Dp = cam.toCam(x1, y0, z1, { x: 0, y: 0, z: 0 });
  if (A.z < 0.6 || B.z < 0.6 || C.z < 0.6 || Dp.z < 0.6) return;
  let pA = cam.toScreen(A, {}), pB = cam.toScreen(B, {}), pC = cam.toScreen(C, {}), pD = cam.toScreen(Dp, {});
  // facing check via signed area
  let area = (pB.x - pA.x) * (pC.y - pA.y) - (pB.y - pA.y) * (pC.x - pA.x);
  if (Math.abs(area) < 4) return;
  if (area < 0) {
    // seen from behind — swap the horizontal ends so the image is not mirrored
    const tx = x0, tz = z0; x0 = x1; z0 = z1; x1 = tx; z1 = tz;
    A = cam.toCam(x0, y1, z0, { x: 0, y: 0, z: 0 });
    B = cam.toCam(x1, y1, z1, { x: 0, y: 0, z: 0 });
    C = cam.toCam(x0, y0, z0, { x: 0, y: 0, z: 0 });
    Dp = cam.toCam(x1, y0, z1, { x: 0, y: 0, z: 0 });
    pA = cam.toScreen(A, {}); pB = cam.toScreen(B, {}); pC = cam.toScreen(C, {}); pD = cam.toScreen(Dp, {});
    area = -area;
  }
  const fg = clamp01(r.fog((A.z + C.z) * 0.5, (y0 + y1) * 0.5));
  const a = clamp01(alpha * (1 - fg));
  if (a < 0.01) return;
  const ctx = r.ctx;
  const sw = img.width, sh = img.height;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(pA.x, pA.y); ctx.lineTo(pB.x, pB.y); ctx.lineTo(pD.x, pD.y); ctx.lineTo(pC.x, pC.y); ctx.closePath();
  ctx.clip();
  // strip map for perspective
  const hpx = Math.hypot(pC.x - pA.x, pC.y - pA.y);
  const S = clamp(Math.ceil(hpx / 34), 1, 8);
  const gctx = r.gctx, gs = r.glowScale;
  gctx.save();
  for (let i = 0; i < S; i++) {
    const v0 = i / S, v1 = (i + 1) / S;
    const p0 = cam.project(lerp(x0, x0, 0), lerp(y1, y0, v0), z0, {});
    // interpolate along the 3D edges
    const aX = x0, aY = lerp(y1, y0, v0), aZ = z0;
    const bX = x1, bY = lerp(y1, y0, v0), bZ = z1;
    const cX = x0, cY = lerp(y1, y0, v1), cZ = z0;
    const Pa = cam.project(aX, aY, aZ, {});
    const Pb = cam.project(bX, bY, bZ, {});
    const Pc = cam.project(cX, cY, cZ, {});
    const sy0 = v0 * sh, shh = (v1 - v0) * sh;
    const ax = (Pb.x - Pa.x) / sw, ay = (Pb.y - Pa.y) / sw;
    const cx2 = (Pc.x - Pa.x) / shh, cy2 = (Pc.y - Pa.y) / shh;
    const e = Pa.x - cx2 * sy0, f2 = Pa.y - cy2 * sy0;
    if (!isFinite(ax) || !isFinite(cy2)) continue;
    ctx.setTransform(ax, ay, cx2, cy2, e, f2);
    ctx.globalAlpha = a;
    try { ctx.drawImage(img, 0, sy0, sw, shh, 0, sy0, sw, shh); } catch (err) { }
    gctx.setTransform(ax * gs, ay * gs, cx2 * gs, cy2 * gs, e * gs, f2 * gs);
    gctx.globalAlpha = a * (ghost ? 0.85 : 0.55);
    gctx.globalCompositeOperation = 'lighter';
    try { gctx.drawImage(img, 0, sy0, sw, shh, 0, sy0, sw, shh); } catch (err) { }
  }
  gctx.restore();
  gctx.setTransform(gs, 0, 0, gs, 0, 0);
  gctx.globalCompositeOperation = 'lighter';
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  if (ghost) {
    // hologram scanlines + tint
    ctx.beginPath();
    ctx.moveTo(pA.x, pA.y); ctx.lineTo(pB.x, pB.y); ctx.lineTo(pD.x, pD.y); ctx.lineTo(pC.x, pC.y); ctx.closePath();
    ctx.fillStyle = 'rgba(120,220,255,' + (0.10 * (1 - fg)).toFixed(3) + ')';
    ctx.fill();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 0.35;
    const step = Math.max(2, 3 * r.scale);
    ctx.fillStyle = '#000';
    const minY = Math.min(pA.y, pB.y), maxY = Math.max(pC.y, pD.y);
    for (let y = minY; y < maxY; y += step * 2) ctx.fillRect(Math.min(pA.x, pC.x) - 2, y, Math.abs(pB.x - pA.x) + Math.abs(pD.x - pC.x) + 8, step);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

/* holograms drawn as glowing stacked slices (cheap volumetric look) */
function holoFigure(r, d, t, gl) {
  const H = 26 * d.scale;
  const col = d.col || '#8fd8ff';
  const c = hexToRgb(col);
  const cam = r.cam;
  const flick = 0.85 + 0.15 * Math.sin(t * 9 + d.phase) * (hash1(Math.floor(t * 2) + d.seed, 11) < 0.1 ? 3 : 0.3);
  const sway = Math.sin(t * 0.5 + d.phase) * 0.12;
  const N = 26;
  const ctx = r.ctx, gctx = r.gctx;
  for (let i = 0; i < N; i++) {
    const f = i / (N - 1);
    const y = d.y + f * H;
    // humanoid width profile
    let w;
    if (f > 0.86) w = 0.30 * (1 - (f - 0.86) / 0.14 * 0.5);       // head
    else if (f > 0.80) w = 0.16;                                     // neck
    else if (f > 0.52) w = 0.52 - (f - 0.52) * 0.4;                  // torso/shoulders
    else if (f > 0.44) w = 0.34;                                     // waist
    else w = 0.40 * (1 - f * 0.2);                                   // legs
    w *= 4.6 * d.scale;
    const xo = Math.sin(f * 2.4 + t * 0.6 + d.phase) * sway * 3;
    const px = d.x + xo, pz = d.z;
    const cm = cam.toCam(px, y, pz, { x: 0, y: 0, z: 0 });
    if (cm.z < 0.5) continue;
    const sp = cam.toScreen(cm, {});
    const fg = clamp01(r.fog(cm.z, y));
    const a = clamp01(0.22 * flick * (1 - fg) * gl * (0.5 + 0.5 * Math.sin(f * 14 + t * 2)));
    const sw = w * (cam.f / cm.z);
    const shh = Math.max(1, (H / N) * (cam.f / cm.z) * 1.15);
    ctx.fillStyle = rgbStr(c, a * 0.55);
    ctx.fillRect(sp.x - sw * 0.5, sp.y - shh * 0.5, sw, shh);
    gctx.fillStyle = rgbStr(c, a * 0.85);
    gctx.fillRect(sp.x - sw * 0.5, sp.y - shh * 0.5, sw, shh);
  }
  // base projector glow
  blinker(r, d.x, d.y, d.z, col, 0.5 * gl, 5 * d.scale);
}

function holoKoi(r, d, t, gl) {
  const col = d.col || '#ff8ad0';
  const c = hexToRgb(col);
  const cam = r.cam, ctx = r.ctx, gctx = r.gctx;
  const N = 22;
  const rad = 11 * d.scale;
  const spin = t * 0.30 + d.phase;
  for (let i = 0; i < N; i++) {
    const f = i / (N - 1);
    const a = spin - f * 1.5;
    const bodyR = rad * (1 + Math.sin(f * 3 + t) * 0.06);
    const x = d.x + Math.cos(a) * bodyR;
    const z = d.z + Math.sin(a) * bodyR;
    const y = d.y + Math.sin(a * 2 + t * 0.6) * 3.2 * d.scale;
    const cm = cam.toCam(x, y, z, { x: 0, y: 0, z: 0 });
    if (cm.z < 0.5) continue;
    const sp = cam.toScreen(cm, {});
    const fg = clamp01(r.fog(cm.z, y));
    const prof = Math.sin(Math.pow(f, 0.7) * Math.PI) * (1 - f * 0.35);
    const w = prof * 1.9 * d.scale;
    const sw = Math.max(0.8, w * (cam.f / cm.z));
    const aa = clamp01(0.20 * (1 - fg) * gl * (0.4 + 0.6 * prof));
    ctx.fillStyle = rgbStr(c, aa * 0.55);
    ctx.beginPath(); ctx.ellipse(sp.x, sp.y, sw, sw * 0.34, 0, 0, TAU); ctx.fill();
    gctx.fillStyle = rgbStr(c, aa * 0.8);
    gctx.beginPath(); gctx.ellipse(sp.x, sp.y, sw, sw * 0.34, 0, 0, TAU); gctx.fill();
  }
}

/* ---------- traffic ---------- */

class Traffic {
  constructor() { this.lanes = []; this.aerial = []; }

  rebuild(city) {
    this.lanes.length = 0;
    this.aerial.length = 0;
    const rnd = mulberry32(city.seed * 31 + 5);
    if (!city.buildings.length) return;
    // extent of the built-up area
    let cx = 0, cz = 0, ext = 40;
    for (const b of city.buildings) { cx += b.x; cz += b.z; }
    cx /= city.buildings.length; cz /= city.buildings.length;
    for (const b of city.buildings) ext = Math.max(ext, Math.hypot(b.x - cx, b.z - cz) + 46);
    ext = Math.min(ext, city.radius);
    const R = ext;
    // ground lanes on the street grid
    const step = city.cell * 4;
    for (let g = -R; g <= R; g += step) {
      const half = Math.sqrt(Math.max(0, R * R - g * g));
      if (half < step) continue;
      this.lanes.push({
        ax: cx - half, az: cz + g, bx: cx + half, bz: cz + g, y: 0.6,
        n: 1 + Math.floor(rnd() * 3), sp: 7 + rnd() * 7, col: '#ffd9a8', back: '#ff4a3a'
      });
      this.lanes.push({
        ax: cx + g, az: cz - half, bx: cx + g, bz: cz + half, y: 0.6,
        n: 1 + Math.floor(rnd() * 3), sp: 7 + rnd() * 7, col: '#ffe8c0', back: '#ff5a4a'
      });
    }
    // aerial lanes at several altitudes
    for (let i = 0; i < 6; i++) {
      const y = 14 + rnd() * 58;
      const a = rnd() * TAU;
      const off = (rnd() - 0.5) * R * 0.9;
      const dx = Math.cos(a), dz = Math.sin(a);
      const px = cx - dz * off, pz = cz + dx * off;
      this.aerial.push({
        ax: px - dx * R * 1.15, az: pz - dz * R * 1.15,
        bx: px + dx * R * 1.15, bz: pz + dz * R * 1.15,
        y: y, n: 1 + Math.floor(rnd() * 3), sp: 10 + rnd() * 16,
        col: rnd() < 0.5 ? '#bfe6ff' : '#ffd2a8', back: '#ff3b4a'
      });
    }
  }

  draw(r, t, env) {
    const all = this.lanes.concat(this.aerial);
    for (const L of all) {
      const len = Math.hypot(L.bx - L.ax, L.bz - L.az);
      for (let i = 0; i < L.n; i++) {
        const dir = (i % 2) ? 1 : -1;
        let f = ((t * L.sp / len) * dir + i / L.n + hash1(i * 7, 13)) % 1;
        if (f < 0) f += 1;
        const x = lerp(L.ax, L.bx, f), z = lerp(L.az, L.bz, f);
        const a = env.trafficAmount * (L.y > 5 ? 0.5 : 0.8);
        blinker(r, x, L.y, z, dir > 0 ? L.col : L.back, a * 0.8, L.y > 5 ? 1.1 : 1.3);
        // trailing streak — a fixed world length, not a fraction of the lane
        const trail = (L.y > 5 ? 5.5 : 3.2) / len;
        const tf = clamp01(f - dir * trail);
        line3(r, x, L.y, z, lerp(L.ax, L.bx, tf), L.y, lerp(L.az, L.bz, tf), dir > 0 ? L.col : L.back, 1.1, true);
      }
    }
  }
}

/* ---------- gizmos ---------- */

function drawSelectionRing(r, x, z, rad, col) {
  const cam = r.cam, n = 40;
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = i / n * TAU;
    const t = cam.toCam(x + Math.cos(a) * rad, 0.12, z + Math.sin(a) * rad, { x: 0, y: 0, z: 0 });
    if (t.z < 0.4) return;
    pts.push(cam.toScreen(t, {}));
  }
  const ctx = r.ctx, gctx = r.gctx;
  const c = hexToRgb(col || '#e8f4ff');
  ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.strokeStyle = rgbStr(c, 0.85);
  ctx.lineWidth = Math.max(1, 1.6 * r.scale);
  ctx.stroke();
  ctx.fillStyle = rgbStr(c, 0.07);
  ctx.fill();
  gctx.beginPath(); gctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) gctx.lineTo(pts[i].x, pts[i].y);
  gctx.closePath();
  gctx.strokeStyle = rgbStr(c, 0.55);
  gctx.lineWidth = Math.max(1, 2.2 * r.scale);
  gctx.stroke();
}

function drawGhostBox(r, x, z, w, d, h, rot, ok) {
  const c = Math.cos(rot), s = Math.sin(rot);
  const hw = w * 0.5, hd = d * 0.5;
  const cs = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => [x + (sx * hw) * c - (sz * hd) * s, z + (sx * hw) * s + (sz * hd) * c]);
  const col = ok ? '#7ce7ff' : '#ff4a5a';
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    line3(r, cs[i][0], 0.1, cs[i][1], cs[j][0], 0.1, cs[j][1], col, 1.3, true);
    line3(r, cs[i][0], h, cs[i][1], cs[j][0], h, cs[j][1], col, 0.9, true);
    line3(r, cs[i][0], 0.1, cs[i][1], cs[i][0], h, cs[i][1], col, 0.7, true);
  }
}

function drawBrushDisc(r, x, z, rad, col, mode) {
  const cam = r.cam, n = 44;
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = i / n * TAU;
    const t = cam.toCam(x + Math.cos(a) * rad, 0.15, z + Math.sin(a) * rad, { x: 0, y: 0, z: 0 });
    if (t.z < 0.4) return;
    pts.push(cam.toScreen(t, {}));
  }
  const ctx = r.ctx, gctx = r.gctx;
  const c = hexToRgb(col);
  ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.setLineDash([6 * r.scale, 5 * r.scale]);
  ctx.strokeStyle = rgbStr(c, 0.9);
  ctx.lineWidth = Math.max(1, 1.4 * r.scale);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = rgbStr(c, 0.06);
  ctx.fill();
  gctx.beginPath(); gctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) gctx.lineTo(pts[i].x, pts[i].y);
  gctx.closePath();
  gctx.strokeStyle = rgbStr(c, 0.4);
  gctx.lineWidth = Math.max(1, 2 * r.scale);
  gctx.stroke();
}
