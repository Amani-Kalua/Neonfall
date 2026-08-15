/* ============================================================
   NEONFALL — weather.js
   Rain / ash particles in world space, lightning, wet sheen.
   ============================================================ */
'use strict';

class Weather {
  constructor() {
    this.n = 0;
    this.cap = 1400;
    this.x = new Float32Array(this.cap);
    this.y = new Float32Array(this.cap);
    this.z = new Float32Array(this.cap);
    this.vy = new Float32Array(this.cap);
    this.vx = new Float32Array(this.cap);
    this.vz = new Float32Array(this.cap);
    this.sz = new Float32Array(this.cap);
    this.kind = 0;               // 0 none, 1 rain, 2 ash
    this.flash = 0;
    this.nextFlash = 6;
    this.spawnR = 60;
    this.topY = 78;
  }

  configure(env, cam) {
    const rain = env.rain, snow = env.snow;
    let want = 0, kind = 0;
    if (rain > 0.01) { kind = 1; want = Math.min(this.cap, Math.round(620 * rain)); }
    else if (snow > 0.01) { kind = 2; want = Math.min(this.cap, Math.round(340 * snow)); }
    if (kind !== this.kind) { this.n = 0; this.kind = kind; }
    if (want > this.n) {
      for (let i = this.n; i < want; i++) this.respawn(i, cam, true);
      this.n = want;
    } else if (want < this.n) {
      this.n = want;
    }
  }

  respawn(i, cam, anywhere) {
    const a = Math.random() * TAU;
    const r = Math.sqrt(Math.random()) * this.spawnR;
    this.x[i] = cam.px + Math.cos(a) * r;
    this.z[i] = cam.pz + Math.sin(a) * r;
    this.y[i] = anywhere ? Math.random() * this.topY : this.topY * (0.85 + Math.random() * 0.3);
    if (this.kind === 1) {
      this.vy[i] = -(52 + Math.random() * 34);
      this.vx[i] = (Math.random() - 0.5) * 6;
      this.vz[i] = (Math.random() - 0.5) * 6;
      this.sz[i] = 0.5 + Math.random() * 0.9;
    } else {
      this.vy[i] = -(3.5 + Math.random() * 5);
      this.vx[i] = (Math.random() - 0.5) * 5;
      this.vz[i] = (Math.random() - 0.5) * 5;
      this.sz[i] = 0.5 + Math.random() * 1.1;
    }
  }

  update(dt, env, cam) {
    this.configure(env, cam);
    const wind = env.windSpeed * (this.kind === 1 ? 5 : 3);
    const wx = Math.cos(env.time * 0.13) * wind;
    const wz = Math.sin(env.time * 0.11) * wind;
    for (let i = 0; i < this.n; i++) {
      this.y[i] += this.vy[i] * dt;
      this.x[i] += (this.vx[i] + wx) * dt;
      this.z[i] += (this.vz[i] + wz) * dt;
      if (this.kind === 2) {
        this.x[i] += Math.sin(env.time * 1.4 + i) * dt * 2.2;
        this.z[i] += Math.cos(env.time * 1.1 + i * 1.7) * dt * 2.2;
      }
      const dx = this.x[i] - cam.px, dz = this.z[i] - cam.pz;
      if (this.y[i] < 0 || dx * dx + dz * dz > this.spawnR * this.spawnR * 1.4) this.respawn(i, cam, false);
    }
    // lightning
    if (env.rain > 1.5) {
      this.nextFlash -= dt;
      if (this.nextFlash <= 0) { this.flash = 1; this.nextFlash = 7 + Math.random() * 18; }
    }
    this.flash = Math.max(0, this.flash - dt * 3.4);
  }

  draw(r) {
    if (this.n === 0) return;
    const cam = r.cam, ctx = r.ctx, env = r.env;
    ctx.save();
    if (this.kind === 1) {
      ctx.strokeStyle = 'rgba(190,214,238,0.34)';
      ctx.lineWidth = Math.max(0.5, 0.9 * r.scale);
      ctx.beginPath();
      for (let i = 0; i < this.n; i++) {
        const t = cam.toCam(this.x[i], this.y[i], this.z[i], _wtmp);
        if (t.z < 0.6 || t.z > 90) continue;
        const iz = cam.f / t.z;
        const sx = cam.cx + t.x * iz, sy = cam.cy - t.y * iz;
        if (sx < -20 || sx > r.w + 20 || sy < -20 || sy > r.h + 20) continue;
        const len = (this.sz[i] * 2.4 + 1.4) * iz * 0.55;
        const dxs = (this.vx[i] * 0.02) * iz;
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx - dxs, sy + len);
      }
      ctx.stroke();
      // near-camera streaks, brighter
      ctx.strokeStyle = 'rgba(215,235,255,0.20)';
      ctx.lineWidth = Math.max(0.7, 1.7 * r.scale);
      ctx.beginPath();
      for (let i = 0; i < this.n; i += 3) {
        const t = cam.toCam(this.x[i], this.y[i], this.z[i], _wtmp);
        if (t.z < 0.6 || t.z > 18) continue;
        const iz = cam.f / t.z;
        const sx = cam.cx + t.x * iz, sy = cam.cy - t.y * iz;
        const len = (this.sz[i] * 3 + 2) * iz * 0.5;
        ctx.moveTo(sx, sy); ctx.lineTo(sx - this.vx[i] * 0.03 * iz, sy + len);
      }
      ctx.stroke();
    } else {
      for (let i = 0; i < this.n; i++) {
        const t = cam.toCam(this.x[i], this.y[i], this.z[i], _wtmp);
        if (t.z < 0.6 || t.z > 120) continue;
        const iz = cam.f / t.z;
        const sx = cam.cx + t.x * iz, sy = cam.cy - t.y * iz;
        if (sx < -10 || sx > r.w + 10 || sy < -10 || sy > r.h + 10) continue;
        const rr = Math.max(0.5, this.sz[i] * 0.30 * iz);
        const fg = clamp01(r.fog(t.z, this.y[i]));
        ctx.fillStyle = 'rgba(206,206,200,' + (0.30 * (1 - fg * 0.6)).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(sx, sy, rr, 0, TAU); ctx.fill();
      }
    }
    ctx.restore();

    if (this.flash > 0.01) {
      const a = Math.pow(this.flash, 2) * 0.30;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createLinearGradient(0, 0, 0, r.h);
      g.addColorStop(0, 'rgba(180,205,240,' + a.toFixed(3) + ')');
      g.addColorStop(0.7, 'rgba(150,175,215,' + (a * 0.35).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, r.w, r.h);
      ctx.restore();
    }
  }
}

const _wtmp = { x: 0, y: 0, z: 0 };
