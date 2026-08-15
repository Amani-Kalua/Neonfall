/* ============================================================
   NEONFALL — city.js
   The city: placed megastructures, reactive procedural filler,
   skyways, street lamps, environment state, save / load.
   ============================================================ */
'use strict';

/* ---------------- environment presets ---------------- */

/* sky/fog keyframes across a 24h day. */
const SKY_KEYS = [
  { t: 0.0, skyTop: '#05070c', skyHorizon: '#0d1220', fog: '#0b1018', ground: '#05070a', sun: '#9fb6e0', sunS: 0.30, moon: true, star: 0.9, haze: '#243348', hazeAmt: 0.30, amb: 0.20 },
  { t: 4.5, skyTop: '#070a12', skyHorizon: '#161d2c', fog: '#131a26', ground: '#070a0e', sun: '#c3cfe6', sunS: 0.35, moon: true, star: 0.55, haze: '#2b3a52', hazeAmt: 0.32, amb: 0.24 },
  { t: 6.2, skyTop: '#1d2438', skyHorizon: '#5b4a56', fog: '#3c3742', ground: '#100f14', sun: '#ff9a6a', sunS: 0.75, moon: false, star: 0.12, haze: '#6b4a52', hazeAmt: 0.36, amb: 0.42 },
  { t: 8.0, skyTop: '#39485e', skyHorizon: '#8d8b86', fog: '#6d6f70', ground: '#191b1e', sun: '#ffd3a1', sunS: 0.85, moon: false, star: 0.0, haze: '#8a8478', hazeAmt: 0.24, amb: 0.68 },
  { t: 12.0, skyTop: '#5c6d84', skyHorizon: '#b3b5b0', fog: '#93969a', ground: '#22252a', sun: '#fff6e2', sunS: 0.95, moon: false, star: 0.0, haze: '#a8a9a2', hazeAmt: 0.18, amb: 0.90 },
  { t: 16.0, skyTop: '#4e5c74', skyHorizon: '#a89a86', fog: '#83807c', ground: '#1e2024', sun: '#ffe0b0', sunS: 0.90, moon: false, star: 0.0, haze: '#9c8e7a', hazeAmt: 0.22, amb: 0.76 },
  { t: 18.6, skyTop: '#2b3348', skyHorizon: '#94654e', fog: '#4e464e', ground: '#15141a', sun: '#ff8b45', sunS: 0.90, moon: false, star: 0.06, haze: '#8a5a44', hazeAmt: 0.40, amb: 0.44 },
  { t: 20.2, skyTop: '#131a2a', skyHorizon: '#4a3446', fog: '#2c2733', ground: '#0c0c11', sun: '#ff6a4a', sunS: 0.50, moon: false, star: 0.35, haze: '#5a3448', hazeAmt: 0.42, amb: 0.30 },
  { t: 22.0, skyTop: '#080c15', skyHorizon: '#1c2032', fog: '#151a26', ground: '#07080d', sun: '#8fa8d8', sunS: 0.28, moon: true, star: 0.75, haze: '#2c3850', hazeAmt: 0.34, amb: 0.22 },
  { t: 24.0, skyTop: '#05070c', skyHorizon: '#0d1220', fog: '#0b1018', ground: '#05070a', sun: '#9fb6e0', sunS: 0.30, moon: true, star: 0.9, haze: '#243348', hazeAmt: 0.30, amb: 0.20 }
];

const WEATHERS = {
  CLEAR: { name: 'CLEAR', fogMul: 0.62, cloud: 0.20, rain: 0, snow: 0, mist: 26, wind: 0.6, hazeMul: 1.0 },
  HAZE: { name: 'HAZE', fogMul: 1.00, cloud: 0.45, rain: 0, snow: 0, mist: 34, wind: 0.5, hazeMul: 1.15 },
  SMOG: { name: 'SMOG', fogMul: 1.55, cloud: 0.72, rain: 0, snow: 0, mist: 46, wind: 0.35, hazeMul: 1.3 },
  RAIN: { name: 'RAIN', fogMul: 1.25, cloud: 0.85, rain: 1.0, snow: 0, mist: 40, wind: 1.4, hazeMul: 1.1 },
  DOWNPOUR: { name: 'DOWNPOUR', fogMul: 1.85, cloud: 1.0, rain: 2.1, snow: 0, mist: 54, wind: 2.4, hazeMul: 1.0 },
  ASH: { name: 'ASH', fogMul: 1.45, cloud: 0.8, rain: 0, snow: 1.5, mist: 44, wind: 0.9, hazeMul: 1.25 }
};

