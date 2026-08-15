/* ============================================================
   NEONFALL — game.js
   Input, tools, editing, progression, saves, photo mode, loop.
   ============================================================ */
'use strict';

const SAVE_INDEX = 'neonfall.saves.v2';
const AUTOSAVE = 'neonfall.autosave.v2';

class Game {
  constructor() {
    this.canvas = $('c');
    this.renderer = new Renderer(this.canvas);
    this.renderer.stripScale = 1;
    this.renderer.lowDetail = false;
    this.cam = new Camera();
    this.audio = new AudioEngine();
    this.weather = new Weather();
    this.city = new City();

    this.tool = 'district';
    this.district = 'CENTRAL';
    this.deco = 'billboard';
    this.lightMode = 1;
    this.brushRadius = 26;
    this.brushFlow = 0.35;

    this.ghost = null;
    this.hover = null;        // {b} or {d}
    this.sel = null;          // {b} or {d}
    this.mouse = { x: 0, y: 0, down: false, button: 0, movedSincePress: 0 };
    this.drag = null;
    this.keys = {};
    this.mods = { shift: false, ctrl: false, alt: false };
    this.photo = false;
    this.photoAspect = 0;
    this.hudHidden = false;
    this.undoStack = [];
    this.redoStack = [];
    this.lastFrame = performance.now();
    this.fpsAcc = 0; this.fpsCount = 0; this.fps = 60;
    this.frameCost = 16;
    this.camMoving = 0;
    this.paintAcc = 0;
    this.menuOpen = true;

    initAds();
    this.loadAudioPrefs();
    UI.init(this);
    UI.buildPalette();
    this.bindDOM();
    this.bindAudioBar();
    this.bindInput();
    this.resize();
    this.rollGhost();
    this.refresh();
    this.setHintForTool();
    requestAnimationFrame(() => this.loop());
  }

  /* -------------------------------------------------- setup */

  bindDOM() {
    $('m-new').onclick = () => this.newCity();
    $('m-cont').onclick = () => {
      const raw = Store.get(AUTOSAVE);
      if (raw) { this.loadRaw(raw); this.closeMenu(); }
      else this.newCity();
    };
    $('m-load').onclick = () => { UI.buildCities(); UI.open('cities'); };
    $('m-help').onclick = () => UI.open('help');
    const cont = $('m-cont');
    if (!Store.get(AUTOSAVE)) { cont.style.opacity = '.35'; }
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('beforeunload', () => { if (!this.menuOpen) this.autosave(); });
    setInterval(() => { if (!this.menuOpen) this.autosave(); }, 30000);
  }

  /* ---------- audio controls ---------- */

  bindAudioBar() {
    const mute = $('ab-mute'), vol = $('ab-vol'), tr = $('ab-track');
    if (!mute || !vol || !tr) return;   // markup missing (stale cached HTML)
    mute.onclick = () => this.toggleMute();
    tr.onclick = () => this.nextTrack();
    // dragging the slider must not also pan the city behind it
    vol.addEventListener('pointerdown', (e) => e.stopPropagation());
    vol.addEventListener('input', () => {
      this.audio.resume();
      if (this.audio.muted && +vol.value > 0) this.audio.muted = false;
      this.audio.setVolume(+vol.value);
      this.saveAudioPrefs();
      UI.updateAudio();
      UI.syncSettings();
    });
    // scrolling over the slider nudges the volume instead of zooming the camera
    vol.addEventListener('wheel', (e) => {
      e.preventDefault(); e.stopPropagation();
      this.setVolume(this.audio.volume - Math.sign(e.deltaY) * 0.05);
    }, { passive: false });
    UI.updateAudio();
  }

  setVolume(v) {
    v = clamp01(v);
    this.audio.resume();
    if (v > 0 && this.audio.muted) this.audio.muted = false;
    this.audio.setVolume(v);
    this.saveAudioPrefs();
    UI.updateAudio();
    UI.syncSettings();
  }

  toggleMute() {
    const a = this.audio;
    a.resume();
    // already silent because the slider is at zero — bring the sound back
    // rather than "muting" something inaudible
    if (a.volume < 0.02) {
      a.muted = false;
      a.setVolume(0.5);
      UI.toast('AUDIO ON', '♫');
      this.saveAudioPrefs();
      UI.updateAudio();
      UI.syncSettings();
      return false;
    }
    const m = a.toggleMute();
    UI.toast(m ? 'AUDIO MUTED' : 'AUDIO ON', '♫');
    this.saveAudioPrefs();
    UI.updateAudio();
    UI.syncSettings();
    return m;
  }

  saveAudioPrefs() {
    Store.set('neonfall.audio', JSON.stringify({
      volume: this.audio.volume, muted: this.audio.muted, track: this.audio.trackIndex
    }));
  }

  loadAudioPrefs() {
    const o = Store.json('neonfall.audio', null);
    if (!o) return;
    if (typeof o.volume === 'number') this.audio.volume = clamp01(o.volume);
    if (typeof o.muted === 'boolean') this.audio.muted = o.muted;
    if (typeof o.track === 'number') this.audio.trackIndex = Math.abs(o.track) % TRACKS.length;
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.resize(w, h, Math.min(window.devicePixelRatio || 1, 2));
    this.cam.setViewport(this.renderer.w, this.renderer.h);
    this.layoutBars();
  }

