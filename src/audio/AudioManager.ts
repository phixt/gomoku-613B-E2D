// AudioManager.ts - Rich voice engine with scene DSP, humanization, and cinematic BGM patterns

type SoundName = "click" | "win" | "lose" | "hover";
type BGMTrack = "menu" | "game" | "guide" | "pause";
type ScenePreset = "normal" | "pause" | "menu";

interface SoundCache {
  [key: string]: HTMLAudioElement;
}

// ================= Frequency Tables (A4 = 440 Hz) =================
const NOTE_FREQ: Record<string, number> = {
  "C2": 65.41,  "D2": 73.42,  "E2": 82.41,  "F2": 87.31,  "G2": 98.00,  "A2": 110.00, "B2": 123.47,
  "C3": 130.81, "D3": 146.83, "E3": 164.81, "F3": 174.61, "G3": 196.00, "A3": 220.00, "B3": 246.94,
  "C4": 261.63, "D4": 293.66, "E4": 329.63, "F4": 349.23, "G4": 392.00, "A4": 440.00, "B4": 493.88,
  "C5": 523.25, "D5": 587.33, "E5": 659.25, "F5": 698.46, "G5": 783.99, "A5": 880.00, "B5": 987.77,
  "C6": 1046.50,"D6": 1174.66,"E6": 1318.51,"F6": 1396.91,"G6": 1567.98,
};

// ================= Chord Library =================
type Chord = string[];
const CHORDS: Record<string, Chord> = {
  "C":     ["C4","E4","G4"],
  "Dm":    ["D4","F4","A4"],
  "Em":    ["E4","G4","B4"],
  "F":     ["F4","A4","C5"],
  "G":     ["G4","B4","D5"],
  "Am":    ["A4","C5","E5"],
  "Gsus":  ["G4","C5","D5"],
  "Cmaj7": ["C4","E4","G4","B4"],
  "Am7":   ["A3","C4","E4","G4"],
  "Fmaj7": ["F4","A4","C5","E5"],
  "G7":    ["G4","B4","D5","F5"],
  "Dm7":   ["D4","F4","A4","C5"],
  "Em7":   ["E4","G4","B4","D5"],
  "Cadd9": ["C4","E4","G4","D5"],
  "Gadd9": ["G4","B4","D5","A5"],
  "Fadd9": ["F4","A4","C5","G5"],
};

// Arpeggio inversion sets for Add9 shimmer (16th-note patterns)
const ADD9_ARPEGGIOS: Record<string, string[]> = {
  "Cmaj7":  ["C4","E4","G4","B4","C5","B4","G4","E4"],
  "Gadd9":  ["G3","B3","D4","A4","B4","A4","D4","B3"],
  "Am7":    ["A3","C4","E4","G4","A4","G4","E4","C4"],
  "Fmaj7":  ["F3","A3","C4","E4","F4","E4","C4","A3"],
  "Cadd9":  ["C3","E3","G3","D4","E4","D4","G3","E3"],
  "G7":     ["G3","B3","D4","F4","G4","F4","D4","B3"],
  "Fadd9":  ["F3","A3","C4","G4","A4","G4","C4","A3"],
};

// Walking bass chromatic approach patterns (Root to 7th to 6th to 5th)
const WALKING_BASS: Record<string, string[]> = {
  "Am7":   ["A2","G2","F#2","E2"],
  "Fmaj7": ["F2","E2","D2","C2"],
  "Cadd9": ["C2","B1","A1","G1"],
  "G7":    ["G2","F2","E2","D2"],
};

// ================= BGM Pattern Definition =================
interface BGMLayer {
  waveform: OscillatorType;
  gain: number;
  octaveOffset: number;
}

interface BGMPattern {
  progression: string[];
  chordDuration: number;
  layers: {
    bass: BGMLayer;
    chord: BGMLayer;
    arpeggio?: BGMLayer;
    pad?: BGMLayer;
  };
  noteStyle: "pad" | "arpeggio" | "staccato" | "sustain";
  baseGain: number;
  useReverb: boolean;
  reverbMix: number;
  useDelay?: boolean;
  delayMix?: number;
  vibratoDepth?: number;
  // Extended fields for rich voicing
  voiceCount?: number;
  lfoHz?: number;
  filterCutoffMult?: number;
  tremoloHz?: number;
  attackOverride?: number;
  bassLine?: "walking";
  arpStyle?: "add9";
}

