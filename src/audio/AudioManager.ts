// AudioManager.ts - Enhanced version with layered BGM, spatial FX, and richer SFX
// All external interfaces remain unchanged.

import { eventBus, Events } from "../core/EventBus";

type SoundName = "click" | "win" | "lose" | "hover";
type BGMTrack = "menu" | "game" | "guide" | "pause";

interface SoundCache {
  [key: string]: HTMLAudioElement;
}

// ================= Frequency Tables (A4 = 440 Hz) =================
const NOTE_FREQ: Record<string, number> = {
  "C3": 130.81, "D3": 146.83, "E3": 164.81, "F3": 174.61, "G3": 196.00, "A3": 220.00, "B3": 246.94,
  "C4": 261.63, "D4": 293.66, "E4": 329.63, "F4": 349.23, "G4": 392.00, "A4": 440.00, "B4": 493.88,
  "C5": 523.25, "D5": 587.33, "E5": 659.25, "F5": 698.46, "G5": 783.99, "A5": 880.00,
  "C6": 1046.50, "D6": 1174.66, "E6": 1318.51,
};

// ================= Enhanced Chord Library (sevenths, suspensions, add9) =================
type Chord = string[];
const CHORDS: Record<string, Chord> = {
  // Triads (fallback)
  "C":  ["C4", "E4", "G4"],
  "Dm": ["D4", "F4", "A4"],
  "Em": ["E4", "G4", "B4"],
  "F":  ["F4", "A4", "C5"],
  "G":  ["G4", "B4", "D5"],
  "Am": ["A4", "C5", "E5"],
  "Gsus":["G4", "C5", "D5"],
  // Extended
  "Cmaj7": ["C4", "E4", "G4", "B4"],
  "Am7":   ["A3", "C4", "E4", "G4"],
  "Fmaj7": ["F4", "A4", "C5", "E5"],
  "G7":    ["G4", "B4", "D5", "F5"],
  "Dm7":   ["D4", "F4", "A4", "C5"],
  "Em7":   ["E4", "G4", "B4", "D5"],
  "Cadd9": ["C4", "E4", "G4", "D5"],
  "Gadd9": ["G4", "B4", "D5", "A5"],
  "Fadd9": ["F4", "A4", "C5", "G5"],
};

// ================= Enhanced BGM Pattern Definition =================
interface BGMLayer {
  waveform: OscillatorType;
  gain: number;
  octaveOffset: number;       // relative to chord root
}

interface BGMPattern {
  progression: string[];          // chord names (may include extended symbols)
  chordDuration: number;          // seconds per chord
  layers: {
    bass: BGMLayer;               // root note, low octave
    chord: BGMLayer;              // full chord (middle range)
    arpeggio?: BGMLayer;          // optional arpeggiated layer (high range)
  };
  noteStyle: "pad" | "arpeggio" | "staccato" | "sustain";
  baseGain: number;               // master gain for this pattern
  useReverb: boolean;
  reverbMix: number;              // 0-1
  useDelay?: boolean;
  delayMix?: number;
  vibratoDepth?: number;          // Hz variation (for pad style)
}