function sampleSky(t) {
  t = ((t % 24) + 24) % 24;
  let a = SKY_KEYS[0], b = SKY_KEYS[SKY_KEYS.length - 1];
  for (let i = 0; i < SKY_KEYS.length - 1; i++) {
    if (t >= SKY_KEYS[i].t && t <= SKY_KEYS[i + 1].t) { a = SKY_KEYS[i]; b = SKY_KEYS[i + 1]; break; }
  }
  const f = smoothstep(invLerp(a.t, b.t, t));
  const mixHex = (h1, h2) => rgbToHex(mixRgb(hexToRgb(h1), hexToRgb(h2), f));
  return {
    skyTop: mixHex(a.skyTop, b.skyTop),
    skyHorizon: mixHex(a.skyHorizon, b.skyHorizon),
    fogColor: mixHex(a.fog, b.fog),
    groundColor: mixHex(a.ground, b.ground),
    sunColor: mixHex(a.sun, b.sun),
    sunStrength: lerp(a.sunS, b.sunS, f),
    sunIsMoon: f < 0.5 ? a.moon : b.moon,
    starAmount: lerp(a.star, b.star, f),
    hazeColor: mixHex(a.haze, b.haze),
    hazeAmount: lerp(a.hazeAmt, b.hazeAmt, f),
    ambient: lerp(a.amb, b.amb, f)
  };
}

/* ---------------- environment ---------------- */

class Env {
  constructor() {
    this.timeOfDay = 21.4;      // hours
    this.timeFlow = 0;          // hours per second
    this.weather = 'HAZE';
    this.time = 0;              // animation clock, seconds
    this.fogDensityBase = 0.0078;
    this.fogStart = 46;
    this.mistHeight = 30;
    this.mistBase = 0.18;
    this.bloom = 0.80;
    this.bloomThreshold = 0.55;
    this.streak = 0.30;
    this.streakThreshold = 0.80;
    this.filter = 'NEUTRAL';
    this.filterIntensity = 0.30;
    this.brightness = 1.0;
    this.vignette = 0.75;
    this.grain = 0.30;
    this.scanlines = 0.0;
    this.windowGlow = 1.0;
    this.neonGlow = 1.0;
    this.trafficAmount = 0.9;
    this.cloudColor = '#8f98a6';
    this.farSkylineFog = 1.0;
    this.sunDir = { x: 0.4, y: 0.3, z: 0.8 };
    this.sunAzimuth = 0.9;
    this.apply();
  }

  apply() {
    const s = sampleSky(this.timeOfDay);
    Object.assign(this, s);
    const w = WEATHERS[this.weather] || WEATHERS.HAZE;
    this.fogDensity = this.fogDensityBase * w.fogMul;
    this.cloudAmount = w.cloud;
    this.rain = w.rain;
    this.snow = w.snow;
    this.mistHeightEff = w.mist;
    this.mistHeight = w.mist;
    this.windSpeed = w.wind;
    this.hazeAmount *= w.hazeMul;
    this.cloudColor = rgbToHex(mixRgb(hexToRgb(this.skyHorizon), { r: 255, g: 255, b: 255 }, 0.18));
    // sun direction from time of day
    const h = ((this.timeOfDay % 24) + 24) % 24;
    const elev = Math.sin((h - 6) / 12 * Math.PI);           // +1 at noon, -1 at midnight
    const az = this.sunAzimuth + (h / 24) * TAU;
    const ce = Math.cos(Math.asin(clamp(elev, -1, 1)));
    if (elev < -0.02) {
      // moon: opposite side, gentle elevation
      const mel = Math.sin((h + 12 - 6) / 12 * Math.PI);
      const mce = Math.cos(Math.asin(clamp(mel, -1, 1)));
      this.sunDir = { x: Math.sin(az + Math.PI) * mce, y: Math.max(0.06, mel), z: Math.cos(az + Math.PI) * mce };
      this.sunIsMoon = true;
    } else {
      this.sunDir = { x: Math.sin(az) * ce, y: elev, z: Math.cos(az) * ce };
      this.sunIsMoon = false;
    }
  }

  tick(dt) {
    this.time += dt;
    if (this.timeFlow !== 0) {
      this.timeOfDay = (this.timeOfDay + this.timeFlow * dt) % 24;
      this.apply();
    }
  }

