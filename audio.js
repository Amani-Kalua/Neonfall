/* ============================================================
   NEONFALL — audio.js
   Generative ambient soundtrack + weather beds. Pure WebAudio,
   no sample files. Four "tracks" with different moods.
   ============================================================ */
'use strict';

const TRACKS = [
  {
    id: 'drift', name: 'LOWTOWN DRIFT',
    root: 55, scale: [0, 3, 5, 7, 10], chords: [[0, 3, 7], [0, 5, 10], [-2, 3, 7], [0, 3, 8]],
    padWave: 'sawtooth', cutoff: 520, bpm: 46, bellProb: 0.35, bellWave: 'sine', detune: 7, sub: 1.0
  },
  {
    id: 'choir', name: 'VOID CHOIR',
    root: 49, scale: [0, 2, 3, 7, 8], chords: [[0, 3, 7, 10], [0, 2, 7], [-4, 3, 8], [0, 3, 7]],
    padWave: 'triangle', cutoff: 700, bpm: 38, bellProb: 0.22, bellWave: 'triangle', detune: 11, sub: 0.8
  },
  {
    id: 'rainchurch', name: 'RAIN CHURCH',
    root: 45, scale: [0, 3, 5, 7, 10, 12], chords: [[0, 7, 12], [0, 3, 10], [-5, 2, 7], [0, 5, 12]],
    padWave: 'sine', cutoff: 900, bpm: 34, bellProb: 0.5, bellWave: 'sine', detune: 4, sub: 1.15
  },
  {
    id: 'null', name: 'NULL SECTOR',
    root: 41, scale: [0, 1, 5, 6, 8], chords: [[0, 6, 11], [0, 1, 8], [-1, 5, 6], [0, 6, 8]],
    padWave: 'square', cutoff: 380, bpm: 52, bellProb: 0.14, bellWave: 'square', detune: 14, sub: 1.3
  }
];