const BGM_PATTERNS: Record<BGMTrack, BGMPattern> = {
  menu: {
    progression: ["Cmaj7", "Gadd9", "Am7", "Fmaj7"],
    chordDuration: 2.8,
    layers: {
      bass:   { waveform: "triangle", gain: 0.10, octaveOffset: -1 },
      chord:  { waveform: "triangle", gain: 0.06, octaveOffset: 0 },
      arpeggio: { waveform: "sine", gain: 0.04, octaveOffset: 1 },
    },
    noteStyle: "pad",
    baseGain: 0.6,
    useReverb: true,
    reverbMix: 0.25,
    vibratoDepth: 1.5,
  },
  game: {
    progression: ["Am7", "Fmaj7", "Cadd9", "G7"],
    chordDuration: 1.2,
    layers: {
      bass:   { waveform: "triangle", gain: 0.08, octaveOffset: -1 },
      chord:  { waveform: "triangle", gain: 0.05, octaveOffset: 0 },
      arpeggio: { waveform: "sine", gain: 0.035, octaveOffset: 1 },
    },
    noteStyle: "arpeggio",
    baseGain: 0.5,
    useReverb: true,
    reverbMix: 0.15,
    useDelay: true,
    delayMix: 0.2,
    vibratoDepth: 0.8,
  },
  guide: {
    progression: ["Cadd9", "Fadd9", "Cadd9", "G7"],
    chordDuration: 1.8,
    layers: {
      bass:   { waveform: "sine", gain: 0.07, octaveOffset: -1 },
      chord:  { waveform: "sine", gain: 0.05, octaveOffset: 0 },
    },
    noteStyle: "staccato",
    baseGain: 0.5,
    useReverb: true,
    reverbMix: 0.2,
    vibratoDepth: 0,
  },
  pause: {
    progression: ["G", "Gsus", "G", "Gsus"],
    chordDuration: 3.5,
    layers: {
      bass:   { waveform: "sine", gain: 0.04, octaveOffset: -1 },
      chord:  { waveform: "sine", gain: 0.03, octaveOffset: 0 },
    },
    noteStyle: "sustain",
    baseGain: 0.3,
    useReverb: true,
    reverbMix: 0.4,
    vibratoDepth: 0.6,
  },
};

// ================= AudioManager (Enhanced) =================
class AudioManager {
  private static instance: AudioManager;

  private sfxCache: SoundCache = {};
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;

  // BGM state
  private currentBGMName: BGMTrack | null = null;
  private bgmGainNode: GainNode | null = null;
  private bgmOscillators: OscillatorNode[] = [];
  private bgmTimer: number | null = null;
  private isPlaying: boolean = false;

  // Effects
  private reverbNode: ConvolverNode | null = null;
  private delayNode: DelayNode | null = null;
  private delayGain: GainNode | null = null;

  private sfxVolume: number = 0.6;
  private bgmVolume: number = 0.3;
  private isMuted: boolean = false;
  private initialized: boolean = false;
  private pendingInit: (() => void)[] = [];

  // Dynamic intensity (0~1) 鈥?auto-adjusted via events
  private intensity: number = 0;

  private constructor() {
    this.preloadSFX();
    eventBus.on(Events.PLAY_SOUND, (payload: {sound: SoundName; bgm?: BGMTrack}) => {
      if (payload.bgm) {
        this.playBGM(payload.bgm);
      } else if (payload.sound) {
        this.playSFX(payload.sound);
      }
    });
    // Optional: listen to game intensity events (if defined in your Events)
    // eventBus.on(Events.GAME_INTENSITY, (val: number) => { this.intensity = Math.min(1, Math.max(0, val)); });
  }

  static getInstance(): AudioManager {
    if (!AudioManager.instance) {
      AudioManager.instance = new AudioManager();
    }
    return AudioManager.instance;
  }

  // ================= AudioContext & Effects Setup =================
  private ensureContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.isMuted ? 0 : this.bgmVolume;
      this.masterGain.connect(this.ctx.destination);

      // Build reverb (short hall)
      this.reverbNode = this.ctx.createConvolver();
      this.reverbNode.buffer = this.createReverbIR(this.ctx, 1.2);
      // Connect reverb to master (always on, but dry/wet controlled via send)
      this.reverbNode.connect(this.masterGain);