  serialize() {
    return {
      timeOfDay: +this.timeOfDay.toFixed(2), timeFlow: this.timeFlow, weather: this.weather,
      fogDensityBase: this.fogDensityBase, bloom: this.bloom, bloomThreshold: this.bloomThreshold,
      streak: this.streak, streakThreshold: this.streakThreshold, filter: this.filter,
      filterIntensity: this.filterIntensity, brightness: this.brightness, vignette: this.vignette,
      grain: this.grain, scanlines: this.scanlines, windowGlow: this.windowGlow,
      neonGlow: this.neonGlow, trafficAmount: this.trafficAmount
    };
  }
  load(o) {
    if (!o) return;
    for (const k of ['timeOfDay', 'timeFlow', 'weather', 'fogDensityBase', 'bloom', 'bloomThreshold', 'streak',
      'streakThreshold', 'filter', 'filterIntensity', 'brightness', 'vignette', 'grain',
      'scanlines', 'windowGlow', 'neonGlow', 'trafficAmount']) {
      if (o[k] !== undefined) this[k] = o[k];
    }
    this.apply();
  }
}

/* ---------------- city ---------------- */

class City {
  constructor(seed) {
    this.seed = seed || ((Math.random() * 1e9) | 0);
    this.cell = 4;              // grid cell size in world units
    this.radius = 230;          // buildable radius
    this.buildings = [];        // player-placed megastructures
    this.filler = [];           // procedural
    this.decos = [];
    this.lamps = [];
    this.traffic = new Traffic();
    this.env = new Env();
    this.name = 'UNTITLED';
    this.stats = { placed: 0, decorated: 0, painted: 0 };
    this.unlocked = {};
    this.dirty = true;
    this.traffic.rebuild(this);
    this.buildLamps();
  }

  /* ---- lamps along the implied street grid, only where the city exists ---- */
  buildLamps() {
    this.lamps.length = 0;
    const rnd = mulberry32(this.seed * 17 + 3);
    const step = this.cell * 4;
    const near = 58;
    if (!this.buildings.length) return;
    let minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9;
    for (const b of this.buildings) {
      minx = Math.min(minx, b.x - near); maxx = Math.max(maxx, b.x + near);
      minz = Math.min(minz, b.z - near); maxz = Math.max(maxz, b.z + near);
    }
    for (let gx = Math.floor(minx / step) * step; gx <= maxx; gx += step) {
      for (let gz = Math.floor(minz / step) * step; gz <= maxz; gz += step) {
        if (Math.hypot(gx, gz) > this.radius) continue;
        let d2 = 1e9;
        for (const b of this.buildings) d2 = Math.min(d2, Math.hypot(b.x - gx, b.z - gz));
        if (d2 > near) continue;
        const p = 0.75 * (1 - d2 / near) + 0.12;
        if (rnd() < p) {
          this.lamps.push({ x: gx + (rnd() - 0.5) * 3, z: gz + (rnd() - 0.5) * 3, h: 5 + rnd() * 3, col: rnd() < 0.72 ? '#ffcf94' : '#9fd9ff' });
        }
      }
    }
  }

  /* ---- occupancy ---- */
  occupied(x, z, w, d, ignoreId) {
    const r = Math.max(w, d) * 0.5;
    for (const b of this.buildings) {
      if (ignoreId && b.id === ignoreId) continue;
      const dd = Math.hypot(b.x - x, b.z - z);
      if (dd < r + b.radius * 0.78) return true;
    }
    return false;
  }

  /* ---- placement ---- */
  place(dk, x, z, opts) {
    opts = opts || {};
    const D = DISTRICTS[dk];
    const seed = opts.seed === undefined ? ((Math.random() * 1e9) | 0) : opts.seed;
    const rnd = mulberry32(seed);
    const b = new Building({
      dk: dk, x: x, z: z,
      rot: opts.rot === undefined ? Math.round(rnd() * 4) * (Math.PI / 2) : opts.rot,
      w: opts.w === undefined ? lerp(D.fw[0], D.fw[1], rnd()) : opts.w,
      d: opts.d === undefined ? lerp(D.fd[0], D.fd[1], rnd()) : opts.d,
      h: opts.h === undefined ? lerp(D.h[0], D.h[1], Math.pow(rnd(), 0.85)) : opts.h,
      variant: opts.variant === undefined ? Math.floor(rnd() * D.variants) : opts.variant,
      seed: seed,
      lights: opts.lights === undefined ? 0 : opts.lights
    });
    this.buildings.push(b);
    this.stats.placed++;
    this.dirty = true;
    this.regenFiller();
    return b;
  }

