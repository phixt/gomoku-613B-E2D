// AudioManager.ts ? Singleton audio manager for Gomoku 613B-E2D
// SFX: pre-generated WAV tones via HTMLAudioElement
// BGM: live Web Audio API synthesis with chord progressions

import { eventBus, Events } from "../core/EventBus";

type SoundName = "click" | "win" | "lose" | "hover";
type BGMTrack = "menu" | "game" | "guide" | "pause";

interface SoundCache {
  [key: string]: HTMLAudioElement;
}

// ================= Frequency Tables (A4 = 440 Hz, equal temperament) =================

const NOTE_FREQ: Record<string, number> = {
  "C3": 130.81, "D3": 146.83, "E3": 164.81, "F3": 174.61, "G3": 196.00, "A3": 220.00, "B3": 246.94,
  "C4": 261.63, "D4": 293.66, "E4": 329.63, "F4": 349.23, "G4": 392.00, "A4": 440.00, "B4": 493.88,
  "C5": 523.25, "D5": 587.33, "E5": 659.25, "F5": 698.46, "G5": 783.99, "A5": 880.00,
};

// Chord definitions (C major / A minor family)
type Chord = string[];
const CHORDS: Record<string, Chord> = {
  "C":  ["C4", "E4", "G4"],           // I
  "Dm": ["D4", "F4", "A4"],           // ii
  "Em": ["E4", "G4", "B4"],           // iii
  "F":  ["F4", "A4", "C5"],           // IV
  "G":  ["G4", "B4", "D5"],           // V
  "Am": ["A4", "C5", "E5"],           // vi
  "Gsus":["G4", "C5", "D5"],          // Vsus4 (suspended, for pause)
};

// ================= BGM Mode Definitions =================

interface BGMPattern {
  progression: string[];        // chord names in order
  chordDuration: number;        // seconds per chord
  waveform: OscillatorType;     // oscillator waveform
  noteStyle: "pad" | "arpeggio" | "staccato" | "sustain";
  baseGain: number;             // per-oscillator gain (before summation)
}

const BGM_PATTERNS: Record<BGMTrack, BGMPattern> = {
  menu: {
    progression: ["C", "G", "Am", "F"],    // I - V - vi - IV
    chordDuration: 2.4,
    waveform: "triangle",
    noteStyle: "pad",
    baseGain: 0.08,
  },
  game: {
    progression: ["Am", "F", "C", "G"],    // vi - IV - I - V
    chordDuration: 1.2,
    waveform: "triangle",
    noteStyle: "arpeggio",
    baseGain: 0.06,
  },
  guide: {
    progression: ["C", "F", "C", "G"],     // I - IV - I - V
    chordDuration: 1.6,
    waveform: "sine",
    noteStyle: "staccato",
    baseGain: 0.07,
  },
  pause: {
    progression: ["G", "Gsus", "G", "Gsus"], // V - Vsus4 hover
    chordDuration: 3.0,
    waveform: "sine",
    noteStyle: "sustain",
    baseGain: 0.04,
  },
};