      // Delay for arpeggio
      this.delayNode = this.ctx.createDelay(1.0);
      this.delayNode.delayTime.value = 0.35;
      this.delayGain = this.ctx.createGain();
      this.delayGain.gain.value = 0;
      this.delayNode.connect(this.delayGain);
      this.delayGain.connect(this.masterGain);
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
    return this.ctx;
  }

  private createReverbIR(ctx: AudioContext, decay: number): AudioBuffer {
    const sampleRate = ctx.sampleRate;
    const length = Math.floor(sampleRate * decay);
    const buffer = ctx.createBuffer(2, length, sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        // Exponential decay + noise
        const env = Math.exp(-t * 4 / decay) * (0.5 + 0.5 * Math.random());
        data[i] = (Math.random() * 2 - 1) * env;
      }
    }
    return buffer;
  }

  // ================= SFX Generation (Enhanced) =================
  private generateWavURI(
    frequencies: number[],   // can be multiple for layering
    duration: number,
    volume: number,
    type: OscillatorType = "sine",
    glide?: { from: number; to: number }  // for sliding pitch (win/lose)
  ): string {
    const sampleRate = 22050;
    const numSamples = Math.floor(sampleRate * duration);
    const buffer = new ArrayBuffer(44 + numSamples * 2);
    const view = new DataView(buffer);

    const writeStr = (off: number, str: string) => {
      for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i));
    };
    writeStr(0, "RIFF");
    view.setUint32(4, 36 + numSamples * 2, true);
    writeStr(8, "WAVE");
    writeStr(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, "data");
    view.setUint32(40, numSamples * 2, true);

    const attack = Math.min(sampleRate * 0.005, numSamples);
    const release = Math.min(sampleRate * 0.06, numSamples);

    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      let sample = 0;
      // Multi-frequency synthesis
      for (const freq of frequencies) {
        let val: number;
        switch (type) {
          case "square": val = Math.sin(2 * Math.PI * freq * t) >= 0 ? 0.5 : -0.5; break;
          case "triangle": val = 2 / Math.PI * Math.asin(Math.sin(2 * Math.PI * freq * t)); break;
          default: val = Math.sin(2 * Math.PI * freq * t);
        }
        sample += val;
      }
      // If glide is set, modulate the first frequency as envelope
      if (glide) {
        const progress = t / duration;
        const currentFreq = glide.from + (glide.to - glide.from) * progress;
        let glideSample = 0;
        for (const freq of frequencies) {
          // only apply to the first (or all) 鈥?here we replace the main tone
          // For simplicity, we generate a new sine based on glide frequency
          if (freq === frequencies[0]) {
            glideSample = Math.sin(2 * Math.PI * currentFreq * t);
          } else {
            glideSample += Math.sin(2 * Math.PI * freq * t);
          }
        }
        sample = glideSample / frequencies.length;
      } else {
        sample /= frequencies.length; // normalize sum
      }

      // Envelope
      let envelope = 1;
      if (i < attack) envelope = i / attack;
      if (i > numSamples - release) envelope = (numSamples - i) / release;
      // Add tiny noise for click (uncomment for extra texture)
      // sample += (Math.random() - 0.5) * 0.05;
      const val = Math.floor(sample * volume * envelope * 0.7 * 32767);
      view.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, val)), true);
    }
    const blob = new Blob([buffer], { type: "audio/wav" });
    return URL.createObjectURL(blob);
  }

  private preloadSFX(): void {
    // Click: two tones + short noise-like attack
    this.sfxCache["click"] = new Audio(this.generateWavURI([660, 1320], 0.07, 0.4, "square"));
    // Win: rising glide from 523 to 1047 (C5 to C6)
    this.sfxCache["win"]   = new Audio(this.generateWavURI([523, 659, 784], 0.4, 0.5, "triangle", { from: 523, to: 1047 }));
    // Lose: falling glide from 440 to 220
    this.sfxCache["lose"]  = new Audio(this.generateWavURI([220, 330], 0.5, 0.45, "triangle", { from: 440, to: 220 }));
    // Hover: soft sine with slight detune
    this.sfxCache["hover"] = new Audio(this.generateWavURI([440, 443], 0.04, 0.2, "sine"));
  }

  // ================= BGM Synthesis (Layered + FX) =================
  private stopBGM(): void {
    if (this.bgmTimer !== null) {
      clearTimeout(this.bgmTimer);
      this.bgmTimer = null;
    }
    for (const osc of this.bgmOscillators) {
      try { osc.stop(); } catch (_) { /* already stopped */ }
    }
    this.bgmOscillators = [];
    this.isPlaying = false;
    if (this.delayGain) this.delayGain.gain.value = 0; // reset delay
  }

  private scheduleChord(
    ctx: AudioContext,
    pattern: BGMPattern,
    chordIndex: number,
    startTime: number,
    gainNode: GainNode,
  ): void {
    const chordName = pattern.progression[chordIndex];
    // Try extended chord, fallback to plain triad
    let notes = CHORDS[chordName];
    if (!notes) {
      // Remove suffix like "maj7", "7", "add9" and try base
      const base = chordName.replace(/maj7|7|add9|m7|sus/g, '');
      notes = CHORDS[base] || CHORDS["C"];
    }
    if (!notes) return;

    const dur = pattern.chordDuration * (1 - this.intensity * 0.15); // speed up with intensity
    const attack = Math.min(dur * 0.08, 0.15);
    const release = Math.min(dur * 0.3, 0.5);

    // Sort notes by frequency for layering
    const sorted = notes.map(n => ({ name: n, freq: NOTE_FREQ[n] })).filter(n => n.freq).sort((a,b) => a.freq - b.freq);
    if (sorted.length === 0) return;

    const rootFreq = sorted[0].freq;
    const chordFreqs = sorted.map(n => n.freq);

    // ---- Bass layer (root, lower octave) ----
    const bassLayer = pattern.layers.bass;
    this.createOscillator(
      ctx, rootFreq * Math.pow(2, bassLayer.octaveOffset), bassLayer.waveform,
      startTime, dur, attack, release, bassLayer.gain * pattern.baseGain,
      pattern.noteStyle, gainNode, pattern.vibratoDepth || 0
    );

    // ---- Chord layer (all notes, middle range) ----
    const chordLayer = pattern.layers.chord;
    for (const freq of chordFreqs) {
      this.createOscillator(
        ctx, freq * Math.pow(2, chordLayer.octaveOffset), chordLayer.waveform,
        startTime, dur, attack, release, chordLayer.gain * pattern.baseGain,
        pattern.noteStyle, gainNode, pattern.vibratoDepth || 0
      );
    }

    // ---- Arpeggio layer (optional, high range, staggered) ----
    if (pattern.layers.arpeggio) {
      const arpLayer = pattern.layers.arpeggio;
      const arpNotes = sorted.map(n => n.freq * Math.pow(2, arpLayer.octaveOffset));
      const noteDuration = dur / arpNotes.length;
      for (let i = 0; i < arpNotes.length; i++) {
        const freq = arpNotes[i];
        const noteStart = startTime + i * noteDuration * 0.9;
        this.createOscillator(
          ctx, freq, arpLayer.waveform,
          noteStart, noteDuration * 0.7, attack * 0.5, release * 0.3,
          arpLayer.gain * pattern.baseGain,
          "staccato", gainNode, pattern.vibratoDepth || 0
        );
      }
      // Enable delay for arpeggio layer if specified
      if (pattern.useDelay && this.delayGain) {
        this.delayGain.gain.setValueAtTime(pattern.delayMix || 0.15, startTime);
      }
    }

    // Schedule next chord
    const nextIndex = (chordIndex + 1) % pattern.progression.length;
    const nextTime = startTime + dur;
    const delayMs = (nextTime - ctx.currentTime) * 1000;

    this.bgmTimer = window.setTimeout(() => {
      if (!this.isPlaying) return;
      this.scheduleChord(ctx, pattern, nextIndex, nextTime, gainNode);
    }, Math.max(delayMs, 10));
  }

  private createOscillator(
    ctx: AudioContext,
    freq: number,
    type: OscillatorType,
    start: number,
    duration: number,
    attack: number,
    release: number,
    gainVal: number,
    style: string,
    dest: GainNode,
    vibratoDepth: number
  ): void {
    const osc = ctx.createOscillator();
    const noteGain = ctx.createGain();

    osc.type = type;
    osc.frequency.value = freq;

    // Apply vibrato (only if depth > 0)
    if (vibratoDepth > 0 && style === "pad") {
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = 5.5;
      lfoGain.gain.value = vibratoDepth;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      lfo.start(start);
      lfo.stop(start + duration + release);
    }

    // Envelope
    noteGain.gain.setValueAtTime(0, start);
    noteGain.gain.linearRampToValueAtTime(gainVal, start + attack);

    if (style === "staccato") {
      const noteLen = duration * 0.35;
      noteGain.gain.setValueAtTime(gainVal, start + noteLen);
      noteGain.gain.linearRampToValueAtTime(0, start + noteLen + release);
    } else if (style === "arpeggio") {
      // handled externally for arp layer, but here we keep as sustain
      noteGain.gain.setValueAtTime(gainVal, start + duration - release);
      noteGain.gain.linearRampToValueAtTime(0, start + duration);
    } else {
      // pad / sustain
      noteGain.gain.setValueAtTime(gainVal, start + duration - release);
      noteGain.gain.linearRampToValueAtTime(0, start + duration);
    }

    osc.connect(noteGain);
    noteGain.connect(dest);

    // Optional: send to reverb if enabled (we'll connect per chord via gain node)
    if (this.reverbNode && (this as any)._reverbSend) {
      // we'll handle reverb globally in startBGMPattern
    }

    osc.start(start);
    osc.stop(start + duration + release);

    this.bgmOscillators.push(osc);
  }

  private startBGMPattern(track: BGMTrack): void {
    const ctx = this.ensureContext();
    this.stopBGM();

    const pattern = BGM_PATTERNS[track];
    // Adjust gain/parameters based on intensity (reserved for future use)
    // const adjustedGain = pattern.baseGain * (1 + this.intensity * 0.2);

    // Create per-track gain node
    this.bgmGainNode = ctx.createGain();
    this.bgmGainNode.gain.value = 0;
    this.bgmGainNode.connect(this.masterGain!);

    // Connect reverb send (simple: split signal to reverb)
    if (pattern.useReverb && this.reverbNode) {
      const send = ctx.createGain();
      send.gain.value = pattern.reverbMix || 0.2;
      this.bgmGainNode.connect(send);
      send.connect(this.reverbNode);
    }

    const startTime = ctx.currentTime + 0.05;
    this.isPlaying = true;
    this.scheduleChord(ctx, pattern, 0, startTime, this.bgmGainNode);

    // Fade in
    const targetVol = this.isMuted ? 0 : 1;
    this.bgmGainNode.gain.linearRampToValueAtTime(targetVol, startTime + 0.6);
  }

  // ================= Public API (unchanged) =================

  init(): void {
    if (this.initialized) return;
    this.initialized = true;
    this.ensureContext();
    this.pendingInit.forEach((fn) => fn());
    this.pendingInit = [];
  }

  playSFX(sound: SoundName): void {
    if (this.isMuted) return;
    const audio = this.sfxCache[sound];
    if (!audio) return;
    audio.volume = this.sfxVolume;
    audio.currentTime = 0;
    audio.play().catch(() => {
      const tryPlay = () => {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      };
      this.pendingInit.push(tryPlay);
    });
  }

  playBGM(track: BGMTrack): void {
    if (this.currentBGMName === track && this.isPlaying) return;
    this.currentBGMName = track;

    // Crossfade: fade out old
    const oldGain = this.bgmGainNode;
    if (oldGain) {
      const ctx = this.ctx;
      if (ctx) {
        oldGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5);
        setTimeout(() => {
          try { oldGain.disconnect(); } catch (_) {}
        }, 600);
      }
    }
    this.startBGMPattern(track);
  }

  setVolume(sfx: number, bgm: number): void {
    this.sfxVolume = Math.max(0, Math.min(1, sfx));
    this.bgmVolume = Math.max(0, Math.min(1, bgm));
    if (this.masterGain && !this.isMuted) {
      this.masterGain.gain.value = this.bgmVolume;
    }
  }

  getSFXVolume(): number { return this.sfxVolume; }
  getBGMVolume(): number { return this.bgmVolume; }

  mute(): void {
    this.isMuted = !this.isMuted;
    if (this.isMuted) {
      Object.values(this.sfxCache).forEach((a) => { a.volume = 0; });
      if (this.masterGain) this.masterGain.gain.value = 0;
    } else {
      Object.values(this.sfxCache).forEach((a) => { a.volume = this.sfxVolume; });
      if (this.masterGain) this.masterGain.gain.value = this.bgmVolume;
    }
  }

  get muted(): boolean { return this.isMuted; }
  get isInitialized(): boolean { return this.initialized; }
}

export const audioManager = AudioManager.getInstance();