  remove(b) {
    let i = this.buildings.indexOf(b);
    if (i >= 0) { this.buildings.splice(i, 1); this.dirty = true; this.regenFiller(); return true; }
    i = this.filler.indexOf(b);
    if (i >= 0) { this.filler.splice(i, 1); b.suppressed = true; this.dirty = true; return true; }
    return false;
  }

  removeDeco(d) {
    const i = this.decos.indexOf(d);
    if (i >= 0) { this.decos.splice(i, 1); this.dirty = true; return true; }
    return false;
  }

  /* ---------------------------------------------------------
     Reactive filler: procedural low-rise that grows around
     what the player has placed. Taller placements raise their
     neighbours; gaps between placements fill with small blocks.
     --------------------------------------------------------- */
  regenFiller() {
    this.filler.length = 0;
    if (this.buildings.length === 0) { this.traffic.rebuild(this); return; }

    const cell = this.cell;
    const infl = 70;               // influence radius of a megastructure
    // grid bounds from placed buildings
    let minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9;
    for (const b of this.buildings) {
      minx = Math.min(minx, b.x - infl); maxx = Math.max(maxx, b.x + infl);
      minz = Math.min(minz, b.z - infl); maxz = Math.max(maxz, b.z + infl);
    }
    const gx0 = Math.floor(minx / cell), gx1 = Math.ceil(maxx / cell);
    const gz0 = Math.floor(minz / cell), gz1 = Math.ceil(maxz / cell);
    const maxCells = 190;
    const budget = 1500;
    let made = 0;

    for (let gx = gx0; gx <= gx1 && made < budget; gx++) {
      for (let gz = gz0; gz <= gz1 && made < budget; gz++) {
        if (gx1 - gx0 > maxCells || gz1 - gz0 > maxCells) break;
        const cx = gx * cell + cell * 0.5;
        const cz = gz * cell + cell * 0.5;
        if (Math.hypot(cx, cz) > this.radius) continue;

        // street grid: leave lanes empty every 4th cell
        if (((gx % 4) + 4) % 4 === 0 || ((gz % 4) + 4) % 4 === 0) continue;

        // influence: nearest placed buildings
        let dens = 0, hSum = 0, hW = 0, nearest = 1e9, dk = null;
        for (const b of this.buildings) {
          const dd = Math.hypot(b.x - cx, b.z - cz);
          if (dd > infl) continue;
          const w = 1 - dd / infl;
          const w2 = w * w;
          dens += w2;
          hSum += b.h * w2; hW += w2;
          if (dd < nearest) { nearest = dd; dk = b.dk; }
        }
        if (dens < 0.06 || !dk) continue;

        const hv = hash2(gx, gz, this.seed);
        // sparser toward the edge of influence
        if (hv > clamp01(0.30 + dens * 1.15)) continue;

        // do not overlap the megastructures themselves
        let blocked = false;
        for (const b of this.buildings) {
          if (Math.hypot(b.x - cx, b.z - cz) < b.radius + cell * 0.55) { blocked = true; break; }
        }
        if (blocked) continue;

        const D = DISTRICTS[dk];
        const neighAvg = hW > 0 ? hSum / hW : 20;
        const hn = hash2(gx * 3 + 7, gz * 5 + 11, this.seed + 1);
        const hr = hash2(gx * 11 + 3, gz * 7 + 13, this.seed + 2);
        // height driven by neighbour height, density and noise
        // mostly noise, only lightly pulled by density and neighbour height —
        // otherwise the filler forms a smooth dome around the core
        let h = lerp(D.fillerH[0], D.fillerH[1], Math.pow(hn, 1.9));
        h *= lerp(0.80, 1.14, clamp01(dens)) * lerp(0.82, 1.20, clamp01(neighAvg / 90));
        // occasional outlier tower breaks the skyline up
        if (hash2(gx * 5, gz * 3, this.seed + 21) < 0.05) h *= 1.7 + hash2(gx, gz, this.seed + 22);
        h = clamp(h, 4, D.fillerH[1] * 2.4);

        const w = cell * lerp(0.55, 0.86, hr);
        const d = cell * lerp(0.55, 0.86, hash2(gx + 91, gz + 17, this.seed + 4));

        const b = new Building({
          dk: dk, x: cx + (hr - 0.5) * cell * 0.22, z: cz + (hn - 0.5) * cell * 0.22,
          rot: (hash2(gx, gz, this.seed + 8) < 0.14) ? hash2(gx, gz, this.seed + 9) * 0.5 : 0,
          w: w, d: d, h: h,
          variant: hash2(gx, gz, this.seed + 5) < 0.5 ? 0 : 1,
          seed: (hash2(gx, gz, this.seed + 6) * 1e9) | 0,
          lights: 0, filler: true
        });
        // filler inherits the local light level from nearby placed buildings
        let lsum = 0, lw = 0;
        for (const p of this.buildings) {
          const dd = Math.hypot(p.x - cx, p.z - cz);
          if (dd > infl) continue;
          const ww = 1 - dd / infl;
          lsum += p.lights * ww * ww; lw += ww * ww;
        }
        b.lights = lw > 0 ? clamp01(lsum / lw * 0.85) : 0;
        this.filler.push(b);
        made++;
      }
    }
    this.autoSkyways();
    this.traffic.rebuild(this);
    this.buildLamps();
  }

