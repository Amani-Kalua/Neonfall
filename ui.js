/* ============================================================
   NEONFALL — ui.js
   HUD construction: rail, palettes, city settings, help, saves.
   ============================================================ */
'use strict';

const $ = (id) => document.getElementById(id);

const TOOLS = [
  { id: 'district', key: '1', icon: '▣', label: 'DISTRICTS' },
  { id: 'decor', key: '2', icon: '✦', label: 'DECORATIONS' },
  { id: 'light', key: '3', icon: '☀', label: 'LIGHT BRUSH' },
  { id: 'bulldoze', key: '4', icon: '⌫', label: 'BULLDOZER' }
];

const UI = {
  G: null,

  init(G) {
    this.G = G;
    this.buildRail();
    this.buildHelp();
    this.buildSettings();
    this.buildAdPicker();
    document.querySelectorAll('[data-close]').forEach(el => {
      el.addEventListener('click', () => this.close(el.getAttribute('data-close')));
    });
  },

  /* ---------- rail ---------- */
  buildRail() {
    const G = this.G;
    const tw = $('rail-tools');
    tw.innerHTML = '';
    for (const t of TOOLS) {
      const b = document.createElement('div');
      b.className = 'tool';
      b.dataset.tool = t.id;
      b.title = t.label + '  [' + t.key + ']';
      b.innerHTML = t.icon + '<span class="kb">' + t.key + '</span>';
      b.addEventListener('click', () => G.setTool(t.id));
      tw.appendChild(b);
    }
    const fw = $('rail-foot');
    fw.innerHTML = '';
    const footBtns = [
      { icon: '⚙', title: 'MY CITY  [C]', fn: () => this.toggle('settings') },
      { icon: '◉', title: 'PHOTO MODE  [P]', fn: () => G.togglePhoto() },
      { icon: '♫', title: 'MUTE / UNMUTE  [M]', fn: () => G.toggleMute() },
      { icon: '?', title: 'CONTROLS  [F1]', fn: () => this.toggle('help') },
      { icon: '≡', title: 'MENU  [ESC]', fn: () => G.openMenu() }
    ];
    for (const f of footBtns) {
      const b = document.createElement('div');
      b.className = 'tool';
      b.title = f.title;
      b.textContent = f.icon;
      b.addEventListener('click', f.fn);
      fw.appendChild(b);
    }
    this.refreshRail();
  },

  refreshRail() {
    const G = this.G;
    document.querySelectorAll('#rail-tools .tool').forEach(el => {
      el.classList.toggle('on', el.dataset.tool === G.tool);
    });
    // context items in the rail
    const iw = $('rail-items');
    iw.innerHTML = '';
    if (G.tool === 'district') {
      DISTRICT_KEYS.forEach((k, i) => {
        const b = document.createElement('div');
        b.className = 'tool' + (G.district === k ? ' on' : '');
        b.title = DISTRICTS[k].name;
        b.textContent = ['▤', '▥', '❋', '▦', '◭'][i];
        b.addEventListener('click', () => { G.district = k; G.refresh(); UI.buildPalette(); });
        iw.appendChild(b);
      });
    } else if (G.tool === 'decor') {
      const avail = G.city.availableDecos();
      for (const d of DECO_TYPES) {
        const ok = avail.indexOf(d) >= 0;
        const b = document.createElement('div');
        b.className = 'tool' + (G.deco === d.id ? ' on' : '') + (ok ? '' : ' locked');
        b.title = ok ? d.name : (d.name + ' — locked (level ' + d.unlock + ')');
        b.textContent = d.icon;
        if (ok) b.addEventListener('click', () => { G.deco = d.id; G.refresh(); UI.buildPalette(); });
        iw.appendChild(b);
      }
    } else if (G.tool === 'light') {
      [['+', 'ADD LIGHT'], ['−', 'REMOVE LIGHT']].forEach(([g, t], i) => {
        const b = document.createElement('div');
        b.className = 'tool' + ((G.lightMode === (i === 0 ? 1 : -1)) ? ' on' : '');
        b.title = t;
        b.textContent = g;
        b.addEventListener('click', () => { G.lightMode = i === 0 ? 1 : -1; G.refresh(); });
        iw.appendChild(b);
      });
    }
    const head = $('rail-title');
    const mini = document.querySelector('#rail-head .mini');
    if (G.tool === 'district') { mini.textContent = '// DISTRICT'; head.textContent = DISTRICTS[G.district].name; }
    else if (G.tool === 'decor') {
      const d = DECO_TYPES.find(x => x.id === G.deco);
      mini.textContent = '// DECORATION'; head.textContent = d ? d.name : '—';
    }
    else if (G.tool === 'light') { mini.textContent = '// LIGHT BRUSH'; head.textContent = (G.lightMode > 0 ? 'ADD · ' : 'REMOVE · ') + Math.round(G.brushRadius) + 'M'; }
    else { mini.textContent = '// BULLDOZER'; head.textContent = 'DEMOLISH'; }
  },

  /* ---------- palette ---------- */
  buildPalette() {
    const G = this.G;
    const body = $('pal-body');
    body.innerHTML = '';
    if (G.tool === 'district') {
      $('pal-title').textContent = 'DISTRICTS';
      for (const k of DISTRICT_KEYS) {
        const D = DISTRICTS[k];
        const el = document.createElement('div');
        el.className = 'pitem' + (G.district === k ? ' on' : '');
        el.innerHTML = '<div class="glyph">' + ['▤', '▥', '❋', '▦', '◭'][DISTRICT_KEYS.indexOf(k)] + '</div>' +
          '<div class="tx"><div class="nm">' + D.name + '</div><div class="ds">' + D.tag + '</div></div>';
        el.addEventListener('click', () => { G.district = k; G.refresh(); UI.buildPalette(); });
        body.appendChild(el);
      }
      const n = document.createElement('p');
      n.className = 'note';
      n.innerHTML = 'Click the ground to place. <b>R</b> re-rolls the silhouette. ' +
        'Drag a tower&rsquo;s <b>base</b> to move it, its <b>middle</b> to spin it, its <b>top</b> to stretch it.';
      body.appendChild(n);
    } else if (G.tool === 'decor') {
      $('pal-title').textContent = 'DECORATIONS';
      const lvl = G.city.unlockLevel();
      for (const d of DECO_TYPES) {
        const ok = lvl >= d.unlock;
        const el = document.createElement('div');
        el.className = 'pitem' + (G.deco === d.id ? ' on' : '') + (ok ? '' : ' lock');
        el.innerHTML = '<div class="glyph">' + (ok ? d.icon : '🔒') + '</div>' +
          '<div class="tx"><div class="nm">' + d.name + '</div><div class="ds">' +
          (ok ? d.desc : 'unlocks at level ' + d.unlock) + '</div></div>';
        if (ok) el.addEventListener('click', () => { G.deco = d.id; G.refresh(); UI.buildPalette(); });
        body.appendChild(el);
      }
      const n = document.createElement('p');
      n.className = 'note';
      n.innerHTML = 'Level <b>' + lvl + '</b> — place and decorate more to unlock the rest.';
      body.appendChild(n);
    } else if (G.tool === 'light') {
      $('pal-title').textContent = 'LIGHT BRUSH';
      const wrap = document.createElement('div');
      wrap.className = 'seg';
      [['ADD', 1], ['REMOVE', -1]].forEach(([t, v]) => {
        const b = document.createElement('button');
        b.textContent = t;
        b.className = G.lightMode === v ? 'on' : '';
        b.onclick = () => { G.lightMode = v; G.refresh(); UI.buildPalette(); };
        wrap.appendChild(b);
      });
      body.appendChild(wrap);
      body.appendChild(this.slider('BRUSH RADIUS', 6, 90, 1, () => G.brushRadius, v => { G.brushRadius = v; UI.refreshRail(); }, v => Math.round(v) + 'm'));
      body.appendChild(this.slider('BRUSH FLOW', 0.05, 1, 0.05, () => G.brushFlow, v => G.brushFlow = v, v => Math.round(v * 100) + '%'));
      const n = document.createElement('p');
      n.className = 'note';
      n.innerHTML = 'Drag over the city to wake the windows. Hold <b>SHIFT</b> for a small brush, ' +
        '<b>ALT</b> to invert. <b>[</b> / <b>]</b> resize.';
      body.appendChild(n);
      const b2 = document.createElement('button');
      b2.className = 'btn';
      b2.textContent = 'LIGHT THE WHOLE CITY';
      b2.onclick = () => G.lightAll(1);
      body.appendChild(b2);
      const b3 = document.createElement('button');
      b3.className = 'btn';
      b3.textContent = 'CUT ALL POWER';
      b3.onclick = () => G.lightAll(0);
      body.appendChild(b3);
    } else {
      $('pal-title').textContent = 'BULLDOZER';
      const n = document.createElement('p');
      n.className = 'note';
      n.innerHTML = 'Click anything to remove it — towers, filler blocks, decorations. ' +
        'Hold to sweep. <b>Z</b> undoes.';
      body.appendChild(n);
    }
  },

  /* ---------- generic slider ---------- */
  slider(label, min, max, step, get, set, fmt) {
    const w = document.createElement('div');
    w.className = 'slider';
    const lab = document.createElement('div');
    lab.className = 'lab';
    const l = document.createElement('span'); l.textContent = label;
    const v = document.createElement('span');
    lab.appendChild(l); lab.appendChild(v);
    const inp = document.createElement('input');
    inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step;
    inp.value = get();
    const upd = () => { v.textContent = fmt ? fmt(+inp.value) : (+inp.value).toFixed(2); };
    upd();
    inp.addEventListener('input', () => { set(+inp.value); upd(); });
    w.appendChild(lab); w.appendChild(inp);
    w._sync = () => { inp.value = get(); upd(); };
    return w;
  },

  seg(label, opts, get, set) {
    const w = document.createElement('div');
    if (label) {
      const s = document.createElement('div');
      s.className = 'sect'; s.textContent = label;
      w.appendChild(s);
    }
    const g = document.createElement('div');
    g.className = 'seg';
    const paint = () => {
      Array.from(g.children).forEach((b, i) => b.classList.toggle('on', opts[i][1] === get()));
    };
    for (const [t, v] of opts) {
      const b = document.createElement('button');
      b.textContent = t;
      b.onclick = () => { set(v); paint(); };
      g.appendChild(b);
    }
    paint();
    w.appendChild(g);
    w._sync = paint;
    return w;
  },

  /* ---------- city settings ---------- */
  buildSettings() {
    const G = this.G, env = G.city.env;
    const body = $('set-body');
    body.innerHTML = '';
    this._syncers = [];
    const add = (el) => { body.appendChild(el); if (el._sync) this._syncers.push(el); };
    const sect = (t) => { const s = document.createElement('div'); s.className = 'sect'; s.textContent = t; body.appendChild(s); };

    sect('WORLD');
    add(this.slider('TIME OF DAY', 0, 23.99, 0.05, () => env.timeOfDay, v => { env.timeOfDay = v; env.apply(); G.city.dirty = true; }, v => fmtTime(v)));
    add(this.seg(null, [['FROZEN', 0], ['SLOW', 0.04], ['FAST', 0.20]], () => env.timeFlow, v => env.timeFlow = v));
    add(this.seg('WEATHER', Object.keys(WEATHERS).map(k => [k, k]), () => env.weather, v => {
      env.weather = v; env.apply(); G.city.dirty = true; G.audio.setWeather(env.rain, env.windSpeed); UI.updateTop();
    }));

    sect('ATMOSPHERE');
    add(this.slider('FOG DENSITY', 0.002, 0.045, 0.001, () => env.fogDensityBase, v => { env.fogDensityBase = v; env.apply(); G.city.dirty = true; }, v => (v * 1000).toFixed(1)));
    add(this.slider('MIST HEIGHT', 8, 90, 1, () => env.mistHeight, v => { env.mistHeight = v; G.city.dirty = true; }, v => Math.round(v) + 'm'));
    add(this.slider('BRIGHTNESS', 0.4, 1.8, 0.02, () => env.brightness, v => env.brightness = v, v => Math.round(v * 100) + ''));

    sect('LIGHT');
    add(this.slider('BLOOM INTENSITY', 0, 1.6, 0.02, () => env.bloom, v => env.bloom = v, v => Math.round(v * 100) + ''));
    add(this.slider('BLOOM THRESHOLD', 0, 1, 0.02, () => env.bloomThreshold, v => env.bloomThreshold = v, v => Math.round(v * 100) + ''));
    add(this.slider('LIGHT STREAKS', 0, 1.2, 0.02, () => env.streak, v => env.streak = v, v => Math.round(v * 100) + ''));
    add(this.slider('STREAK THRESHOLD', 0, 1, 0.02, () => env.streakThreshold, v => env.streakThreshold = v, v => Math.round(v * 100) + ''));
    add(this.slider('WINDOW GLOW', 0, 2, 0.02, () => env.windowGlow, v => { env.windowGlow = v; G.city.dirty = true; }, v => Math.round(v * 100) + ''));
    add(this.slider('NEON GLOW', 0, 2, 0.02, () => env.neonGlow, v => { env.neonGlow = v; G.city.dirty = true; }, v => Math.round(v * 100) + ''));
    add(this.slider('TRAFFIC', 0, 1.5, 0.02, () => env.trafficAmount, v => env.trafficAmount = v, v => Math.round(v * 100) + ''));

    sect('FILTER');
    add(this.seg(null, Object.keys(FILTERS).map(k => [k, k]), () => env.filter, v => env.filter = v));
    add(this.slider('FILTER INTENSITY', 0, 1, 0.02, () => env.filterIntensity, v => env.filterIntensity = v, v => Math.round(v * 100) + ''));
    add(this.slider('VIGNETTE', 0, 1.4, 0.02, () => env.vignette, v => env.vignette = v, v => Math.round(v * 100) + ''));
    add(this.slider('GRAIN', 0, 1, 0.02, () => env.grain, v => env.grain = v, v => Math.round(v * 100) + ''));
    add(this.slider('SCANLINES', 0, 1, 0.02, () => env.scanlines, v => env.scanlines = v, v => Math.round(v * 100) + ''));

    sect('SOUND');
    add(this.slider('VOLUME', 0, 1, 0.02, () => G.audio.muted ? 0 : G.audio.volume,
      v => G.setVolume(v), v => G.audio.muted ? 'OFF' : (Math.round(v * 100) + '')));
    add(this.seg(null, [['SOUND ON', false], ['MUTED', true]], () => G.audio.muted,
      v => { if (v !== G.audio.muted) G.toggleMute(); }));
    add(this.seg(null, TRACKS.map((t, i) => [t.name, i]), () => G.audio.trackIndex, v => {
      G.audio.resume(); G.audio.setTrack(v); G.saveAudioPrefs(); UI.updateAudio();
    }));

    sect('PERFORMANCE');
    add(this.seg(null, [['LOW', 0.7], ['MED', 1.0], ['HIGH', 1.35]], () => G.renderer.quality, v => { G.renderer.quality = v; G.resize(); }));

    sect('CITY');
    const nameIn = document.createElement('input');
    nameIn.type = 'text'; nameIn.value = G.city.name;
    nameIn.addEventListener('input', () => { G.city.name = nameIn.value.toUpperCase().slice(0, 22) || 'UNTITLED'; UI.updateTop(); });
    body.appendChild(nameIn);
    const b1 = document.createElement('button');
    b1.className = 'btn'; b1.style.marginTop = '6px'; b1.textContent = 'SAVE CITY  [F5]';
    b1.onclick = () => G.save();
    body.appendChild(b1);
    const b2 = document.createElement('button');
    b2.className = 'btn'; b2.textContent = 'CITIES…';
    b2.onclick = () => { UI.buildCities(); UI.open('cities'); };
    body.appendChild(b2);
    const st = document.createElement('div');
    st.style.marginTop = '8px';
    st.innerHTML = '<div class="kv"><span>TOWERS</span><b>' + G.city.buildings.length + '</b></div>' +
      '<div class="kv"><span>FILLER BLOCKS</span><b>' + G.city.filler.length + '</b></div>' +
      '<div class="kv"><span>DECORATIONS</span><b>' + G.city.decos.length + '</b></div>' +
      '<div class="kv"><span>LEVEL</span><b>' + G.city.unlockLevel() + '</b></div>';
    body.appendChild(st);
  },

  syncSettings() {
    if (!this._syncers) return;
    for (const s of this._syncers) if (s._sync) s._sync();
  },

  /* ---------- ad / screen picker ---------- */
  buildAdPicker() {
    const G = this.G;
    const grid = $('ad-grid');
    grid.innerHTML = '';
    ADS.forEach((c, i) => {
      const d = document.createElement('div');
      d.className = 'ad';
      const im = document.createElement('canvas');
      im.width = 60; im.height = 80;
      im.getContext('2d').drawImage(c, 0, 0, 60, 80);
      d.appendChild(im);
      d.onclick = () => G.setScreenContent(i, null);
      grid.appendChild(d);
    });
    $('ad-upload').onclick = () => $('ad-file').click();
    $('ad-file').onchange = (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      const fr = new FileReader();
      fr.onload = () => G.setScreenContent(null, fr.result);
      fr.readAsDataURL(f);
      e.target.value = '';
    };
  },

  /* ---------- help ---------- */
  buildHelp() {
    const rows = [
      ['MOUSE', ''],
      ['Left click', 'place / select'],
      ['Left drag on ground', 'pan the city'],
      ['Left drag a tower — base', 'move it'],
      ['Left drag a tower — middle', 'rotate it'],
      ['Left drag a tower — top', 'change its height'],
      ['Right / middle drag', 'orbit'],
      ['Wheel', 'zoom'],
      ['KEYS', ''],
      ['1 2 3 4', 'districts · decorations · light brush · bulldozer'],
      ['W A S D / arrows', 'move camera'],
      ['Q E', 'rotate camera'],
      ['+ − / wheel', 'zoom'],
      ['R', 'reroll the selected silhouette'],
      ['SPACE', 'place at the cursor'],
      ['SHIFT (hold)', 'small brush / free placement (no snap)'],
      ['CTRL (hold)', 'snap to grid'],
      ['ALT (hold)', 'clone what you click / invert brush'],
      ['[ ]', 'brush size'],
      ['Z / X', 'undo · redo'],
      ['DELETE', 'remove selection'],
      ['I', 'upload an image to the selected screen'],
      ['C', 'my city settings'],
      ['P', 'photo mode'],
      ['F3', 'hide the interface'],
      ['F5', 'save'],
      ['M / N', 'mute · next track (also top-right)'],
      ['F1', 'this panel'],
      ['ESC', 'menu']
    ];
    let html = '<div class="kcols"><div>';
    let half = Math.ceil(rows.length / 2);
    rows.forEach(([k, v], i) => {
      if (i === half) html += '</div><div>';
      if (!v) html += '<div class="sect">' + k + '</div>';
      else html += '<div class="kv"><span>' + k + '</span><b>' + v + '</b></div>';
    });
    html += '</div></div><p class="note">There is no way to lose. Nothing runs out. ' +
      'The city keeps its own time — put on the fog, pick a filter, and stack towers until it feels right.</p>';
    $('help-body').innerHTML = html;
  },

  /* ---------- saves ---------- */
  buildCities() {
    const G = this.G;
    const body = $('cities-body');
    body.innerHTML = '';
    const list = G.listSaves();
    if (!list.length) {
      const p = document.createElement('p');
      p.className = 'note';
      p.textContent = 'No cities saved yet.';
      body.appendChild(p);
    }
    for (const s of list) {
      const row = document.createElement('div');
      row.className = 'saverow';
      const b = document.createElement('button');
      b.className = 'btn';
      const d = new Date(s.at);
      b.innerHTML = s.name + '  <span style="opacity:.5">· ' + s.towers + ' towers · ' +
        d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + '</span>';
      b.onclick = () => { G.load(s.key); UI.close('cities'); G.closeMenu(); };
      const del = document.createElement('button');
      del.className = 'del'; del.textContent = '✕'; del.title = 'delete';
      del.onclick = (e) => { e.stopPropagation(); G.deleteSave(s.key); UI.buildCities(); };
      row.appendChild(b); row.appendChild(del);
      body.appendChild(row);
    }
    const nb = document.createElement('button');
    nb.className = 'btn primary';
    nb.style.marginTop = '10px';
    nb.textContent = 'SAVE CURRENT CITY';
    nb.onclick = () => { G.save(); UI.buildCities(); };
    body.appendChild(nb);
  },

  /* ---------- panels ---------- */
  open(id) { $(id).classList.remove('hidden'); },
  close(id) { $(id).classList.add('hidden'); },
  isOpen(id) { return !$(id).classList.contains('hidden'); },
  toggle(id) {
    if (this.isOpen(id)) this.close(id);
    else {
      if (id === 'settings') this.buildSettings();
      if (id === 'cities') this.buildCities();
      this.open(id);
    }
  },

  /* ---------- toasts ---------- */
  toast(msg, kind) {
    const w = $('toasts');
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = kind ? '<span class="u">' + kind + '</span>' + msg : msg;
    w.appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 420); }, kind === 'UNLOCKED' ? 3600 : 2100);
    while (w.children.length > 4) w.firstChild.remove();
  },

  hint(html) { $('hint').innerHTML = html; },

  updateTop() {
    const G = this.G;
    $('tb-name').textContent = G.city.name;
    $('tb-time').textContent = fmtTime(G.city.env.timeOfDay);
    $('tb-wx').textContent = G.city.env.weather;
    this.updateAudio();
  },

  /* keep the always-visible audio control in sync with the engine */
  updateAudio() {
    const G = this.G, a = G.audio;
    const bar = $('audiobar'), mute = $('ab-mute'), vol = $('ab-vol'), pct = $('ab-pct'), tr = $('ab-track');
    if (!bar) return;
    const silent = a.muted || a.volume < 0.005;
    mute.textContent = silent ? '✕' : '♫';
    mute.classList.toggle('muted', silent);
    mute.title = (a.muted ? 'UNMUTE' : 'MUTE') + '  [M]';
    bar.classList.toggle('off', silent);
    if (document.activeElement !== vol) vol.value = a.volume;
    pct.textContent = a.muted ? 'OFF' : Math.round(a.volume * 100);
    tr.textContent = a.trackName();
  },

  updateProgress() {
    const G = this.G, c = G.city;
    const lvl = c.unlockLevel();
    const next = DECO_TYPES.filter(d => d.unlock > lvl).sort((a, b) => a.unlock - b.unlock)[0];
    $('progress').innerHTML =
      '<div>LEVEL <b>' + lvl + '</b> · ' + c.buildings.length + ' TOWERS · ' + c.decos.length + ' DECOR</div>' +
      (next ? '<div style="opacity:.7">NEXT: ' + next.name + ' AT ' + next.unlock + '</div>' : '<div style="opacity:.7">ALL UNLOCKED</div>');
  }
};