const BGM_PATTERNS: Record<BGMTrack, BGMPattern> = {
  // Menu: warm cinematic pad with shimmering arpeggios
  menu: {
    progression: ["Cmaj7", "Gadd9", "Am7", "Fmaj7"],
    chordDuration: 2.8,
    layers: {
      bass:     { waveform: "triangle", gain: 0.10, octaveOffset: -1 },
      chord:    { waveform: "sawtooth", gain: 0.055, octaveOffset: 0 },
      arpeggio: { waveform: "sine",     gain: 0.045, octaveOffset: 1 },
    },
    noteStyle: "pad",
    baseGain: 0.7,
    useReverb: true,
    reverbMix: 0.25,
    vibratoDepth: 0.8,
    voiceCount: 4,
    lfoHz: 0.4,
    arpStyle: "add9",
  },
  // Game: driving, plucky with walking bass
  game: {
    progression: ["Am7", "Fmaj7", "Cadd9", "G7"],
    chordDuration: 0.9,
    layers: {
      bass:     { waveform: "triangle", gain: 0.10, octaveOffset: -1 },
      chord:    { waveform: "square",   gain: 0.06, octaveOffset: 0 },
      arpeggio: { waveform: "square",   gain: 0.025, octaveOffset: 1 },
    },
    noteStyle: "staccato",
    baseGain: 0.55,
    useReverb: true,
    reverbMix: 0.15,
    useDelay: true,
    delayMix: 0.18,
    vibratoDepth: 0,
    voiceCount: 3,
    bassLine: "walking",
  },
  // Guide: gentle organ swell with sustained pad
  guide: {
    progression: ["Cadd9", "Fadd9", "Cadd9", "G7"],
    chordDuration: 1.8,
    layers: {
      bass:  { waveform: "sine",     gain: 0.07, octaveOffset: -1 },
      chord: { waveform: "sine",     gain: 0.05, octaveOffset: 0 },
      pad:   { waveform: "triangle", gain: 0.04, octaveOffset: 1 },
    },
    noteStyle: "sustain",
    baseGain: 0.5,
    useReverb: true,
    reverbMix: 0.2,
    vibratoDepth: 0,
    voiceCount: 3,
    attackOverride: 0.3,
  },
  // Pause: held-breath, underwater filtered with tremolo
  pause: {
    progression: ["G", "Gsus", "G", "Gsus"],
    chordDuration: 3.5,
    layers: {
      bass:  { waveform: "sine", gain: 0.04, octaveOffset: -1 },
      chord: { waveform: "sine", gain: 0.03, octaveOffset: 0 },
    },
    noteStyle: "sustain",
    baseGain: 0.3,
    useReverb: true,
    reverbMix: 0.4,
    vibratoDepth: 0.4,
    voiceCount: 3,
    filterCutoffMult: 0.4,
    tremoloHz: 2.0,
  },
};

// ================= Scene DSP Presets =================
interface SceneConfig {
  lpfFreq: number;
  lpfQ: number;
  reverbWet: number;
  delayTime?: number;
  delayFeedback?: number;
  delayMix?: number;
}