  /* -------------------------------------------------- input */

  bindInput() {
    const c = this.canvas;
    const pos = (e) => {
      const r = c.getBoundingClientRect();
      // guard against a zero-sized rect (canvas hidden / not yet laid out)
      const s = (r.width > 0 && r.height > 0) ? (this.renderer.w / r.width) : 1;
      const x = (e.clientX - r.left) * s, y = (e.clientY - r.top) * s;
      return { x: isFinite(x) ? x : 0, y: isFinite(y) ? y : 0 };
    };

    c.addEventListener('contextmenu', e => e.preventDefault());

    c.addEventListener('pointerdown', (e) => {
      this.audio.resume();
      c.setPointerCapture(e.pointerId);
      const p = pos(e);
      this.mouse.x = p.x; this.mouse.y = p.y;
      this.mouse.down = true; this.mouse.button = e.button;
      this.mouse.movedSincePress = 0;
      this.onPress(e.button);
    });

    c.addEventListener('pointermove', (e) => {
      const p = pos(e);
      const dx = p.x - this.mouse.x, dy = p.y - this.mouse.y;
      this.mouse.x = p.x; this.mouse.y = p.y;
      if (this.mouse.down) this.mouse.movedSincePress += Math.abs(dx) + Math.abs(dy);
      this.onMove(dx, dy);
    });

    const up = (e) => {
      if (!this.mouse.down) return;
      this.mouse.down = false;
      this.onRelease();
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);

    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const f = Math.exp(clamp(e.deltaY, -180, 180) * 0.0012);
      this.cam.zoomBy(f);
    }, { passive: false });

    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => { this.keys = {}; this.mods = { shift: false, ctrl: false, alt: false }; });
  }

  onKey(e, down) {
    this.mods.shift = e.shiftKey; this.mods.ctrl = e.ctrlKey || e.metaKey; this.mods.alt = e.altKey;
    const k = e.key.toLowerCase();
    if (down && (e.target.tagName === 'INPUT')) return;
    this.keys[k] = down;
    if (!down) return;
    this.audio.resume();

    if (this.menuOpen) {
      if (k === 'escape') { if (Store.get(AUTOSAVE) || this.city.buildings.length) this.closeMenu(); }
      return;
    }

    switch (k) {
      case '1': this.setTool('district'); break;
      case '2': this.setTool('decor'); break;
      case '3': this.setTool('light'); break;
      case '4': this.setTool('bulldoze'); break;
      case 'r': this.rollGhost(true); break;
      case 'z': e.preventDefault(); this.undo(); break;
      case 'x': this.redo(); break;
      case 'c': UI.toggle('settings'); break;
      case 'p': this.togglePhoto(); break;
      case 'm': this.toggleMute(); break;
      case 'n': this.nextTrack(); break;
      case 'i': this.openScreenPicker(); break;
      case '[': this.brushRadius = clamp(this.brushRadius - 4, 6, 90); UI.refreshRail(); break;
      case ']': this.brushRadius = clamp(this.brushRadius + 4, 6, 90); UI.refreshRail(); break;
      case ' ': e.preventDefault(); this.primaryAction(); break;
      case 'delete': case 'backspace': this.deleteSelection(); break;
      case 'escape':
        if (UI.isOpen('help')) UI.close('help');
        else if (UI.isOpen('cities')) UI.close('cities');
        else if (UI.isOpen('adpick')) UI.close('adpick');
        else if (UI.isOpen('settings')) UI.close('settings');
        else if (this.photo) this.togglePhoto();
        else if (this.sel) { this.sel = null; }
        else this.openMenu();
        break;
      case '+': case '=': this.cam.zoomBy(0.86); break;
      case '-': case '_': this.cam.zoomBy(1.16); break;
      case 'f': break;
    }
    if (e.key === 'F1') { e.preventDefault(); UI.toggle('help'); }
    if (e.key === 'F3') { e.preventDefault(); this.toggleHud(); }
    if (e.key === 'F5') { e.preventDefault(); this.save(); }
  }

  cameraKeys(dt) {
    if (this.menuOpen) return;
    const sp = this.cam.dist * 0.55 * dt * (this.mods.shift ? 2.2 : 1);
    let mx = 0, mz = 0;
    if (this.keys['w'] || this.keys['arrowup']) mz += sp;
    if (this.keys['s'] || this.keys['arrowdown']) mz -= sp;
    if (this.keys['a'] || this.keys['arrowleft']) mx -= sp;
    if (this.keys['d'] || this.keys['arrowright']) mx += sp;
    if (mx || mz) { this.cam.pan(mx, mz); this.camMoving = 0.35; }
    if (this.keys['q']) { this.cam.tyaw -= dt * 0.85; this.camMoving = 0.35; }
    if (this.keys['e']) { this.cam.tyaw += dt * 0.85; this.camMoving = 0.35; }
    this.cam.clampTarget(this.city.radius * 0.92);
  }

  /* -------------------------------------------------- pointer logic */

  groundPoint() {
    return this.cam.screenToGround(this.mouse.x, this.mouse.y, 0);
  }

  rayNow() { return this.cam.ray(this.mouse.x, this.mouse.y); }

  onPress(button) {
    if (this.menuOpen) return;
    // orbit with right / middle
    if (button === 1 || button === 2) { this.drag = { mode: 'orbit' }; return; }

    const ray = this.rayNow();

    if (this.tool === 'light') {
      this.pushUndo();
      this.drag = { mode: 'paint' };
      this.paintNow();
      return;
    }
    if (this.tool === 'bulldoze') {
      this.pushUndo();
      this.drag = { mode: 'bulldoze' };
      this.bulldozeNow();
      return;
    }

    // decorations: click an existing deco to select it
    const pd = this.city.pickDeco(ray);
    if (pd && this.tool === 'decor') {
      this.sel = { d: pd };
      this.drag = { mode: 'movedeco', d: pd, startY: pd.y };
      this.pushUndo();
      return;
    }

    // towers: grab-zone editing
    const grab = this.city.pickBuilding(ray, false);
    if (grab && this.tool === 'district') {
      if (this.mods.alt) {   // clone
        this.pushUndo();
        const b = grab.b;
        const gp = this.groundPoint();
        if (gp) {
          const nb = this.city.place(b.dk, gp.x, gp.z, { w: b.w, d: b.d, h: b.h, rot: b.rot, variant: b.variant, lights: b.lights });
          this.sel = { b: nb };
          this.audio.blip('place');
          this.afterMutate();
        }
        return;
      }
      this.sel = { b: grab.b };
      const frac = grab.hit.frac;
      const mode = frac < 0.34 ? 'move' : (frac < 0.72 ? 'rotate' : 'height');
      const gp = this.groundPoint();
      this.pushUndo();
      this.drag = {
        mode: mode, b: grab.b,
        ox: gp ? grab.b.x - gp.x : 0, oz: gp ? grab.b.z - gp.z : 0,
        rot0: grab.b.rot, h0: grab.b.h, sy: this.mouse.y, sx: this.mouse.x
      };
      UI.hint(mode === 'move' ? 'MOVING — release to set' : mode === 'rotate' ? 'ROTATING' : 'HEIGHT — drag up / down');
      return;
    }

    // empty space: pan, or place on release (click)
    this.drag = { mode: 'pan' };
  }

  onMove(dx, dy) {
    if (this.menuOpen) return;
    const d = this.drag;
    if (!d) return;
    if (!isFinite(dx) || !isFinite(dy)) return;
    // pointer deltas arrive in render pixels; normalise so feel is identical
    // on a retina display and a 1x display
    const s = this.renderer.scale || 1;
    dx /= s; dy /= s;
    if (d.mode === 'orbit') {
      this.cam.tyaw += dx * 0.0075;
      this.cam.tpitch = clamp(this.cam.tpitch + dy * 0.0055, -0.06, 1.32);
      this.camMoving = 0.3;
      return;
    }
    if (d.mode === 'pan') {
      // drag the world under the cursor
      const k = this.cam.dist * 0.0026;
      this.cam.pan(-dx * k, dy * k);
      this.cam.clampTarget(this.city.radius * 0.92);
      this.camMoving = 0.3;
      return;
    }
    if (d.mode === 'paint') { this.paintNow(); return; }
    if (d.mode === 'bulldoze') { this.bulldozeNow(); return; }
    if (d.mode === 'move') {
      const gp = this.groundPoint();
      if (!gp) return;
      let nx = gp.x + d.ox, nz = gp.z + d.oz;
      if (this.mods.ctrl) { const c = this.city.cell; nx = Math.round(nx / c) * c; nz = Math.round(nz / c) * c; }
      d.b.x = clamp(nx, -this.city.radius, this.city.radius);
      d.b.z = clamp(nz, -this.city.radius, this.city.radius);
      d.b.bakeWorld();
      this.city.dirty = true;
      return;
    }
    if (d.mode === 'rotate') {
      let r = d.rot0 + ((this.mouse.x - d.sx) / s) * 0.012;
      if (this.mods.ctrl) r = Math.round(r / (Math.PI / 8)) * (Math.PI / 8);
      d.b.rot = r;
      d.b.bakeWorld();
      this.city.dirty = true;
      return;
    }
    if (d.mode === 'height') {
      const scale = this.cam.dist * 0.0022;
      const nh = clamp(d.h0 - ((this.mouse.y - d.sy) / s) * scale * 1.6, 8, 260);
      d.b.h = nh;
      d.b.rebuild();
      this.city.dirty = true;
      return;
    }
    if (d.mode === 'movedeco') {
      const ray = this.rayNow();
      const host = this.city.pickBuilding(ray, true);
      if (host) {
        const t = host.hit.t;
        d.d.x = ray.ox + ray.dx * t;
        d.d.z = ray.oz + ray.dz * t;
        d.d.y = host.hit.y;
        if (this.isRoofType(d.d.type)) d.d.y = host.b.top;
        d.d.rot = Math.atan2(this.cam.px - d.d.x, this.cam.pz - d.d.z) + Math.PI / 2;
      } else {
        const gp = this.groundPoint();
        if (gp) { d.d.x = gp.x; d.d.z = gp.z; if (!d.d.type.startsWith('holo')) d.d.y = 0; }
      }
      this.city.dirty = true;
    }
  }

  onRelease() {
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    if (d.mode === 'pan' && this.mouse.movedSincePress < 7) {
      this.primaryAction();
      return;
    }
    if (d.mode === 'move' || d.mode === 'height' || d.mode === 'rotate') {
      this.city.regenFiller();
      this.city.dirty = true;
      this.setHintForTool();
    }
    if (d.mode === 'paint' || d.mode === 'bulldoze') this.afterMutate();
    if (d.mode === 'movedeco') this.afterMutate();
  }

  isRoofType(t) { return t === 'helipad' || t === 'antenna' || t === 'tower' || t === 'searchlight'; }

  /* -------------------------------------------------- actions */

  primaryAction() {
    if (this.tool === 'district') this.placeBuilding();
    else if (this.tool === 'decor') this.placeDeco();
    else if (this.tool === 'light') { this.pushUndo(); this.paintNow(); this.afterMutate(); }
    else if (this.tool === 'bulldoze') { this.pushUndo(); this.bulldozeNow(); this.afterMutate(); }
  }

  placeBuilding() {
    const gp = this.groundPoint();
    if (!gp) return;
    let x = gp.x, z = gp.z;
    if (this.mods.ctrl) { const c = this.city.cell; x = Math.round(x / c) * c; z = Math.round(z / c) * c; }
    if (Math.hypot(x, z) > this.city.radius) { UI.toast('OUTSIDE THE PLOT'); return; }
    const g = this.ghost;
    if (!this.mods.shift && this.city.occupied(x, z, g.w, g.d)) { UI.toast('NO ROOM THERE — HOLD SHIFT TO OVERLAP'); return; }
    this.pushUndo();
    const b = this.city.place(this.district, x, z, {
      w: g.w, d: g.d, h: g.h, rot: g.rot, variant: g.variant, seed: g.seed,
      lights: this.city.buildings.length ? this.avgLightsNear(x, z) : 0.55
    });
    this.sel = { b: b };
    this.audio.blip('place');
    this.rollGhost();
    this.afterMutate();
  }

  avgLightsNear(x, z) {
    let s = 0, w = 0;
    for (const b of this.city.buildings) {
      const dd = Math.hypot(b.x - x, b.z - z);
      if (dd > 90) continue;
      const ww = 1 / (1 + dd * 0.05);
      s += b.lights * ww; w += ww;
    }
    return w > 0 ? clamp01(s / w) : 0.5;
  }

  placeDeco() {
    const ray = this.rayNow();
    const host = this.city.pickBuilding(ray, true);
    const type = this.deco;
    let x, y, z, rot;
    if (host) {
      const t = host.hit.t;
      x = ray.ox + ray.dx * t; z = ray.oz + ray.dz * t; y = host.hit.y;
      if (this.isRoofType(type)) y = host.b.top;
      if (type === 'airship') y = Math.max(host.b.top + 14, 40);
      rot = Math.atan2(this.cam.px - x, this.cam.pz - z) + Math.PI / 2;
      // nudge screens slightly off the facade so they don't z-fight
      if (type === 'billboard' || type === 'neonsign') {
        const nx = (x - host.b.x), nz = (z - host.b.z);
        const nl = Math.hypot(nx, nz) || 1;
        x += nx / nl * 0.5; z += nz / nl * 0.5;
      }
    } else {
      const gp = this.groundPoint();
      if (!gp) return;
      x = gp.x; z = gp.z;
      y = type.startsWith('holo') ? 22 : (type === 'airship' ? 62 : 0);
      rot = Math.atan2(this.cam.px - x, this.cam.pz - z) + Math.PI / 2;
    }
    if (Math.hypot(x, z) > this.city.radius * 1.1) return;
    this.pushUndo();
    const D = DISTRICTS[this.district];
    const d = new Deco({
      type: type, x: x, y: y, z: z, rot: rot,
      scale: this.ghost.decoScale,
      col: type.startsWith('holo') ? pick2col(this.ghost.seed) : (type === 'neonsign' ? pick(D.accent, hash1(this.ghost.seed, 7)) : null)
    });
    this.city.decos.push(d);
    this.city.stats.decorated++;
    this.city.dirty = true;
    this.sel = { d: d };
    this.audio.blip('place');
    this.rollGhost();
    this.afterMutate();
  }

  paintNow() {
    const gp = this.groundPoint();
    if (!gp) return;
    let rad = this.brushRadius * (this.mods.shift ? 0.35 : 1);
    let dir = this.lightMode * (this.mods.alt ? -1 : 1);
    const n = this.city.paintLights(gp.x, gp.z, rad, dir * this.brushFlow * 0.16);
    if (n) {
      this.paintAcc += n;
      if (this.paintAcc > 26) { this.paintAcc = 0; this.audio.blip('paint'); }
    }
  }

  bulldozeNow() {
    const ray = this.rayNow();
    const d = this.city.pickDeco(ray);
    const b = this.city.pickBuilding(ray, true);
    // remove whichever is nearer
    let removed = false;
    if (d && (!b || true)) {
      // prefer decorations when the ray hits one
      removed = this.city.removeDeco(d);
      if (removed && this.sel && this.sel.d === d) this.sel = null;
    }
    if (!removed && b) {
      removed = this.city.remove(b.b);
      if (removed && this.sel && this.sel.b === b.b) this.sel = null;
    }
    if (removed) { this.audio.blip('remove'); this.city.dirty = true; }
  }

  deleteSelection() {
    if (!this.sel) return;
    this.pushUndo();
    if (this.sel.b) this.city.remove(this.sel.b);
    if (this.sel.d) this.city.removeDeco(this.sel.d);
    this.sel = null;
    this.audio.blip('remove');
    this.afterMutate();
  }

  lightAll(v) {
    this.pushUndo();
    for (const b of this.city.buildings) b.lights = v;
    for (const b of this.city.filler) b.lights = v * 0.85;
    this.city.dirty = true;
    UI.toast(v > 0 ? 'THE CITY WAKES UP' : 'BLACKOUT');
    this.afterMutate();
  }

  /* -------------------------------------------------- ghost */

  rollGhost(announce) {
    const D = DISTRICTS[this.district];
    const seed = (Math.random() * 1e9) | 0;
    const rnd = mulberry32(seed);
    this.ghost = {
      seed: seed,
      w: lerp(D.fw[0], D.fw[1], rnd()),
      d: lerp(D.fd[0], D.fd[1], rnd()),
      h: lerp(D.h[0], D.h[1], Math.pow(rnd(), 0.85)),
      rot: Math.round(rnd() * 4) * (Math.PI / 2),
      variant: Math.floor(rnd() * D.variants),
      decoScale: 0.8 + rnd() * 0.7
    };
    if (announce && this.tool === 'decor') {
      if (this.sel && this.sel.d) { this.sel.d.ad = (this.sel.d.ad + 1) % ADS.length; this.sel.d.custom = null; this.sel.d.customImg = null; this.city.dirty = true; }
    }
    if (announce) this.audio.blip('ui');
  }

  /* -------------------------------------------------- screens */

  openScreenPicker() {
    if (!this.sel || !this.sel.d) { UI.toast('SELECT A SCREEN FIRST'); return; }
    const t = this.sel.d.type;
    if (t !== 'billboard' && t !== 'holoscreen' && t !== 'airship') { UI.toast('THAT HAS NO SCREEN'); return; }
    UI.open('adpick');
  }

  setScreenContent(adIndex, dataURL) {
    if (!this.sel || !this.sel.d) return;
    this.pushUndo();
    const d = this.sel.d;
    if (dataURL) { d.custom = dataURL; d.loadCustom(); }
    else { d.custom = null; d.customImg = null; d.ad = adIndex; }
    this.city.dirty = true;
    UI.close('adpick');
    UI.toast('SCREEN UPDATED');
  }

  /* -------------------------------------------------- tools / ui */

  setTool(t) {
    this.tool = t;
    if (t === 'district' || t === 'decor') this.rollGhost();
    this.refresh();
    this.setHintForTool();
    this.audio.blip('ui');
    if (t === 'light' || t === 'decor' || t === 'district') UI.buildPalette();
  }

  refresh() { UI.refreshRail(); UI.updateTop(); UI.updateProgress(); }

  setHintForTool() {
    if (this.tool === 'district') {
      UI.hint('<b>CLICK</b> to raise a tower · <b>R</b> reroll silhouette · drag its <b>base</b> move, <b>middle</b> spin, <b>top</b> stretch · <kbd>CTRL</kbd> snap · <kbd>ALT</kbd> clone');
    } else if (this.tool === 'decor') {
      UI.hint('<b>CLICK</b> a building or the ground to attach · <b>R</b> next image · <b>I</b> upload your own · drag to reposition');
    } else if (this.tool === 'light') {
      UI.hint('<b>DRAG</b> across the city to wake the windows · <kbd>SHIFT</kbd> small · <kbd>ALT</kbd> erase · <kbd>[</kbd><kbd>]</kbd> size');
    } else {
      UI.hint('<b>CLICK</b> to demolish · hold to sweep · <kbd>Z</kbd> undo');
    }
  }

  toggleHud() {
    this.hudHidden = !this.hudHidden;
    $('hud').classList.toggle('hidden', this.hudHidden);
  }

  nextTrack() {
    this.audio.resume();
    const n = this.audio.nextTrack();
    UI.toast(n || 'AUDIO OFF', '♫');
    this.saveAudioPrefs();
    UI.updateAudio();
    UI.syncSettings();
  }

  /* -------------------------------------------------- photo mode */

  togglePhoto() {
    this.photo = !this.photo;
    $('hud').classList.toggle('hidden', this.photo || this.hudHidden);
    $('bars').classList.toggle('on', this.photo);
    const pb = $('photobar');
    pb.style.display = this.photo ? 'flex' : 'none';
    if (this.photo) {
      pb.innerHTML = '';
      const aspects = [['FULL', 0], ['16:9', 16 / 9], ['21:9', 21 / 9], ['4:5', 4 / 5], ['1:1', 1]];
      aspects.forEach(([t, v], i) => {
        const b = document.createElement('button');
        b.textContent = t;
        b.className = (this.photoAspect === v) ? 'on' : '';
        b.onclick = () => {
          this.photoAspect = v;
          Array.from(pb.children).forEach(x => x.classList.remove('on'));
          b.classList.add('on');
          this.layoutBars();
        };
        pb.appendChild(b);
      });
      const sep = document.createElement('button');
      sep.textContent = '⤓ SAVE PNG';
      sep.onclick = () => this.savePng();
      pb.appendChild(sep);
      const ex = document.createElement('button');
      ex.textContent = '✕ EXIT';
      ex.onclick = () => this.togglePhoto();
      pb.appendChild(ex);
      // photobar lives outside #hud visibility toggling
      pb.style.zIndex = 12;
      document.body.appendChild(pb);
      this.layoutBars();
      UI.toast('PHOTO MODE — P TO EXIT');
    } else {
      this.layoutBars();
    }
  }

  layoutBars() {
    const a = this.photoAspect;
    const W = window.innerWidth, H = window.innerHeight;
    const bt = $('bt'), bb = $('bb'), bl = $('bl'), br = $('br');
    const zero = () => { for (const e of [bt, bb, bl, br]) { e.style.width = '0'; e.style.height = '0'; } };
    zero();
    if (!this.photo || !a) return;
    const cur = W / H;
    if (cur > a) {   // letterbox left/right
      const w = (W - H * a) / 2;
      bl.style.cssText = 'left:0;top:0;width:' + w + 'px;height:100%';
      br.style.cssText = 'right:0;top:0;width:' + w + 'px;height:100%';
    } else {
      const h = (H - W / a) / 2;
      bt.style.cssText = 'left:0;top:0;width:100%;height:' + h + 'px';
      bb.style.cssText = 'left:0;bottom:0;width:100%;height:' + h + 'px';
    }
  }

  savePng() {
    try {
      const a = document.createElement('a');
      a.download = 'neonfall-' + this.city.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now() + '.png';
      a.href = this.canvas.toDataURL('image/png');
      a.click();
      UI.toast('SAVED TO DOWNLOADS');
    } catch (e) { UI.toast('COULD NOT SAVE'); }
  }

  /* -------------------------------------------------- undo */

  pushUndo() {
    try {
      this.undoStack.push(JSON.stringify(this.city.serialize()));
      if (this.undoStack.length > 30) this.undoStack.shift();
      this.redoStack.length = 0;
    } catch (e) { }
  }

  undo() {
    if (!this.undoStack.length) { UI.toast('NOTHING TO UNDO'); return; }
    this.redoStack.push(JSON.stringify(this.city.serialize()));
    this.applyState(this.undoStack.pop());
    UI.toast('UNDO');
  }

  redo() {
    if (!this.redoStack.length) { UI.toast('NOTHING TO REDO'); return; }
    this.undoStack.push(JSON.stringify(this.city.serialize()));
    this.applyState(this.redoStack.pop());
    UI.toast('REDO');
  }

  applyState(json) {
    const o = JSON.parse(json);
    const env = this.city.env;
    this.city = City.deserialize(o);
    this.city.env = env;                 // keep the current look
    this.sel = null; this.hover = null;
    this.city.dirty = true;
    this.refresh();
  }

  /* -------------------------------------------------- progression */

  afterMutate() {
    const before = this._availCount || 0;
    const avail = this.city.availableDecos().length;
    if (avail > before && before > 0) {
      const lvl = this.city.unlockLevel();
      const just = DECO_TYPES.filter(d => d.unlock <= lvl).slice(before);
      for (const j of just) { UI.toast(j.name, 'UNLOCKED'); this.audio.blip('unlock'); }
      UI.buildPalette();
    }
    this._availCount = avail;
    this.refresh();
  }

  /* -------------------------------------------------- saves */

  listSaves() {
    const idx = Store.json(SAVE_INDEX, []);
    return Array.isArray(idx) ? idx.slice().sort((a, b) => b.at - a.at) : [];
  }

  save() {
    if (!Store.ok) { UI.toast('BROWSER STORAGE UNAVAILABLE — SERVE OVER HTTP TO SAVE'); return; }
    const data = JSON.stringify(this.city.serialize());
    const key = 'neonfall.city.' + (this.saveKey || (this.saveKey = 'c' + Date.now()));
    if (!Store.set(key, data)) { UI.toast('SAVE FAILED — STORAGE FULL'); return; }
    const idx = this.listSaves().filter(s => s.key !== key);
    idx.push({ key: key, name: this.city.name, towers: this.city.buildings.length, at: Date.now() });
    Store.set(SAVE_INDEX, JSON.stringify(idx));
    Store.set(AUTOSAVE, data);
    UI.toast('CITY SAVED', '✓');
  }

  autosave() {
    Store.set(AUTOSAVE, JSON.stringify(this.city.serialize()));
  }

  load(key) {
    const raw = Store.get(key);
    if (!raw) { UI.toast('SAVE NOT FOUND'); return; }
    this.saveKey = key.replace('neonfall.city.', '');
    this.loadRaw(raw);
  }

  loadRaw(raw) {
    try {
      const o = JSON.parse(raw);
      this.city = City.deserialize(o);
      this.audio.setWeather(this.city.env.rain, this.city.env.windSpeed);
      this.sel = null; this.undoStack.length = 0; this.redoStack.length = 0;
      this._availCount = this.city.availableDecos().length;
      this.frameHome();
      this.refresh();
      UI.buildSettings();
      UI.toast('CITY LOADED', '✓');
    } catch (e) {
      UI.toast('COULD NOT READ SAVE');
      console.error(e);
    }
  }

  deleteSave(key) {
    Store.del(key);
    Store.set(SAVE_INDEX, JSON.stringify(this.listSaves().filter(s => s.key !== key)));
  }

  /* -------------------------------------------------- new city */

  newCity() {
    $('loading').classList.remove('hidden');
    setTimeout(() => {
      try {
        this.generateCity();
      } catch (err) {
        // never strand the player on the loading overlay
        console.error('city generation failed:', err);
        UI.toast('GENERATION FAILED — SEE CONSOLE');
        this.closeMenu();
      } finally {
        $('loading').classList.add('hidden');
      }
    }, 60);
  }

  generateCity() {
    {
      const city = new City();
      city.name = pick(['KOWLOON 9', 'SECTOR ONYX', 'NEW HALCYON', 'MIDNIGHT MILE', 'ASHFALL', 'PORT NEBULA', 'GRID SEVEN'], Math.random());
      const rnd = mulberry32(city.seed);
      // a small existing core so the plot never feels blank
      const core = pick(['CENTRAL', 'OMEGA', 'ALPHA'], rnd());
      const mid = pick(DISTRICT_KEYS, rnd());
      const n = 26 + Math.floor(rnd() * 8);
      for (let i = 0; i < n; i++) {
        // several attempts so the core actually fills in
        for (let att = 0; att < 8; att++) {
          const a = rnd() * TAU;
          const rr = Math.pow(rnd(), 0.55) * 80;
          const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
          const dk = (rr < 28) ? core : (rr < 54 ? mid : 'LOWTOWN');
          if (city.occupied(x, z, 14, 14)) continue;
          city.place(dk, x, z, { lights: 0.40 + rnd() * 0.38 });
          break;
        }
      }
      city.stats.placed = city.buildings.length;
      city.regenFiller();
      city.env.timeOfDay = 19.15;   // blue hour: bright horizon, dark silhouettes
      city.env.weather = 'HAZE';
      city.env.apply();
      this.city = city;
      this.saveKey = null;
      this.sel = null;
      this.undoStack.length = 0; this.redoStack.length = 0;
      this._availCount = this.city.availableDecos().length;
      this.frameHome();
      this.audio.setWeather(city.env.rain, city.env.windSpeed);
      this.refresh();
      UI.buildSettings();
      UI.buildPalette();
      this.closeMenu();
      UI.toast('WELCOME TO ' + city.name, '◉');
    }
  }

  frameHome() {
    this.cam.ttx = 0; this.cam.ttz = 0; this.cam.tty = 30;
    this.cam.tx = 0; this.cam.tz = 0; this.cam.ty = 30;
    this.cam.tdist = 158; this.cam.dist = 190;
    this.cam.tpitch = 0.135; this.cam.pitch = 0.20;
    this.cam.tyaw = -0.7; this.cam.yaw = -0.7;
  }

  openMenu() {
    this.menuOpen = true;
    $('menu').classList.remove('hidden');
    $('m-cont').style.opacity = Store.get(AUTOSAVE) ? '1' : '.35';
    this.autosave();
  }

  closeMenu() {
    this.menuOpen = false;
    $('menu').classList.add('hidden');
    this.audio.resume();
  }

  /* -------------------------------------------------- frame */

  loop() {
    const now = performance.now();
    let dt = (now - this.lastFrame) / 1000;
    this.lastFrame = now;
    dt = Math.min(dt, 0.05);

    this.fpsAcc += dt; this.fpsCount++;
    if (this.fpsAcc > 0.5) {
      this.fps = this.fpsCount / this.fpsAcc;
      this.fpsAcc = 0; this.fpsCount = 0;
      const el = $('tb-fps');
      if (el) el.textContent = Math.round(this.fps);
      UI.updateProgress();
    }

    this.city.env.tick(dt);
    this.cameraKeys(dt);
    this.cam.update(dt);
    this.cam.bake();
    this.camMoving = Math.max(0, this.camMoving - dt);
    this.weather.update(dt, this.city.env, this.cam);
    this.audio.update();

    // adaptive detail
    const moving = this.camMoving > 0 || this.drag;
    this.renderer.stripScale = (moving ? 0.4 : 1) * (this.fps < 34 ? 0.5 : 1);

    // hover pick (skip while dragging for cost)
    if (!this.drag && !this.menuOpen && !this.photo) {
      const ray = this.rayNow();
      if (this.tool === 'bulldoze' || this.tool === 'district' || this.tool === 'decor') {
        const d = (this.tool !== 'district') ? this.city.pickDeco(ray) : null;
        const b = this.city.pickBuilding(ray, this.tool === 'bulldoze');
        this.hover = d ? { d: d } : (b ? { b: b.b } : null);
      } else this.hover = null;
    }

    try {
      this.render();
    } catch (err) {
      // never let one bad frame kill the loop
      if (!this._loggedErr) { console.error('render error', err); this._loggedErr = true; }
      this.renderer.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.renderer.ctx.globalAlpha = 1;
      this.renderer.ctx.globalCompositeOperation = 'source-over';
    }
    requestAnimationFrame(() => this.loop());
  }

  render() {
    const r = this.renderer, city = this.city, env = city.env;
    if (this.menuOpen && !city.buildings.length) {
      // idle backdrop on the menu
      env.time += 0.016;
    }
    r.begin(this.cam, env);
    r.drawSky();
    r.drawFarSkyline();
    r.drawGround();

    drawCity(r, city, this.sel, this.hover);
    city.traffic.draw(r, env.time, env);

    // tool gizmos
    if (!this.photo && !this.menuOpen) {
      if (this.tool === 'district') {
        const gp = this.groundPoint();
        if (gp && Math.hypot(gp.x, gp.z) < city.radius) {
          let x = gp.x, z = gp.z;
          if (this.mods.ctrl) { const c = city.cell; x = Math.round(x / c) * c; z = Math.round(z / c) * c; }
          const g = this.ghost;
          const ok = this.mods.shift || !city.occupied(x, z, g.w, g.d);
          r.push(-1e6, (rr) => {
            drawSelectionRing(rr, x, z, Math.max(g.w, g.d) * 0.62, ok ? '#7ce7ff' : '#ff4a5a');
            drawGhostBox(rr, x, z, g.w, g.d, g.h, g.rot, ok);
          });
        }
      } else if (this.tool === 'light') {
        const gp = this.groundPoint();
        if (gp) {
          const rad = this.brushRadius * (this.mods.shift ? 0.35 : 1);
          const col = (this.lightMode * (this.mods.alt ? -1 : 1)) > 0 ? '#ffd28a' : '#5f7fa0';
          r.push(-1e6, (rr) => drawBrushDisc(rr, gp.x, gp.z, rad, col));
        }
      } else if (this.tool === 'decor') {
        const ray = this.rayNow();
        const host = city.pickBuilding(ray, true);
        let x, y, z;
        if (host) { const t = host.hit.t; x = ray.ox + ray.dx * t; z = ray.oz + ray.dz * t; y = this.isRoofType(this.deco) ? host.b.top : host.hit.y; }
        else { const gp = this.groundPoint(); if (gp) { x = gp.x; z = gp.z; y = this.deco.startsWith('holo') ? 22 : 0; } }
        if (x !== undefined) {
          r.push(-1e6, (rr) => {
            drawSelectionRing(rr, x, z, 4.5, '#7ce7ff');
            line3(rr, x, 0, z, x, y, z, '#7ce7ff', 0.7, true);
            blinker(rr, x, y, z, '#7ce7ff', 0.8, 3);
          });
        }
      }
    }

    r.flush();
    this.weather.draw(r);
    r.end();
  }
}

