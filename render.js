/* ============================================================
   NEONFALL — render.js
   Canvas2D 2.5D renderer: perspective boxes, height-aware aerial
   fog, emissive buffer -> bloom + anamorphic streaks, colour grade.
   ============================================================ */
'use strict';

/* --- colour grade presets, keyed by name --- */
const FILTERS = {
  NEUTRAL: { tint: '#7f8899', mode: 'soft-light', sat: 0.0, amt: 0.25 },
  TEAL: { tint: '#1fb4c8', mode: 'color', sat: 0.15, amt: 1.0 },
  AMBER: { tint: '#d98a2b', mode: 'color', sat: 0.10, amt: 1.0 },
  BLOOD: { tint: '#b8263a', mode: 'color', sat: 0.20, amt: 1.0 },
  VIOLET: { tint: '#6a49c8', mode: 'color', sat: 0.12, amt: 1.0 },
  MONO: { tint: '#8f97a4', mode: 'color', sat: 0.85, amt: 1.0 },
  ACID: { tint: '#8fc22a', mode: 'color', sat: 0.18, amt: 1.0 }
};

class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.glow = makeCanvas(2, 2);
    this.gctx = this.glow.getContext('2d');
    this.blurA = makeCanvas(2, 2); this.bactx = this.blurA.getContext('2d');
    this.blurB = makeCanvas(2, 2); this.bbctx = this.blurB.getContext('2d');
    this.streak = makeCanvas(2, 2); this.sctx = this.streak.getContext('2d');
    this.streak2 = makeCanvas(2, 2); this.s2ctx = this.streak2.getContext('2d');
    this.thr = makeCanvas(2, 2); this.tctx = this.thr.getContext('2d');
    this.grain = null;
    this.glowScale = 0.5;
    this.w = 0; this.h = 0;
    this.quality = 1;      // render scale multiplier
    this.queue = [];
    this.horizonY = 0;
    this.stars = [];
    this.skylineLayers = null;
    this._tmpA = { x: 0, y: 0, z: 0 };
    this._pool = [];
    for (let i = 0; i < 64; i++) this._pool.push({ x: 0, y: 0, z: 0 });
    this.makeGrain();
    this.makeStars();
  }

  /* ------------ setup ------------- */

  makeGrain() {
    const n = 128;
    const c = makeCanvas(n, n), x = c.getContext('2d');
    const img = x.createImageData(n, n);
    for (let i = 0; i < n * n; i++) {
      const v = 110 + Math.random() * 70;
      img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    this.grain = c;
  }

  makeStars() {
    const rnd = mulberry32(90210);
    for (let i = 0; i < 420; i++) {
      const th = rnd() * TAU, ph = rnd() * 0.85 + 0.02;
      this.stars.push({
        x: Math.sin(th) * Math.cos(ph), y: Math.sin(ph), z: Math.cos(th) * Math.cos(ph),
        m: rnd() * 0.8 + 0.2, tw: rnd() * TAU
      });
    }
  }

  resize(cssW, cssH, dpr) {
    const s = clamp(dpr * this.quality, 0.5, 2);
    this.w = Math.max(2, Math.round(cssW * s));
    this.h = Math.max(2, Math.round(cssH * s));
    this.scale = s;
    this.canvas.width = this.w; this.canvas.height = this.h;
    this.canvas.style.width = cssW + 'px';
    this.canvas.style.height = cssH + 'px';
    const gw = Math.max(2, Math.round(this.w * this.glowScale));
    const gh = Math.max(2, Math.round(this.h * this.glowScale));
    this.glow.width = gw; this.glow.height = gh;
    this.blurA.width = gw; this.blurA.height = gh;
    this.thr.width = gw; this.thr.height = gh;
    this.blurB.width = Math.max(2, gw >> 2); this.blurB.height = Math.max(2, gh >> 2);
    this.streak.width = Math.max(2, gw >> 3); this.streak.height = Math.max(2, gh >> 1);
    this.streak2.width = this.streak.width; this.streak2.height = this.streak.height;
  }

  /* ------------ frame ------------- */

  begin(cam, env) {
    this.cam = cam; this.env = env;
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    this.gctx.setTransform(1, 0, 0, 1, 0, 0);
    this.gctx.globalCompositeOperation = 'source-over';
    this.gctx.globalAlpha = 1;
    this.gctx.clearRect(0, 0, this.glow.width, this.glow.height);
    this.gctx.setTransform(this.glowScale, 0, 0, this.glowScale, 0, 0);
    this.gctx.globalCompositeOperation = 'lighter';
    this.queue.length = 0;

    // horizon line: project a ground point very far along view forward
    const gf = Math.hypot(cam.fx, cam.fz) || 1;
    const p = cam.project(cam.px + (cam.fx / gf) * 4e5, 0, cam.pz + (cam.fz / gf) * 4e5, {});
    this.horizonY = (p.z > 0) ? p.y : -1e5;

    this.fogRgb = hexToRgb(env.fogColor);
    this.skyTop = hexToRgb(env.skyTop);
    this.skyHorizon = hexToRgb(env.skyHorizon);
    this.groundRgb = hexToRgb(env.groundColor);
  }

  /* fog amount 0..1 for a point at camera depth z and world height y.
     Denser near the ground so the lower city dissolves into mist while
     towers keep their silhouette — the "fog trick". */
  fog(z, y) {
    const e = this.env;
    const hf = e.mistBase + (1 - e.mistBase) * Math.exp(-Math.max(0, y) / e.mistHeight);
    const d = e.fogDensity * hf;
    return 1 - Math.exp(-Math.max(0, z - e.fogStart) * d);
  }

  /* ------------ sky ------------- */

  drawSky() {
    const ctx = this.ctx, W = this.w, H = this.h, env = this.env;
    const hy = clamp(this.horizonY, -H * 4, H * 5);
    const span = Math.max(H * 0.75, this.cam.f * 1.1);

    const g = ctx.createLinearGradient(0, hy - span, 0, hy + 2);
    g.addColorStop(0, rgbStr(this.skyTop));
    g.addColorStop(0.52, rgbStr(mixRgb(this.skyTop, this.skyHorizon, 0.55)));
    g.addColorStop(1, rgbStr(this.skyHorizon));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, Math.max(0, Math.min(H, hy + 2)));
    if (hy < 0) { ctx.fillStyle = rgbStr(this.skyHorizon); ctx.fillRect(0, 0, W, H); }

    // stars
    if (env.starAmount > 0.01 && hy > 0) {
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, W, Math.min(H, hy)); ctx.clip();
      const t = env.time * 1000;
      for (let i = 0; i < this.stars.length; i++) {
        const s = this.stars[i];
        const p = this.projDir(s.x, s.y, s.z);
        if (!p) continue;
        const tw = 0.55 + 0.45 * Math.sin(t * 0.0012 + s.tw * 9);
        const a = env.starAmount * s.m * tw;
        if (a < 0.02) continue;
        ctx.fillStyle = 'rgba(210,226,255,' + a.toFixed(3) + ')';
        const r = 0.6 + s.m * 1.0;
        ctx.fillRect(p.x - r * 0.5, p.y - r * 0.5, r, r);
      }
      ctx.restore();
    }

    // sun / moon
    this.drawSun();

    // cloud bands near horizon
    this.drawClouds(hy);

    // horizon haze glow (city bounce light)
    if (hy > -H) {
      const hg = ctx.createLinearGradient(0, hy - H * 0.34, 0, hy + 4);
      const hz = hexToRgb(env.hazeColor);
      hg.addColorStop(0, rgbStr(hz, 0));
      hg.addColorStop(1, rgbStr(hz, env.hazeAmount));
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = hg;
      ctx.fillRect(0, Math.max(0, hy - H * 0.34), W, Math.min(H, hy + 4) - Math.max(0, hy - H * 0.34));
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  /* project a pure direction (unit vector) to screen; null if behind */
  projDir(dx, dy, dz) {
    const cam = this.cam;
    const cxv = dx * cam.rx + dy * cam.ry + dz * cam.rz;
    const cyv = dx * cam.ux + dy * cam.uy + dz * cam.uz;
    const czv = dx * cam.fx + dy * cam.fy + dz * cam.fz;
    if (czv <= 0.001) return null;
    const iz = cam.f / czv;
    return { x: cam.cx + cxv * iz, y: cam.cy - cyv * iz };
  }

  drawSun() {
    const env = this.env, ctx = this.ctx;
    const d = env.sunDir;
    const p = this.projDir(d.x, d.y, d.z);
    this.sunScreen = p;
    if (!p) return;
    const above = d.y > -0.05;
    const R = this.h * (env.sunIsMoon ? 0.022 : 0.030);
    const col = hexToRgb(env.sunColor);
    ctx.globalCompositeOperation = 'lighter';
    // broad atmospheric glow
    let g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, R * (env.sunIsMoon ? 9 : 17));
    g.addColorStop(0, rgbStr(col, 0.50 * env.sunStrength));
    g.addColorStop(0.16, rgbStr(col, 0.20 * env.sunStrength));
    g.addColorStop(1, rgbStr(col, 0));
    ctx.fillStyle = g;
    ctx.fillRect(p.x - R * 18, p.y - R * 18, R * 36, R * 36);
    if (above) {
      g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, R * 1.5);
      g.addColorStop(0, rgbStr(mixRgb(col, { r: 255, g: 255, b: 250 }, 0.6), 0.95 * env.sunStrength));
      g.addColorStop(0.62, rgbStr(col, 0.72 * env.sunStrength));
      g.addColorStop(1, rgbStr(col, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.x, p.y, R * 1.5, 0, TAU); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    // feed the bloom buffer so the sun streaks
    if (above && env.sunStrength > 0.05) {
      const gc = this.gctx;
      const gp = { x: p.x, y: p.y };
      gc.save();
      const gg = gc.createRadialGradient(gp.x, gp.y, 0, gp.x, gp.y, R * 2.2);
      gg.addColorStop(0, rgbStr(col, 0.9 * env.sunStrength));
      gg.addColorStop(1, rgbStr(col, 0));
      gc.fillStyle = gg;
      gc.beginPath(); gc.arc(gp.x, gp.y, R * 2.2, 0, TAU); gc.fill();
      gc.restore();
    }
  }

  drawClouds(hy) {
    const env = this.env, ctx = this.ctx, W = this.w, H = this.h;
    if (env.cloudAmount < 0.02) return;
    const bands = 5;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, W, Math.max(0, Math.min(H, hy))); ctx.clip();
    const cc = hexToRgb(env.cloudColor);
    for (let b = 0; b < bands; b++) {
      const f = b / (bands - 1);
      const y = hy - H * (0.05 + f * 0.42);
      const th = H * (0.012 + f * 0.05);
      const spd = (0.004 + f * 0.010) * env.windSpeed;
      const ox = env.time * spd * 120 + this.cam.yaw * (400 + f * 900);
      const step = Math.max(8, W / 90);
      ctx.beginPath();
      ctx.moveTo(-4, y + th * 2);
      for (let x = -4; x <= W + step; x += step) {
        const n = fbm1((x + ox) * 0.0026 / (0.5 + f), 4000 + b * 31, 4);
        ctx.lineTo(x, y - n * th * 2.4);
      }
      ctx.lineTo(W + 4, y + th * 3); ctx.closePath();
      const a = env.cloudAmount * (0.10 + 0.16 * (1 - f));
      const g = ctx.createLinearGradient(0, y - th * 2.4, 0, y + th * 3);
      g.addColorStop(0, rgbStr(cc, a * 0.2));
      g.addColorStop(0.6, rgbStr(cc, a));
      g.addColorStop(1, rgbStr(cc, 0));
      ctx.fillStyle = g; ctx.fill();
    }
    ctx.restore();
  }

  /* far procedural skyline silhouettes, parallaxed with yaw */
  buildSkyline() {
    const layers = [];
    for (let L = 0; L < 3; L++) {
      const w = 2600, h = 300;
      const c = makeCanvas(w, h), x = c.getContext('2d');
      const rnd = mulberry32(1234 + L * 977);
      x.fillStyle = '#000';
      let px = 0;
      while (px < w) {
        const bw = 12 + rnd() * (44 - L * 8);
        const bh = (18 + Math.pow(rnd(), 2.1) * (h * (0.85 - L * 0.22)));
        x.fillRect(px, h - bh, bw + 1, bh);
        if (rnd() < 0.18) { // spire
          const sw = 2 + rnd() * 3;
          x.fillRect(px + bw * 0.5 - sw * 0.5, h - bh - 10 - rnd() * 26, sw, 30);
        }
        if (rnd() < 0.12) { // stepped top
          x.fillRect(px + bw * 0.2, h - bh - 8 - rnd() * 14, bw * 0.6, 20);
        }
        px += bw + (rnd() < 0.2 ? rnd() * 10 : 0);
      }
      // window pin lights
      x.globalCompositeOperation = 'source-atop';
      for (let i = 0; i < 1500 - L * 380; i++) {
        const lx = rnd() * w, ly = h - rnd() * rnd() * h;
        const t = rnd();
        x.fillStyle = t < 0.6 ? 'rgba(180,205,235,0.55)' : (t < 0.82 ? 'rgba(255,170,90,0.5)' : 'rgba(90,240,235,0.5)');
        x.fillRect(lx, ly, 1.2, 1.2);
      }
      // metres tall / metres away — used to size the layer honestly
      layers.push({
        canvas: c, w: w, h: h, par: 0.30 + L * 0.34,
        tall: 190 - L * 55, away: 1900 + L * 1500, alpha: 0.40 - L * 0.11
      });
    }
    this.skylineLayers = layers;
  }

  drawFarSkyline() {
    if (!this.skylineLayers) this.buildSkyline();
    const ctx = this.ctx, env = this.env, W = this.w, H = this.h;
    const hy = this.horizonY;
    if (hy < -H * 0.2 || hy > H * 1.4) return;
    // heavier air makes the far skyline disappear entirely
    const clearness = clamp01(1 - (env.fogDensity - 0.004) * 62) * env.farSkylineFog;
    for (let L = this.skylineLayers.length - 1; L >= 0; L--) {
      const l = this.skylineLayers[L];
      const alpha = clamp01(l.alpha * clearness);
      if (alpha < 0.012) continue;
      const drawH = (l.tall / l.away) * this.cam.f;
      const scale = drawH / l.h;
      const drawW = l.w * scale;
      let ox = -(this.cam.yaw / TAU) * drawW * 3.2 * l.par;
      ox = ox % drawW;
      const y = hy - drawH + 2;
      ctx.save();
      ctx.globalAlpha = alpha;
      for (let k = -1; k <= Math.ceil(W / drawW); k++) {
        ctx.drawImage(l.canvas, ox + k * drawW, y, drawW, drawH);
      }
      ctx.restore();
      // let the bases sink into the ground haze — no pasted-cutout edge
      const fg = ctx.createLinearGradient(0, y, 0, hy + 3);
      fg.addColorStop(0, rgbStr(this.fogRgb, 0));
      fg.addColorStop(0.55, rgbStr(this.fogRgb, 0.42));
      fg.addColorStop(1, rgbStr(this.fogRgb, 0.95));
      ctx.fillStyle = fg;
      ctx.fillRect(0, y, W, hy + 3 - y);
    }
  }

  drawGround() {
    const ctx = this.ctx, W = this.w, H = this.h;
    const hy = this.horizonY;
    if (hy > H) return;
    const top = Math.max(0, hy);
    // the ground must melt into the horizon fog, never cut a hard line
    const near = mixRgb(this.groundRgb, this.fogRgb, 0.18);
    const g = ctx.createLinearGradient(0, hy - 2, 0, H);
    g.addColorStop(0, rgbStr(this.fogRgb, 1));
    g.addColorStop(0.16, rgbStr(mixRgb(this.fogRgb, near, 0.30), 1));
    g.addColorStop(0.42, rgbStr(mixRgb(this.fogRgb, near, 0.66), 1));
    g.addColorStop(0.75, rgbStr(mixRgb(this.fogRgb, near, 0.90), 1));
    g.addColorStop(1, rgbStr(near, 1));
    ctx.fillStyle = g;
    ctx.fillRect(0, top, W, H - top);
  }

  /* ------------ geometry helpers ------------- */

  /* clip a camera-space polygon against z >= near */
  clipNear(poly, near) {
    const out = [];
    const n = poly.length;
    for (let i = 0; i < n; i++) {
      const a = poly[i], b = poly[(i + 1) % n];
      const ain = a.z >= near, bin = b.z >= near;
      if (ain) out.push(a);
      if (ain !== bin) {
        const t = (near - a.z) / (b.z - a.z);
        out.push({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: near });
      }
    }
    return out;
  }

  /* build screen path from camera-space polygon. returns array or null */
  screenPoly(camPoly) {
    const cam = this.cam;
    const p = this.clipNear(camPoly, 0.35);
    if (p.length < 3) return null;
    const out = new Array(p.length);
    for (let i = 0; i < p.length; i++) {
      const iz = cam.f / p[i].z;
      out[i] = { x: cam.cx + p[i].x * iz, y: cam.cy - p[i].y * iz };
    }
    return out;
  }

  pathFrom(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
  }

  /* ------------ queue ------------- */

  push(z, fn) { this.queue.push({ z: z, fn: fn }); }

  flush() {
    const q = this.queue;
    q.sort((a, b) => b.z - a.z);
    for (let i = 0; i < q.length; i++) q[i].fn(this);
    q.length = 0;
  }

  /* additive sprite in the emissive buffer + a soft dot on the main canvas */
  emitDot(sx, sy, r, color, a) {
    if (!(a > 0.004) || !(r > 0) || !isFinite(sx) || !isFinite(sy)) return;
    const gc = this.gctx;
    const g = gc.createRadialGradient(sx, sy, 0, sx, sy, r);
    g.addColorStop(0, rgbStr(color, clamp01(a)));
    g.addColorStop(0.45, rgbStr(color, clamp01(a) * 0.35));
    g.addColorStop(1, rgbStr(color, 0));
    gc.fillStyle = g;
    gc.fillRect(sx - r, sy - r, r * 2, r * 2);
  }

  emitRect(sx, sy, w, h, color, a) {
    if (a <= 0.004) return;
    const gc = this.gctx;
    gc.fillStyle = rgbStr(color, clamp01(a));
    gc.fillRect(sx, sy, w, h);
  }

  /* ------------ composite ------------- */

  end() {
    const ctx = this.ctx, env = this.env, W = this.w, H = this.h;
    const gw = this.glow.width, gh = this.glow.height;

    // threshold pass: v -> v*(1-t) + t*v^2
    const tc = this.tctx;
    tc.setTransform(1, 0, 0, 1, 0, 0);
    tc.globalCompositeOperation = 'source-over';
    tc.globalAlpha = 1;
    tc.clearRect(0, 0, gw, gh);
    tc.drawImage(this.glow, 0, 0);
    if (env.bloomThreshold > 0.01) {
      tc.globalCompositeOperation = 'multiply';
      tc.globalAlpha = clamp01(env.bloomThreshold);
      tc.drawImage(this.glow, 0, 0);
      tc.globalAlpha = 1;
      tc.globalCompositeOperation = 'source-over';
    }

    if (env.bloom > 0.01) {
      // tight bloom
      const ba = this.bactx;
      ba.setTransform(1, 0, 0, 1, 0, 0);
      ba.globalCompositeOperation = 'source-over';
      ba.clearRect(0, 0, gw, gh);
      ba.filter = 'blur(' + (1.8 * this.scale).toFixed(1) + 'px)';
      ba.drawImage(this.thr, 0, 0);
      ba.filter = 'none';
      // wide halo
      const bw = this.blurB.width, bh = this.blurB.height;
      const bb = this.bbctx;
      bb.setTransform(1, 0, 0, 1, 0, 0);
      bb.globalCompositeOperation = 'source-over';
      bb.clearRect(0, 0, bw, bh);
      bb.filter = 'blur(' + (3.0 * this.scale).toFixed(1) + 'px)';
      bb.drawImage(this.thr, 0, 0, gw, gh, 0, 0, bw, bh);
      bb.filter = 'none';

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.imageSmoothingEnabled = true;
      const b = clamp(env.bloom, 0, 2);
      ctx.globalAlpha = b * 0.55;
      ctx.drawImage(this.blurA, 0, 0, gw, gh, 0, 0, W, H);
      ctx.globalAlpha = b * 0.42;
      ctx.drawImage(this.blurB, 0, 0, bw, bh, 0, 0, W, H);
      ctx.restore();
    }

    // anamorphic streaks: squash X -> blur -> stretch X
    if (env.streak > 0.01) {
      const sw = this.streak.width, sh = this.streak.height;
      const sc = this.sctx;
      sc.setTransform(1, 0, 0, 1, 0, 0);
      sc.globalCompositeOperation = 'source-over';
      sc.globalAlpha = 1;
      sc.clearRect(0, 0, sw, sh);
      sc.drawImage(this.thr, 0, 0, gw, gh, 0, 0, sw, sh);
      if (env.streakThreshold > 0.01) {
        sc.globalCompositeOperation = 'multiply';
        sc.globalAlpha = clamp01(env.streakThreshold);
        sc.drawImage(this.thr, 0, 0, gw, gh, 0, 0, sw, sh);
        sc.globalAlpha = 1; sc.globalCompositeOperation = 'source-over';
      }
      const s2 = this.s2ctx;
      s2.setTransform(1, 0, 0, 1, 0, 0);
      s2.clearRect(0, 0, sw, sh);
      s2.filter = 'blur(' + (2.2).toFixed(1) + 'px)';
      s2.drawImage(this.streak, 0, 0);
      s2.filter = 'none';
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = clamp01(env.streak) * 0.9;
      ctx.drawImage(this.streak2, 0, 0, sw, sh, 0, 0, W, H);
      ctx.restore();
    }

    // colour grade
    const f = FILTERS[env.filter] || FILTERS.NEUTRAL;
    const amt = clamp01(env.filterIntensity) * f.amt;
    if (amt > 0.01) {
      if (f.sat > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'saturation';
        ctx.globalAlpha = clamp01(f.sat * amt * 1.4);
        ctx.fillStyle = '#808080';
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }
      ctx.save();
      ctx.globalCompositeOperation = f.mode;
      ctx.globalAlpha = amt * 0.85;
      ctx.fillStyle = f.tint;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    // exposure / contrast lift
    if (Math.abs(env.brightness - 1) > 0.01) {
      ctx.save();
      if (env.brightness > 1) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = clamp01((env.brightness - 1) * 0.34);
        ctx.fillStyle = '#3a4450';
      } else {
        ctx.globalCompositeOperation = 'multiply';
        ctx.globalAlpha = clamp01((1 - env.brightness) * 1.1);
        ctx.fillStyle = '#000';
      }
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    // vignette
    if (env.vignette > 0.01) {
      const g = ctx.createRadialGradient(W * 0.5, H * 0.52, Math.min(W, H) * 0.22, W * 0.5, H * 0.52, Math.max(W, H) * 0.78);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.62, 'rgba(0,0,0,' + (0.16 * env.vignette).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(0,0,0,' + (0.86 * env.vignette).toFixed(3) + ')');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    // grain
    if (env.grain > 0.01) {
      ctx.save();
      ctx.globalCompositeOperation = 'overlay';
      ctx.globalAlpha = clamp01(env.grain) * 0.30;
      const gs = 128;
      const ox = -Math.floor(Math.random() * gs), oy = -Math.floor(Math.random() * gs);
      for (let y = oy; y < H; y += gs) for (let x = ox; x < W; x += gs) ctx.drawImage(this.grain, x, y);
      ctx.restore();
    }

    // scanlines
    if (env.scanlines > 0.01) {
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = clamp01(env.scanlines) * 0.5;
      ctx.fillStyle = '#000';
      const step = Math.max(2, Math.round(2 * this.scale));
      for (let y = 0; y < H; y += step * 2) ctx.fillRect(0, y, W, step);
      ctx.restore();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
}