// ================= AudioManager =================

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

  private sfxVolume: number = 0.6;
  private bgmVolume: number = 0.3;
  private isMuted: boolean = false;
  private initialized: boolean = false;
  private pendingInit: (() => void)[] = [];

  private constructor() {
    this.preloadSFX();
    eventBus.on(Events.PLAY_SOUND, (payload: {sound: SoundName; bgm?: BGMTrack}) => {
      if (payload.bgm) {
        this.playBGM(payload.bgm);
      } else if (payload.sound) {
        this.playSFX(payload.sound);
      }
    });
  }

  static getInstance(): AudioManager {
    if (!AudioManager.instance) {
      AudioManager.instance = new AudioManager();
    }
    return AudioManager.instance;
  }

  // ================= AudioContext setup =================

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.isMuted ? 0 : this.bgmVolume;
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
    return this.ctx;
  }

  // ================= WAV generation (SFX only) =================

  private generateWavURI(
    frequency: number, duration: number, volume: number,
    type: "sine" | "square" | "triangle" = "sine"
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
    const release = Math.min(sampleRate * 0.05, numSamples);

    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      let sample: number;
      switch (type) {
        case "square":
          sample = Math.sin(2 * Math.PI * frequency * t) >= 0 ? 0.5 : -0.5;
          break;
        case "triangle":
          sample = 2 / Math.PI * Math.asin(Math.sin(2 * Math.PI * frequency * t));
          break;
        default:
          sample = Math.sin(2 * Math.PI * frequency * t);
      }
      let envelope = 1;
      if (i < attack) envelope = i / attack;
      if (i > numSamples - release) envelope = (numSamples - i) / release;
      const val = Math.floor(sample * volume * envelope * 0.7 * 32767);
      view.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, val)), true);
    }
    const blob = new Blob([buffer], { type: "audio/wav" });
    return URL.createObjectURL(blob);
  }

  // ================= SFX preload =================

  private preloadSFX(): void {
    this.sfxCache["click"] = new Audio(this.generateWavURI(660, 0.08, 0.4, "sine"));
    this.sfxCache["win"]   = new Audio(this.generateWavURI(880, 0.35, 0.6, "triangle"));
    this.sfxCache["lose"]  = new Audio(this.generateWavURI(180, 0.4, 0.5, "triangle"));
    this.sfxCache["hover"] = new Audio(this.generateWavURI(440, 0.04, 0.2, "sine"));
  }

  // ================= BGM synthesis (Web Audio API) =================

  /** Stop all currently playing BGM oscillators and clear the timer. */
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
  }

  /** Schedule one chord in the progression, then recurse for the next. */
  private scheduleChord(
    ctx: AudioContext,
    pattern: BGMPattern,
    chordIndex: number,
    startTime: number,
    gainNode: GainNode,
  ): void {
    const chordName = pattern.progression[chordIndex];
    const notes = CHORDS[chordName];
    if (!notes) return;

    const dur = pattern.chordDuration;
    const attack = Math.min(dur * 0.08, 0.15);
    const release = Math.min(dur * 0.3, 0.5);

    for (const noteName of notes) {
      const freq = NOTE_FREQ[noteName];
      if (!freq) continue;

      const osc = ctx.createOscillator();
      const noteGain = ctx.createGain();

      osc.type = pattern.waveform;
      osc.frequency.value = freq;

      // Envelope
      const now = startTime;
      noteGain.gain.setValueAtTime(0, now);
      noteGain.gain.linearRampToValueAtTime(pattern.baseGain, now + attack);

      if (pattern.noteStyle === "staccato") {
        // Short, bouncy notes
        const noteLen = dur * 0.3;
        noteGain.gain.setValueAtTime(pattern.baseGain, now + noteLen);
        noteGain.gain.linearRampToValueAtTime(0, now + noteLen + release);
      } else if (pattern.noteStyle === "arpeggio") {
        // Notes enter sequentially (arpeggiated)
        const noteIdx = notes.indexOf(noteName);
        const entryDelay = noteIdx * 0.08;
        noteGain.gain.setValueAtTime(0, now);
        noteGain.gain.linearRampToValueAtTime(pattern.baseGain, now + attack + entryDelay);
        noteGain.gain.setValueAtTime(pattern.baseGain, now + dur - release);
        noteGain.gain.linearRampToValueAtTime(0, now + dur);
      } else {
        // Pad / sustain: long smooth notes
        noteGain.gain.setValueAtTime(pattern.baseGain, now + dur - release);
        noteGain.gain.linearRampToValueAtTime(0, now + dur);
      }

      osc.connect(noteGain);
      noteGain.connect(gainNode);
      osc.start(now);
      osc.stop(now + dur + release);

      this.bgmOscillators.push(osc);
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

  /** Start playing a BGM pattern. */
  private startBGMPattern(track: BGMTrack): void {
    const ctx = this.ensureContext();
    this.stopBGM();

    const pattern = BGM_PATTERNS[track];

    // Create a per-track gain node for crossfade
    this.bgmGainNode = ctx.createGain();
    this.bgmGainNode.gain.value = 0; // start silent, fade in
    this.bgmGainNode.connect(this.masterGain!);

    const startTime = ctx.currentTime + 0.05; // small offset for scheduling
    this.isPlaying = true;
    this.scheduleChord(ctx, pattern, 0, startTime, this.bgmGainNode);

    // Fade in
    const targetVol = this.isMuted ? 0 : 1;
    this.bgmGainNode.gain.linearRampToValueAtTime(targetVol, startTime + 0.6);
  }

  // ================= Public API =================

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

    // Crossfade: keep old gain node, start new one
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
