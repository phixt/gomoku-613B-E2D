// AudioManager.ts — Singleton audio manager for Gomoku 613B-E2D
// Uses generated WAV tones via Audio elements for cross-browser compatibility.

import { eventBus, Events } from "../core/EventBus";

type SoundName = "click" | "win" | "lose" | "hover";
type BGMTrack = "menu" | "game";

interface SoundCache {
  [key: string]: HTMLAudioElement;
}

class AudioManager {
  private static instance: AudioManager;

  private sfxCache: SoundCache = {};
  private bgmCache: SoundCache = {};
  private currentBGM: HTMLAudioElement | null = null;
  private currentBGMName: BGMTrack | null = null;
  private sfxVolume: number = 0.6;
  private bgmVolume: number = 0.3;
  private isMuted: boolean = false;
  private initialized: boolean = false;
  private pendingInit: (() => void)[] = [];

  private constructor() {
    this.preloadAll();
    // Listen for PLAY_SOUND events from anywhere
    eventBus.on(Events.PLAY_SOUND, (payload: {sound: SoundName;bgm?: BGMTrack;}) => {
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

  // ── WAV generation (simple tones) ──────────────────────────

  private generateWavURI(
  frequency: number,
  duration: number,
  volume: number,
  type: "sine" | "square" | "triangle" = "sine")
  : string {
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
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // mono
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

      // Envelope
      let envelope = 1;
      if (i < attack) envelope = i / attack;
      if (i > numSamples - release) envelope = (numSamples - i) / release;

      const val = Math.floor(sample * volume * envelope * 0.7 * 32767);
      view.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, val)), true);
    }

    const blob = new Blob([buffer], { type: "audio/wav" });
    return URL.createObjectURL(blob);
  }

  // ── Preload ────────────────────────────────────────────────

  private preloadAll(): void {
    // SFX — short distinct tones
    this.sfxCache["click"] = new Audio(
      this.generateWavURI(660, 0.08, 0.4, "sine")
    );
    this.sfxCache["win"] = new Audio(
      this.generateWavURI(880, 0.35, 0.6, "triangle")
    );
    // Use a fallback tone for sawtooth (approximate with triangle)
    this.sfxCache["lose"] = new Audio(
      this.generateWavURI(180, 0.4, 0.5, "triangle")
    );
    this.sfxCache["hover"] = new Audio(
      this.generateWavURI(440, 0.04, 0.2, "sine")
    );

    // BGM — longer loops (8s approximate)
    this.bgmCache["menu"] = new Audio(
      this.generateWavURI(262, 8.0, 0.15, "triangle")
    );
    this.bgmCache["game"] = new Audio(
      this.generateWavURI(330, 8.0, 0.15, "triangle")
    );
  }

  // ── Public API ─────────────────────────────────────────────

  /** Initialize audio context (must be called after user gesture). */
  init(): void {
    if (this.initialized) return;
    this.initialized = true;
    // Resume any pending audio contexts
    this.pendingInit.forEach((fn) => fn());
    this.pendingInit = [];
  }

  /** Play a short sound effect. */
  playSFX(sound: SoundName): void {
    if (this.isMuted) return;
    const audio = this.sfxCache[sound];
    if (!audio) return;
    audio.volume = this.sfxVolume;
    audio.currentTime = 0;
    audio.play().catch(() => {
      // Browser autoplay blocked — defer until user interaction
      const tryPlay = () => {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      };
      this.pendingInit.push(tryPlay);
    });
  }

  /** Play or crossfade to a BGM track. */
  playBGM(track: BGMTrack): void {
    if (this.currentBGMName === track && this.currentBGM) return;
    const audio = this.bgmCache[track];
    if (!audio) return;
    audio.loop = true;
    audio.volume = 0; // Start silent for crossfade
    audio.play().catch(() => {
      const tryPlay = () => {
        audio.loop = true;
        audio.volume = 0;
        audio.play().catch(() => {});
      };
      this.pendingInit.push(tryPlay);
    });

    // Crossfade: fade out old, fade in new
    const oldBGM = this.currentBGM;
    if (oldBGM) {
      const fadeOut = setInterval(() => {
        const v = Math.max(0, oldBGM.volume - 0.02);
        oldBGM.volume = v;
        if (v <= 0) {
          clearInterval(fadeOut);
          oldBGM.pause();
          oldBGM.currentTime = 0;
        }
      }, 50);
    }

    const fadeIn = setInterval(() => {
      const v = Math.min(this.isMuted ? 0 : this.bgmVolume, audio.volume + 0.02);
      audio.volume = v;
      if (v >= (this.isMuted ? 0 : this.bgmVolume)) clearInterval(fadeIn);
    }, 50);

    this.currentBGM = audio;
    this.currentBGMName = track;
  }

  /** Set individual volume for SFX and BGM (0.0 – 1.0). */
  setVolume(sfx: number, bgm: number): void {
    this.sfxVolume = Math.max(0, Math.min(1, sfx));
    this.bgmVolume = Math.max(0, Math.min(1, bgm));
    if (this.currentBGM && !this.isMuted) {
      this.currentBGM.volume = this.bgmVolume;
    }
  }

  /** Get current SFX volume. */
  getSFXVolume(): number {
    return this.sfxVolume;
  }

  /** Get current BGM volume. */
  getBGMVolume(): number {
    return this.bgmVolume;
  }

  /** Toggle mute state. */
  mute(): void {
    this.isMuted = !this.isMuted;
    if (this.isMuted) {
      Object.values(this.sfxCache).forEach((a) => {a.volume = 0;});
      if (this.currentBGM) this.currentBGM.volume = 0;
    } else {
      Object.values(this.sfxCache).forEach((a) => {a.volume = this.sfxVolume;});
      if (this.currentBGM) this.currentBGM.volume = this.bgmVolume;
    }
  }

  /** Check if currently muted. */
  get muted(): boolean {
    return this.isMuted;
  }

  /** Check if audio has been initialised via user gesture. */
  get isInitialized(): boolean {
    return this.initialized;
  }
}

export const audioManager = AudioManager.getInstance();