const SCENE_PRESETS: Record<ScenePreset, SceneConfig> = {
  normal: { lpfFreq: 20000, lpfQ: 1.0, reverbWet: 0.25 },
  pause:  { lpfFreq: 700,   lpfQ: 2.5, reverbWet: 0.50, delayTime: 0.3, delayFeedback: 0.3, delayMix: 0.15 },
  menu:   { lpfFreq: 5000,  lpfQ: 0.8, reverbWet: 0.35 },
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
  private bgmFilters: BiquadFilterNode[] = [];
  private bgmTimer: number | null = null;
  private isPlaying: boolean = false;

  // Phase 1: Global filter LFO for breathing/pad motion
  private filterLFO: OscillatorNode | null = null;
  private filterLFODepth: GainNode | null = null;

  // Phase 2: Scene DSP nodes
  private sceneLPF: BiquadFilterNode | null = null;
  private sceneGain: GainNode | null = null;
  private sceneDelay: DelayNode | null = null;
  private sceneDelayFeedback: GainNode | null = null;
  private sceneDelayMix: GainNode | null = null;
  private sceneDelaySend: GainNode | null = null;
  private reverbSend: GainNode | null = null;

  // Legacy delay for per-pattern arpeggio echo (bypasses scene LPF)
  private delayNode: DelayNode | null = null;
  private delayGain: GainNode | null = null;

  // Impulse response reverb
  private reverbNode: ConvolverNode | null = null;

  private sfxVolume: number = 0.6;
  private bgmVolume: number = 0.3;
  private isMuted: boolean = false;
  private initialized: boolean = false;
  private pendingInit: (() => void)[] = [];

  // Phase 3: Dynamic intensity (0~1) drives tempo and LFO depth
  private intensity: number = 0;

  private constructor() {
    this.preloadSFX();
  }

  static getInstance(): AudioManager {
    if (!AudioManager.instance) {
      AudioManager.instance = new AudioManager();
    }
    return AudioManager.instance;
  }

  // ================= AudioContext and Effects Setup =================
  private ensureContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();

      // Master gain to destination
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.isMuted ? 0 : this.bgmVolume;
      this.masterGain.connect(this.ctx.destination);

      // Phase 2: Scene DSP chain (inserted before masterGain)
      this.sceneLPF = this.ctx.createBiquadFilter();
      this.sceneLPF.type = "lowpass";
      this.sceneLPF.frequency.value = 20000;
      this.sceneLPF.Q.value = 1.0;

      this.sceneGain = this.ctx.createGain();
      this.sceneGain.gain.value = 1.0;

      this.sceneLPF.connect(this.sceneGain);
      this.sceneGain.connect(this.masterGain);

      // Scene delay (used for pause/underwater)
      this.sceneDelay = this.ctx.createDelay(1.0);
      this.sceneDelay.delayTime.value = 0.3;

      this.sceneDelayFeedback = this.ctx.createGain();
      this.sceneDelayFeedback.gain.value = 0;

      this.sceneDelayMix = this.ctx.createGain();
      this.sceneDelayMix.gain.value = 0;

      this.sceneDelaySend = this.ctx.createGain();
      this.sceneDelaySend.gain.value = 0;

      this.sceneDelay.connect(this.sceneDelayFeedback);
      this.sceneDelayFeedback.connect(this.sceneDelay);
      this.sceneDelay.connect(this.sceneDelayMix);
      this.sceneDelayMix.connect(this.sceneLPF);

      // Reverb (parallel, bypasses scene LPF for natural tail)
      this.reverbNode = this.ctx.createConvolver();
      this.reverbNode.buffer = this.createReverbIR(this.ctx, 1.5);
      this.reverbNode.connect(this.masterGain);

      this.reverbSend = this.ctx.createGain();
      this.reverbSend.gain.value = 0.25;
      this.reverbSend.connect(this.reverbNode);

      // Legacy per-pattern delay (arpeggio echo, bypasses scene LPF)
      this.delayNode = this.ctx.createDelay(1.0);
      this.delayNode.delayTime.value = 0.35;
      this.delayGain = this.ctx.createGain();
      this.delayGain.gain.value = 0;
      this.delayNode.connect(this.delayGain);
      this.delayGain.connect(this.masterGain);

      // Phase 1: Global filter LFO for breathing/pad motion
      this.filterLFO = this.ctx.createOscillator();
      this.filterLFO.type = "sine";
      this.filterLFO.frequency.value = 0.6;

      this.filterLFODepth = this.ctx.createGain();
      this.filterLFODepth.gain.value = 100;

      this.filterLFO.connect(this.filterLFODepth);
      this.filterLFO.start();
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
        const env = Math.exp(-t * 4 / decay) * (0.5 + 0.5 * Math.random());
        data[i] = (Math.random() * 2 - 1) * env;
      }
    }
    return buffer;
  }

  // ================= SFX Generation =================
  private generateWavURI(
    frequencies: number[],
    duration: number,
    volume: number,
    type: OscillatorType = "sine",
    glide?: { from: number; to: number }
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
      for (const freq of frequencies) {
        let val: number;
        switch (type) {
          case "square": val = Math.sin(2 * Math.PI * freq * t) >= 0 ? 0.5 : -0.5; break;
          case "triangle": val = 2 / Math.PI * Math.asin(Math.sin(2 * Math.PI * freq * t)); break;
          default: val = Math.sin(2 * Math.PI * freq * t);
        }
        sample += val;
      }
      if (glide) {
        const progress = t / duration;
        const currentFreq = glide.from + (glide.to - glide.from) * progress;
        let glideSample = 0;
        for (const freq of frequencies) {
          if (freq === frequencies[0]) {
            glideSample = Math.sin(2 * Math.PI * currentFreq * t);
          } else {
            glideSample += Math.sin(2 * Math.PI * freq * t);
          }
        }
        sample = glideSample / frequencies.length;
      } else {
        sample /= frequencies.length;
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

  private preloadSFX(): void {
    this.sfxCache["click"] = new Audio(this.generateWavURI([660, 1320], 0.07, 0.4, "square"));
    this.sfxCache["win"]   = new Audio(this.generateWavURI([523, 659, 784], 0.4, 0.5, "triangle", { from: 523, to: 1047 }));
    this.sfxCache["lose"]  = new Audio(this.generateWavURI([220, 330], 0.5, 0.45, "triangle", { from: 440, to: 220 }));
    this.sfxCache["hover"] = new Audio(this.generateWavURI([440, 443], 0.04, 0.2, "sine"));
  }

  // ================= BGM Synthesis =================
  private stopBGM(): void {
    if (this.bgmTimer !== null) {
      clearTimeout(this.bgmTimer);
      this.bgmTimer = null;
    }
    for (const osc of this.bgmOscillators) {
      try { osc.stop(); } catch (_) { /* already stopped */ }
    }
    this.bgmOscillators = [];
    // Disconnect per-voice filters from the global LFO
    for (const filter of this.bgmFilters) {
      try {
        if (this.filterLFODepth) this.filterLFODepth.disconnect(filter.frequency);
      } catch (_) { /* already disconnected */ }
    }
    this.bgmFilters = [];
    this.isPlaying = false;
    if (this.delayGain) this.delayGain.gain.value = 0;
  }

  /**
   * Phase 1: Rich voice with 3 detuned oscillators + per-voice ADSR filter.
   * Spawns a stack of detuned oscillators summed into a single GainNode,
   * then routed through a BiquadFilter with ADSR envelope on cutoff.
   */
  private createRichVoice(
    ctx: AudioContext,
    freq: number,
    type: OscillatorType,
    start: number,
    duration: number,
    attack: number,
    release: number,
    gainVal: number,
    style: string,
    dest: AudioNode,
    voiceCount: number,
    humanizeGain: number,
    filterCutoffMult: number,
    tremoloHz: number,
  ): void {
    const voiceSum = ctx.createGain();
    voiceSum.gain.value = 1.0;

    // Detune values in cents: -6, 0, +6
    const detunes = [-6, 0, 6];
    const count = Math.min(voiceCount, detunes.length);

    for (let i = 0; i < count; i++) {
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();

      osc.type = type;
      osc.frequency.value = freq;
      osc.detune.value = detunes[i];

      const finalGain = gainVal * humanizeGain;
      oscGain.gain.setValueAtTime(0, start);
      oscGain.gain.linearRampToValueAtTime(finalGain, start + attack);

      if (style === "staccato") {
        const noteLen = duration * 0.35;
        oscGain.gain.setValueAtTime(finalGain, start + noteLen);
        oscGain.gain.linearRampToValueAtTime(0, start + noteLen + release);
      } else {
        oscGain.gain.setValueAtTime(finalGain, start + duration - release);
        oscGain.gain.linearRampToValueAtTime(0, start + duration);
      }

      // Tremolo (amplitude modulation) for pause/underwater held-breath effect
      if (tremoloHz > 0 && style === "sustain") {
        const tremLFO = ctx.createOscillator();
        const tremDepth = ctx.createGain();
        tremLFO.type = "sine";
        tremLFO.frequency.value = tremoloHz;
        tremDepth.gain.value = 0.15;
        tremLFO.connect(tremDepth);
        tremDepth.connect(oscGain.gain);
        tremLFO.start(start);
        tremLFO.stop(start + duration + release);
        this.bgmOscillators.push(tremLFO);
      }

      osc.connect(oscGain);
      oscGain.connect(voiceSum);
      osc.start(start);
      osc.stop(start + duration + release);
      this.bgmOscillators.push(osc);
    }

    // Per-voice BiquadFilter with ADSR envelope
    const voiceFilter = ctx.createBiquadFilter();
    voiceFilter.type = "lowpass";
    voiceFilter.Q.value = 0.9;

    const baseFilterFreq = freq * 0.5;
    const cutMult = (filterCutoffMult > 0) ? filterCutoffMult : 1.0;

    // ADSR on filter cutoff: attack opens, decay drops, sustain holds, release closes
    voiceFilter.frequency.setValueAtTime(baseFilterFreq * 0.05, start);
    voiceFilter.frequency.linearRampToValueAtTime(freq * 1.5 * cutMult, start + attack);

    const decayStart = start + attack + 0.08;
    voiceFilter.frequency.linearRampToValueAtTime(freq * 0.8 * cutMult, decayStart);

    const sustainStart = start + attack + 0.15;
    voiceFilter.frequency.setValueAtTime(freq * 0.6 * cutMult, sustainStart);

    voiceFilter.frequency.linearRampToValueAtTime(baseFilterFreq * 0.05 * cutMult, start + duration);

    // Connect global LFO to filter cutoff for breathing motion
    if (this.filterLFODepth) {
      try {
        this.filterLFODepth.connect(voiceFilter.frequency);
      } catch (_) { /* connection may already exist */ }
    }

    voiceSum.connect(voiceFilter);
    voiceFilter.connect(dest);
    this.bgmFilters.push(voiceFilter);
  }

  private scheduleChord(
    ctx: AudioContext,
    pattern: BGMPattern,
    chordIndex: number,
    startTime: number,
    gainNode: GainNode,
  ): void {
    const chordName = pattern.progression[chordIndex];
    let notes = CHORDS[chordName];
    if (!notes) {
      const base = chordName.replace(/maj7|7|add9|m7|sus/g, "");
      notes = CHORDS[base] || CHORDS["C"];
    }
    if (!notes) return;

    // Phase 3: Humanization - randomize time and gain per chord
    const humanizeTime = (Math.random() - 0.5) * 0.024; // plus/minus 12ms
    const humanizeGainBase = 1 + (Math.random() - 0.5) * 0.12; // plus/minus 6 percent

    // Phase 3: Intensity drives tempo speed-up above 0.5
    const speedMul = this.intensity > 0.5
      ? (1 - this.intensity * 0.2)
      : 1;
    const dur = pattern.chordDuration * speedMul;
    const attack = pattern.attackOverride ?? Math.min(dur * 0.08, 0.15);
    const release = Math.min(dur * 0.3, 0.5);

    const voiceCount = pattern.voiceCount ?? 3;
    const cutMult = pattern.filterCutoffMult ?? 0;
    const tremHz = pattern.tremoloHz ?? 0;

    const sorted = notes
      .map(n => ({ name: n, freq: NOTE_FREQ[n] }))
      .filter(n => n.freq)
      .sort((a, b) => a.freq - b.freq);
    if (sorted.length === 0) return;

    const rootFreq = sorted[0].freq;
    const chordFreqs = sorted.map(n => n.freq);

    // Bass layer
    const bassLayer = pattern.layers.bass;
    if (pattern.bassLine === "walking") {
      // Walking bass: descending chromatic approach over 4-chord cycle
      const walkLine = WALKING_BASS[chordName];
      if (walkLine && walkLine.length > 0) {
        const stepDur = dur / walkLine.length;
        for (let i = 0; i < walkLine.length; i++) {
          const noteFreq = NOTE_FREQ[walkLine[i]] || rootFreq * Math.pow(2, bassLayer.octaveOffset);
          const stepStart = startTime + humanizeTime + i * stepDur;
          const stepHumanize = humanizeGainBase + (Math.random() - 0.5) * 0.06;
          this.createRichVoice(
            ctx, noteFreq, bassLayer.waveform,
            stepStart, stepDur * 0.85, attack * 0.5, release * 0.5,
            bassLayer.gain * pattern.baseGain, "staccato",
            gainNode, voiceCount, stepHumanize, cutMult, tremHz,
          );
        }
      } else {
        this.createRichVoice(
          ctx, rootFreq * Math.pow(2, bassLayer.octaveOffset), bassLayer.waveform,
          startTime + humanizeTime, dur, attack, release,
          bassLayer.gain * pattern.baseGain, pattern.noteStyle,
          gainNode, voiceCount, humanizeGainBase, cutMult, tremHz,
        );
      }
    } else {
      this.createRichVoice(
        ctx, rootFreq * Math.pow(2, bassLayer.octaveOffset), bassLayer.waveform,
        startTime + humanizeTime, dur, attack, release,
        bassLayer.gain * pattern.baseGain, pattern.noteStyle,
        gainNode, voiceCount, humanizeGainBase, cutMult, tremHz,
      );
    }

    // Chord layer
    const chordLayer = pattern.layers.chord;
    for (const freq of chordFreqs) {
      const perNoteHumanize = humanizeGainBase + (Math.random() - 0.5) * 0.06;
      this.createRichVoice(
        ctx, freq * Math.pow(2, chordLayer.octaveOffset), chordLayer.waveform,
        startTime + humanizeTime, dur, attack, release,
        chordLayer.gain * pattern.baseGain, pattern.noteStyle,
        gainNode, voiceCount, perNoteHumanize, cutMult, tremHz,
      );
    }

    // Arpeggio layer
    if (pattern.layers.arpeggio) {
      const arpLayer = pattern.layers.arpeggio;
      if (pattern.arpStyle === "add9") {
        // 16th-note shimmer arpeggios using Add9 inversion sets
        const arpNotes = ADD9_ARPEGGIOS[chordName] || sorted.map(n => n.name);
        const arpFreqs = arpNotes.map(n => NOTE_FREQ[n] || 440).filter(f => f > 0);
        const noteDuration = dur / arpFreqs.length;
        for (let i = 0; i < arpFreqs.length; i++) {
          const freq = arpFreqs[i] * Math.pow(2, arpLayer.octaveOffset);
          const noteStart = startTime + humanizeTime + i * noteDuration;
          const arpHumanize = humanizeGainBase + (Math.random() - 0.5) * 0.06;
          this.createRichVoice(
            ctx, freq, arpLayer.waveform,
            noteStart, noteDuration * 0.7, attack * 0.3, release * 0.2,
            arpLayer.gain * pattern.baseGain, "staccato",
            gainNode, 2, arpHumanize, cutMult, 0,
          );
        }
      } else {
        const arpNotes = sorted.map(n => n.freq * Math.pow(2, arpLayer.octaveOffset));
        const noteDuration = dur / arpNotes.length;
        for (let i = 0; i < arpNotes.length; i++) {
          const freq = arpNotes[i];
          const noteStart = startTime + humanizeTime + i * noteDuration * 0.9;
          const arpHumanize = humanizeGainBase + (Math.random() - 0.5) * 0.06;
          this.createRichVoice(
            ctx, freq, arpLayer.waveform,
            noteStart, noteDuration * 0.7, attack * 0.5, release * 0.3,
            arpLayer.gain * pattern.baseGain, "staccato",
            gainNode, 2, arpHumanize, cutMult, 0,
          );
        }
      }
      // Enable delay for arpeggio layer
      if (pattern.useDelay && this.delayGain) {
        this.delayGain.gain.setValueAtTime(pattern.delayMix || 0.15, startTime);
      }
    }

    // Pad layer (soft organ swell for guide)
    if (pattern.layers.pad) {
      const padLayer = pattern.layers.pad;
      // Play 5th and 9th above root, fading in slowly
      const padNotes = [
        rootFreq * Math.pow(2, 7 / 12 + padLayer.octaveOffset),  // 5th
        rootFreq * Math.pow(2, 14 / 12 + padLayer.octaveOffset), // 9th
      ];
      for (const freq of padNotes) {
        const padHumanize = humanizeGainBase + (Math.random() - 0.5) * 0.06;
        this.createRichVoice(
          ctx, freq, padLayer.waveform,
          startTime + humanizeTime, dur, attack, release * 1.3,
          padLayer.gain * pattern.baseGain, "sustain",
          gainNode, 3, padHumanize, cutMult, 0,
        );
      }
    }

    // Schedule next chord (guard against stale timers from stopped BGM)
    const nextIndex = (chordIndex + 1) % pattern.progression.length;
    const nextTime = startTime + dur;
    const delayMs = (nextTime - ctx.currentTime) * 1000;

    this.bgmTimer = window.setTimeout(() => {
      if (!this.isPlaying) return;
      this.scheduleChord(ctx, pattern, nextIndex, nextTime, gainNode);
    }, Math.max(delayMs, 10));
  }

  private startBGMPattern(track: BGMTrack): void {
    const ctx = this.ensureContext();
    this.stopBGM();

    const pattern = BGM_PATTERNS[track];

    // Update global LFO rate for this pattern
    if (this.filterLFO) {
      const lfoHz = pattern.lfoHz ?? 0.6;
      this.filterLFO.frequency.setValueAtTime(lfoHz, ctx.currentTime);
    }

    // Phase 3: LFO depth scales with intensity (up to 30 percent increase)
    if (this.filterLFODepth) {
      const lfoDepth = 100 * (1 + this.intensity * 0.3);
      this.filterLFODepth.gain.setValueAtTime(lfoDepth, ctx.currentTime);
    }

    // Per-track gain node feeds into scene DSP chain
    this.bgmGainNode = ctx.createGain();
    this.bgmGainNode.gain.value = 0;

    // Dry path: bgmGain to sceneLPF to sceneGain to masterGain
    this.bgmGainNode.connect(this.sceneLPF!);

    // Delay send for pause scene
    this.bgmGainNode.connect(this.sceneDelaySend!);

    // Reverb send (parallel, bypasses scene LPF)
    this.bgmGainNode.connect(this.reverbSend!);

    const startTime = ctx.currentTime + 0.05;
    this.isPlaying = true;
    this.scheduleChord(ctx, pattern, 0, startTime, this.bgmGainNode);

    // Fade in
    const targetVol = this.isMuted ? 0 : 1;
    this.bgmGainNode.gain.linearRampToValueAtTime(targetVol, startTime + 0.6);
  }

  // ================= Phase 2: Scene DSP =================

  /**
   * Smoothly transitions the global scene DSP (LPF, reverb wet, optional delay).
   * Uses linearRampToValueAtTime for all parameters.
   */
  applyScene(preset: ScenePreset, transitionTime: number = 0.8): void {
    const ctx = this.ensureContext();
    const cfg = SCENE_PRESETS[preset];
    const now = ctx.currentTime;
    const end = now + transitionTime;


    // Scene LPF
    if (this.sceneLPF) {
      this.sceneLPF.frequency.linearRampToValueAtTime(cfg.lpfFreq, end);
      this.sceneLPF.Q.linearRampToValueAtTime(cfg.lpfQ, end);
    }

    // Reverb send (bypasses LPF for natural tail)
    if (this.reverbSend) {
      this.reverbSend.gain.linearRampToValueAtTime(cfg.reverbWet, end);
    }

    // Scene delay (pause/underwater only)
    if (cfg.delayTime !== undefined && this.sceneDelay) {
      this.sceneDelay.delayTime.linearRampToValueAtTime(cfg.delayTime, end);
      this.sceneDelayFeedback!.gain.linearRampToValueAtTime(cfg.delayFeedback ?? 0, end);
      this.sceneDelayMix!.gain.linearRampToValueAtTime(cfg.delayMix ?? 0, end);
      this.sceneDelaySend!.gain.linearRampToValueAtTime(1.0, end);
    } else {
      if (this.sceneDelaySend) this.sceneDelaySend.gain.linearRampToValueAtTime(0, end);
      if (this.sceneDelayMix) this.sceneDelayMix.gain.linearRampToValueAtTime(0, end);
    }
  }

  // ================= Phase 3: Intensity Control =================

  /**
   * Sets the global intensity (0 to 1). Drives tempo speed-up and LFO modulation depth.
   */
  setIntensity(val: number): void {
    this.intensity = Math.max(0, Math.min(1, val));
    if (this.filterLFODepth && this.ctx) {
      const lfoDepth = 100 * (1 + this.intensity * 0.3);
      this.filterLFODepth.gain.setValueAtTime(lfoDepth, this.ctx.currentTime);
    }
  }

  // ================= Public API (unchanged signatures) =================

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

    // Crossfade: fade out old bgmGain
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

    // Auto-apply scene based on track
    if (track === "pause") {
      this.applyScene("pause", 0.6);
    } else if (track === "menu") {
      this.applyScene("menu", 0.6);
    } else {
      this.applyScene("normal", 0.6);
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