function pick2col(seed) {
  const cols = ['#8fd8ff', '#ff8ad0', '#9dffd6', '#ffc98a', '#c9a8ff', '#ff6a6a'];
  return cols[Math.abs(seed) % cols.length];
}

/* ---------------------------------------------------------------
   boot
   The loading overlay sits above everything, so a thrown error here
   used to leave a frozen "GENERATING CITY…" screen with no clue why.
   Always take the overlay down, and if setup really did fail, say so
   on screen instead of hanging.
   --------------------------------------------------------------- */
let G;

function bootFailed(err) {
  console.error('NEONFALL failed to start:', err);
  const el = $('loading');
  if (!el) return;
  el.classList.remove('hidden');
  el.style.cssText += ';flex-direction:column;gap:14px;text-align:center;padding:24px;place-items:center;display:flex;justify-content:center';
  el.innerHTML =
    '<div style="letter-spacing:.3em;color:#ff3b5c">COULD NOT START</div>' +
    '<div style="max-width:620px;line-height:2;letter-spacing:.08em;color:#8b96a6;font-size:8px">' +
    String((err && (err.message || err)) || 'unknown error').replace(/[<>]/g, '') +
    '</div>' +
    '<div style="max-width:620px;line-height:2;letter-spacing:.08em;color:#4d5663;font-size:7.5px">' +
    'Try a hard reload (CMD-SHIFT-R). If it persists, this message is the reason.</div>';
}

function boot() {
  try {
    G = new Game();
  } catch (err) {
    bootFailed(err);
    return;
  }
  $('loading').classList.add('hidden');
  if (!Store.ok) {
    UI.toast('BROWSER STORAGE BLOCKED — CITIES WILL NOT PERSIST');
  }
}

if (document.readyState === 'complete') boot();
else window.addEventListener('load', boot);