function midiToHz(m) { return 440 * Math.pow(2, (m - 69) / 12); }

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.started = false;
    this.volume = 0.55;
    this.trackIndex = 0;
    this.muted = false;
    this.chordIndex = 0;
    this.nextChordAt = 0;
    this.nextBellAt = 0;
    this.rainTarget = 0;
    this.windTarget = 0.25;
  }

  start() {
    if (this.started) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const ctx = this.ctx;
    this.started = true;

    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.master.connect(ctx.destination);

    // gentle limiter-ish curve
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -18;
    this.comp.knee.value = 24;
    this.comp.ratio.value = 6;
    this.comp.attack.value = 0.02;
    this.comp.release.value = 0.35;
    this.comp.connect(this.master);

    // space: feedback delay + lowpass
    this.delay = ctx.createDelay(2.0);
    this.delay.delayTime.value = 0.62;
    this.fb = ctx.createGain(); this.fb.gain.value = 0.42;
    this.dampen = ctx.createBiquadFilter();
    this.dampen.type = 'lowpass'; this.dampen.frequency.value = 1600;
    this.delay.connect(this.dampen); this.dampen.connect(this.fb); this.fb.connect(this.delay);
    this.wet = ctx.createGain(); this.wet.gain.value = 0.5;
    this.delay.connect(this.wet); this.wet.connect(this.comp);

    this.bus = ctx.createGain(); this.bus.gain.value = 0.9;
    this.bus.connect(this.comp);
    this.bus.connect(this.delay);

    this.buildNoise();
    this.buildPad();
    this.buildSub();
    this.setTrack(this.trackIndex);
    // weather may have been set before the context existed — apply it now
    this.rainGain.gain.value = this.rainTarget * 0.32;
    this.windGain.gain.value = this.windTarget;
  }

  buildNoise() {
    const ctx = this.ctx;
    const len = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = w * 0.6 + last * 4;
    }
    // rain
    this.rainSrc = ctx.createBufferSource();
    this.rainSrc.buffer = buf; this.rainSrc.loop = true;
    this.rainHP = ctx.createBiquadFilter(); this.rainHP.type = 'highpass'; this.rainHP.frequency.value = 900;
    this.rainBP = ctx.createBiquadFilter(); this.rainBP.type = 'lowpass'; this.rainBP.frequency.value = 6200;
    this.rainGain = ctx.createGain(); this.rainGain.gain.value = 0;
    this.rainSrc.connect(this.rainHP); this.rainHP.connect(this.rainBP);
    this.rainBP.connect(this.rainGain); this.rainGain.connect(this.comp);
    this.rainSrc.start();

    // wind / city rumble
    this.windSrc = ctx.createBufferSource();
    this.windSrc.buffer = buf; this.windSrc.loop = true;
    this.windLP = ctx.createBiquadFilter(); this.windLP.type = 'lowpass'; this.windLP.frequency.value = 220;
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0.06;
    this.windSrc.connect(this.windLP); this.windLP.connect(this.windGain); this.windGain.connect(this.comp);
    this.windSrc.start();

    // slow LFO on wind filter
    this.windLfo = ctx.createOscillator();
    this.windLfo.frequency.value = 0.045;
    this.windLfoG = ctx.createGain(); this.windLfoG.gain.value = 90;
    this.windLfo.connect(this.windLfoG); this.windLfoG.connect(this.windLP.frequency);
    this.windLfo.start();
  }

  buildPad() {
    const ctx = this.ctx;
    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = 500;
    this.padFilter.Q.value = 1.4;
    this.padGain = ctx.createGain();
    this.padGain.gain.value = 0.0;
    this.padFilter.connect(this.padGain);
    this.padGain.connect(this.bus);

    // filter LFO
    this.padLfo = ctx.createOscillator();
    this.padLfo.frequency.value = 0.035;
    this.padLfoG = ctx.createGain(); this.padLfoG.gain.value = 180;
    this.padLfo.connect(this.padLfoG); this.padLfoG.connect(this.padFilter.frequency);
    this.padLfo.start();

    this.voices = [];
    for (let i = 0; i < 5; i++) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      g.gain.value = 0;
      o.connect(g); g.connect(this.padFilter);
      o.start();
      this.voices.push({ osc: o, gain: g });
    }
    this.padGain.gain.setTargetAtTime(0.16, ctx.currentTime, 3);
  }

  buildSub() {
    const ctx = this.ctx;
    this.sub = ctx.createOscillator();
    this.sub.type = 'sine';
    this.subGain = ctx.createGain();
    this.subGain.gain.value = 0;
    this.sub.connect(this.subGain);
    this.subGain.connect(this.comp);
    this.sub.start();
    this.subLfo = ctx.createOscillator();
    this.subLfo.frequency.value = 0.07;
    this.subLfoG = ctx.createGain(); this.subLfoG.gain.value = 0.022;
    this.subLfo.connect(this.subLfoG); this.subLfoG.connect(this.subGain.gain);
    this.subLfo.start();
  }

  setTrack(i) {
    this.trackIndex = ((i % TRACKS.length) + TRACKS.length) % TRACKS.length;
    if (!this.started) return;
    const T = TRACKS[this.trackIndex];
    const now = this.ctx.currentTime;
    for (const v of this.voices) v.osc.type = T.padWave;
    this.padFilter.frequency.setTargetAtTime(T.cutoff, now, 2.5);
    this.sub.frequency.setTargetAtTime(midiToHz(T.root - 24), now, 2);
    this.subGain.gain.setTargetAtTime(0.045 * T.sub, now, 2);
    this.nextChordAt = 0;
  }

  nextTrack() { this.setTrack(this.trackIndex + 1); return TRACKS[this.trackIndex].name; }

  trackName() { return TRACKS[this.trackIndex].name; }

  setVolume(v) {
    this.volume = clamp01(v);
    if (this.started) this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.2);
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.started) this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.15);
    return this.muted;
  }

  /* weather-driven beds */
  setWeather(rain, wind) {
    this.rainTarget = clamp01(rain * 0.5);
    this.windTarget = 0.03 + clamp01(wind) * 0.05;
    if (!this.started) return;
    const now = this.ctx.currentTime;
    this.rainGain.gain.setTargetAtTime(this.rainTarget * 0.32, now, 2.0);
    this.windGain.gain.setTargetAtTime(this.windTarget, now, 2.5);
  }

  /* chord + sparkle scheduler */
  update() {
    if (!this.started || this.ctx.state !== 'running') return;
    const ctx = this.ctx, now = ctx.currentTime;
    const T = TRACKS[this.trackIndex];
    const beat = 60 / T.bpm;
    const chordLen = beat * 8;

    if (now >= this.nextChordAt) {
      this.nextChordAt = now + chordLen;
      const chord = T.chords[this.chordIndex % T.chords.length];
      this.chordIndex++;
      for (let i = 0; i < this.voices.length; i++) {
        const v = this.voices[i];
        if (i < chord.length) {
          const oct = (i === chord.length - 1 && Math.random() < 0.4) ? 12 : 0;
          const m = T.root + chord[i] + oct;
          v.osc.frequency.setTargetAtTime(midiToHz(m), now, 1.4);
          v.osc.detune.setValueAtTime((Math.random() - 0.5) * T.detune * 2, now);
          v.gain.gain.cancelScheduledValues(now);
          // slow swell, but not so slow the first chord takes ten seconds to hear
          v.gain.gain.setTargetAtTime(0.10 + Math.random() * 0.05, now, Math.min(1.8, chordLen * 0.2));
        } else {
          v.gain.gain.setTargetAtTime(0.0, now, 2.0);
        }
      }
    }

    if (now >= this.nextBellAt) {
      this.nextBellAt = now + beat * (3 + Math.random() * 9);
      if (Math.random() < T.bellProb) this.bell(now + 0.02, T);
    }
  }

  bell(at, T) {
    const ctx = this.ctx;
    const deg = T.scale[Math.floor(Math.random() * T.scale.length)];
    const oct = 12 * (2 + Math.floor(Math.random() * 2));
    const o = ctx.createOscillator();
    o.type = T.bellWave;
    o.frequency.value = midiToHz(T.root + deg + oct);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(0.055 + Math.random() * 0.04, at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0005, at + 2.4 + Math.random() * 2.5);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = o.frequency.value * 1.4; f.Q.value = 2.2;
    o.connect(f); f.connect(g);
    g.connect(this.bus);
    o.start(at);
    o.stop(at + 6);
  }

  /* short UI blips */
  blip(kind) {
    if (!this.started || this.ctx.state !== 'running' || this.muted) return;
    const ctx = this.ctx, now = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.Q.value = 1.2;
    let base = 620, dur = 0.09, vol = 0.05;
    if (kind === 'place') { base = 190; dur = 0.16; vol = 0.075; o.type = 'triangle'; }
    else if (kind === 'remove') { base = 120; dur = 0.20; vol = 0.07; o.type = 'sawtooth'; }
    else if (kind === 'unlock') { base = 880; dur = 0.5; vol = 0.06; o.type = 'sine'; }
    else if (kind === 'paint') { base = 1400; dur = 0.05; vol = 0.022; o.type = 'sine'; }
    else { o.type = 'square'; vol = 0.028; }
    f.frequency.value = base * 1.6;
    o.frequency.setValueAtTime(base, now);
    o.frequency.exponentialRampToValueAtTime(kind === 'unlock' ? base * 2.2 : base * 0.6, now + dur);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(vol, now + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0004, now + dur);
    o.connect(f); f.connect(g); g.connect(this.comp);
    o.start(now); o.stop(now + dur + 0.05);
  }

  resume() {
    if (!this.started) { this.start(); return; }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }
}