  /* auto skyways between close, tall placed towers */
  autoSkyways() {
    this.autoLinks = [];
    const bs = this.buildings;
    for (let i = 0; i < bs.length; i++) {
      for (let j = i + 1; j < bs.length; j++) {
        const a = bs[i], b = bs[j];
        if (a.top < 30 || b.top < 30) continue;
        const dd = Math.hypot(a.x - b.x, a.z - b.z);
        const gap = dd - a.radius - b.radius;
        if (gap < 4 || gap > 30) continue;
        if (hash2(a.id, b.id, this.seed) > 0.45) continue;
        const y = Math.min(a.top, b.top) * lerp(0.45, 0.85, hash2(a.id + 3, b.id + 5, this.seed));
        this.autoLinks.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, y: y, ar: a.radius, br: b.radius });
      }
    }
  }

  /* ---- light brush ---- */
  paintLights(x, z, rad, amount) {
    let n = 0;
    const all = this.buildings.concat(this.filler);
    for (const b of all) {
      const dd = Math.hypot(b.x - x, b.z - z);
      if (dd > rad + b.radius * 0.5) continue;
      const f = clamp01(1 - dd / (rad + b.radius * 0.5));
      const before = b.lights;
      b.lights = clamp01(b.lights + amount * (0.35 + f * 0.65));
      if (Math.abs(b.lights - before) > 0.001) { n++; }
    }
    if (n) { this.stats.painted += n; this.dirty = true; }
    return n;
  }

  /* ---- picking ---- */
  pickBuilding(ray, includeFiller) {
    let best = null, bestT = 1e9;
    const test = (list) => {
      for (const b of list) {
        const h = b.hitTest(ray);
        if (h && h.t < bestT) { bestT = h.t; best = { b: b, hit: h }; }
      }
    };
    test(this.buildings);
    if (includeFiller) test(this.filler);
    return best;
  }

  pickDeco(ray) {
    let best = null, bestT = 1e9;
    for (const d of this.decos) {
      const R = decoRadius(d);
      const ox = ray.ox - d.x, oy = ray.oy - d.y, oz = ray.oz - d.z;
      const b2 = 2 * (ox * ray.dx + oy * ray.dy + oz * ray.dz);
      const c = ox * ox + oy * oy + oz * oz - R * R;
      const disc = b2 * b2 - 4 * c;
      if (disc < 0) continue;
      const t = (-b2 - Math.sqrt(disc)) / 2;
      if (t > 0.2 && t < bestT) { bestT = t; best = d; }
    }
    return best;
  }

  /* ---- stats / unlocks ---- */
  unlockLevel() { return this.stats.placed + Math.floor(this.stats.decorated * 0.8) + Math.floor(this.stats.painted / 40); }

  availableDecos() {
    const lvl = this.unlockLevel();
    return DECO_TYPES.filter(d => lvl >= d.unlock);
  }

  /* ---- serialization ---- */
  serialize() {
    return {
      v: 2, seed: this.seed, name: this.name,
      buildings: this.buildings.map(b => b.serialize()),
      decos: this.decos.map(d => d.serialize()),
      env: this.env.serialize(),
      stats: this.stats
    };
  }

  static deserialize(o) {
    const c = new City(o.seed);
    c.name = o.name || 'UNTITLED';
    if (o.stats) c.stats = Object.assign(c.stats, o.stats);
    for (const bo of (o.buildings || [])) {
      const b = new Building({
        dk: bo.dk, x: bo.x, z: bo.z, rot: bo.rot, w: bo.w, d: bo.d, h: bo.h,
        variant: bo.variant, seed: bo.seed, lights: bo.lights
      });
      c.buildings.push(b);
    }
    for (const dob of (o.decos || [])) c.decos.push(new Deco(dob));
    c.env.load(o.env);
    c.regenFiller();
    c.dirty = true;
    return c;
  }
}

/* ---------------- drawing the whole city ---------------- */

function drawCity(r, city, sel, hover) {
  const cam = r.cam, env = city.env;
  const cullDist = 520;

  // street lamps
  for (const L of city.lamps) {
    const dx = L.x - cam.px, dz = L.z - cam.pz;
    if (dx * dx + dz * dz > cullDist * cullDist) continue;
    const t = cam.toCam(L.x, L.h, L.z, r._tmpA);
    if (t.z < 1) continue;
    r.push(t.z + 0.2, (function (L) {
      return function (rr) {
        line3(rr, L.x, 0, L.z, L.x, L.h, L.z, '#0a0c10', 1.1, false);
        blinker(rr, L.x, L.h, L.z, L.col, 0.55 * rr.env.neonGlow, 1.9);
      };
    })(L));
  }

  // filler first (cheap, many)
  for (const b of city.filler) {
    const dx = b.x - cam.px, dz = b.z - cam.pz;
    if (dx * dx + dz * dz > cullDist * cullDist) continue;
    drawBuilding(r, b, (hover && hover.b === b) ? '#8fa8c0' : null);
  }
  // placed megastructures
  for (const b of city.buildings) {
    const dx = b.x - cam.px, dz = b.z - cam.pz;
    if (dx * dx + dz * dz > (cullDist * 1.6) * (cullDist * 1.6)) continue;
    let hl = null;
    if (sel && sel.b === b) hl = '#7ce7ff';
    else if (hover && hover.b === b) hl = '#8fa8c0';
    drawBuilding(r, b, hl);
  }
  // auto skyways
  if (city.autoLinks) {
    for (const l of city.autoLinks) {
      const mx = (l.ax + l.bx) * 0.5, mz = (l.az + l.bz) * 0.5;
      const t = cam.toCam(mx, l.y, mz, r._tmpA);
      if (t.z < 1) continue;
      r.push(t.z, (function (l) {
        return function (rr) {
          const ang = Math.atan2(l.bz - l.az, l.bx - l.ax);
          const dx = Math.cos(ang), dz = Math.sin(ang);
          const x0 = l.ax + dx * l.ar * 0.9, z0 = l.az + dz * l.ar * 0.9;
          const x1 = l.bx - dx * l.br * 0.9, z1 = l.bz - dz * l.br * 0.9;
          const w = 2.0, h = 2.4;
          const nx = -dz * w * 0.5, nz = dx * w * 0.5;
          quad3(rr, [x0 + nx, l.y, z0 + nz, x1 + nx, l.y, z1 + nz, x1 + nx, l.y + h, z1 + nz, x0 + nx, l.y + h, z0 + nz], '#0a0c11');
          quad3(rr, [x0 - nx, l.y, z0 - nz, x1 - nx, l.y, z1 - nz, x1 - nx, l.y + h, z1 - nz, x0 - nx, l.y + h, z0 - nz], '#0c0f16');
          quad3(rr, [x0 + nx, l.y + h, z0 + nz, x1 + nx, l.y + h, z1 + nz, x1 - nx, l.y + h, z1 - nz, x0 - nx, l.y + h, z0 - nz], '#10151f');
          const n = 6;
          for (let i = 1; i < n; i++) {
            const f = i / n;
            blinker(rr, lerp(x0, x1, f), l.y + h * 0.5, lerp(z0, z1, f), '#a8d8ff', 0.32 * rr.env.neonGlow, 1.2);
          }
        };
      })(l));
    }
  }
  // decorations
  for (const d of city.decos) {
    const dx = d.x - cam.px, dz = d.z - cam.pz;
    if (dx * dx + dz * dz > (cullDist * 1.4) * (cullDist * 1.4)) continue;
    drawDeco(r, d, sel && sel.d === d);
  }
}
