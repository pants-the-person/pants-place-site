import { computed, signal } from '@preact/signals';
import type { MediaEntry } from '../integrations/media-manifest';
import media from 'virtual:media-manifest';
import { audioContext, audioMaster } from './audio';
import processorUrl from 'spessasynth_lib/dist/spessasynth_processor.min.js?url';

export type VisualizerMode = 'spectrum' | 'oscilloscope' | 'off';

export const tracks = signal<MediaEntry[]>(media);
export const currentIndex = signal(-1);
export const playing = signal(false);
export const paused = signal(false);
export const position = signal(0);
export const duration = signal(0);
export const volume = signal(0.75);
export const shuffle = signal(false);
export const repeat = signal(false);
export const visualizer = signal<VisualizerMode>('spectrum');
export const spectrum = signal<number[]>(new Array(20).fill(0));
export const eqBands = signal<number[]>(new Array(10).fill(0));
export const midiLoading = signal(false);
export const engineError = signal<string | null>(null);

export const currentTrack = computed(() =>
  currentIndex.value >= 0 ? tracks.value[currentIndex.value] ?? null : null,
);

const EQ_FREQS = [60, 170, 310, 600, 1000, 3000, 6000, 12000, 14000, 16000];

let eqNodes: BiquadFilterNode[] = [];
let playerGain: GainNode | null = null;
let analyser: AnalyserNode | null = null;
let audioBufferSource: AudioBufferSourceNode | null = null;
let audioBuffer: AudioBuffer | null = null;
let audioStartedAt = 0;
let audioOffset = 0;
let audioCache = new Map<string, AudioBuffer>();
let synth: import('spessasynth_lib').WorkletSynthesizer | null = null;
let sequencer: import('spessasynth_lib').Sequencer | null = null;
let soundfontLoaded = false;
let midiBufferCache = new Map<string, ArrayBuffer>();
let raf = 0;
let lastPositionUpdate = 0;

function ensureChain() {
  const ctx = audioContext();
  if (playerGain) return;
  playerGain = ctx.createGain();
  playerGain.gain.value = volume.value;
  analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.72;
  eqNodes = EQ_FREQS.map((freq) => {
    const node = ctx.createBiquadFilter();
    node.type = 'peaking';
    node.frequency.value = freq;
    node.Q.value = 1;
    node.gain.value = 0;
    return node;
  });
  eqNodes.forEach((node, i) => {
    const next = eqNodes[i + 1] ?? playerGain;
    node.connect(next);
  });
  playerGain.connect(analyser);
  analyser.connect(audioMaster());
}

function chainInput(): AudioNode {
  ensureChain();
  return eqNodes[0];
}

function stopSources() {
  if (audioBufferSource) {
    try {
      audioBufferSource.onended = null;
      audioBufferSource.stop();
    } catch {
      /* already stopped */
    }
    audioBufferSource.disconnect();
    audioBufferSource = null;
  }
  if (sequencer) {
    try {
      sequencer.pause();
    } catch {
      /* not playing */
    }
  }
  playing.value = false;
}

function playAudio(track: MediaEntry, from = 0) {
  const ctx = audioContext();
  ensureChain();
  if (!audioBuffer) return;
  audioBufferSource = ctx.createBufferSource();
  audioBufferSource.buffer = audioBuffer;
  audioBufferSource.connect(chainInput());
  audioOffset = Math.min(Math.max(from, 0), audioBuffer.duration);
  audioStartedAt = ctx.currentTime - audioOffset;
  audioBufferSource.onended = () => {
    if (!playing.value) return;
    onTrackEnded();
  };
  audioBufferSource.start(0, audioOffset);
  playing.value = true;
  paused.value = false;
  duration.value = audioBuffer.duration;
}

async function ensureMidi(): Promise<boolean> {
  if (synth && sequencer) return true;
  const ctx = audioContext();
  midiLoading.value = true;
  engineError.value = null;
  try {
    const mod = await import('spessasynth_lib');
    await ctx.audioWorklet.addModule(processorUrl);
    const newSynth = new mod.WorkletSynthesizer(ctx);
    if (!soundfontLoaded) {
      const response = await fetch('/soundfonts/TimGM6mb.sf2');
      if (!response.ok) throw new Error('SoundFont not found');
      const sf = await response.arrayBuffer();
      await newSynth.soundBankManager.addSoundBank(sf, 'TimGM6mb');
      soundfontLoaded = true;
    }
    await newSynth.isReady;
    newSynth.connect(chainInput());
    const newSeq = new mod.Sequencer(newSynth);
    newSeq.eventHandler.addEvent('songEnded', 'winamp', () => onTrackEnded());
    synth = newSynth;
    sequencer = newSeq;
    return true;
  } catch (error) {
    engineError.value = error instanceof Error ? error.message : String(error);
    return false;
  } finally {
    midiLoading.value = false;
  }
}

async function playMidi(track: MediaEntry, from = 0) {
  const ok = await ensureMidi();
  if (!ok || !sequencer) return;
  ensureChain();
  sequencer.pause();
  let buffer = midiBufferCache.get(track.url);
  if (!buffer) {
    const response = await fetch(track.url);
    if (!response.ok) throw new Error(`Could not load ${track.name}`);
    buffer = await response.arrayBuffer();
    midiBufferCache.set(track.url, buffer);
  }
  sequencer.loadNewSongList([{ binary: buffer.slice(0), fileName: track.name }]);
  sequencer.currentTime = from;
  sequencer.play();
  playing.value = true;
  paused.value = false;
  duration.value = sequencer.duration || 0;
}

function onTrackEnded() {
  playing.value = false;
  if (repeat.value) {
    void playIndex(currentIndex.value, 0);
    return;
  }
  next(true);
}

export async function playIndex(index: number, from = 0) {
  if (index < 0 || index >= tracks.value.length) return;
  stopSources();
  currentIndex.value = index;
  position.value = from;
  duration.value = 0;
  const track = tracks.value[index];
  try {
    if (track.kind === 'midi') {
      await playMidi(track, from);
    } else {
      const ctx = audioContext();
      ensureChain();
      let buffer = audioCache.get(track.url);
      if (!buffer) {
        const response = await fetch(track.url);
        if (!response.ok) throw new Error(`Could not load ${track.name}`);
        const data = await response.arrayBuffer();
        buffer = await ctx.decodeAudioData(data);
        audioCache.set(track.url, buffer);
      }
      audioBuffer = buffer;
      playAudio(track, from);
    }
  } catch (error) {
    engineError.value = error instanceof Error ? error.message : String(error);
    playing.value = false;
    paused.value = false;
  }
}

export function playTrackById(mediaId: string) {
  const index = tracks.value.findIndex((track) => track.id === mediaId);
  if (index >= 0) void playIndex(index);
}

export function togglePlay() {
  if (playing.value && !paused.value) {
    pause();
    return;
  }
  if (paused.value && sequencer && currentTrack.value?.kind === 'midi') {
    sequencer.play();
    playing.value = true;
    paused.value = false;
    return;
  }
  if (paused.value && currentTrack.value?.kind === 'audio' && audioBuffer) {
    playAudio(currentTrack.value, audioOffset);
    return;
  }
  if (currentIndex.value < 0 && tracks.value.length) {
    const preferred = tracks.value.findIndex((track) => track.id === 'pants-theme-mid');
    void playIndex(preferred >= 0 ? preferred : 0);
  } else if (currentIndex.value >= 0) {
    void playIndex(currentIndex.value, position.value);
  }
}

export function pause() {
  if (!playing.value) return;
  if (currentTrack.value?.kind === 'midi' && sequencer) {
    sequencer.pause();
    position.value = sequencer.currentTime;
  } else {
    audioOffset = Math.max(0, audioContext().currentTime - audioStartedAt);
    position.value = audioOffset;
    stopSources();
  }
  playing.value = false;
  paused.value = true;
}

export function stop() {
  stopSources();
  position.value = 0;
  paused.value = false;
  if (sequencer) sequencer.currentTime = 0;
}

export function next(auto = false) {
  if (!tracks.value.length) return;
  if (repeat.value && !auto) {
    void playIndex(currentIndex.value, 0);
    return;
  }
  let nextIndex: number;
  if (shuffle.value) {
    nextIndex = Math.floor(Math.random() * tracks.value.length);
    if (tracks.value.length > 1 && nextIndex === currentIndex.value) {
      nextIndex = (nextIndex + 1) % tracks.value.length;
    }
  } else {
    nextIndex = currentIndex.value + 1;
    if (nextIndex >= tracks.value.length) {
      if (repeat.value) nextIndex = 0;
      else {
        stop();
        position.value = 0;
        return;
      }
    }
  }
  void playIndex(nextIndex);
}

export function prev() {
  if (!tracks.value.length) return;
  if (position.value > 3) {
    seek(0);
    return;
  }
  const index = currentIndex.value - 1;
  void playIndex(index < 0 ? tracks.value.length - 1 : index);
}

export function seek(seconds: number) {
  if (currentIndex.value < 0) return;
  const clamped = Math.min(Math.max(seconds, 0), duration.value || seconds);
  position.value = clamped;
  if (currentTrack.value?.kind === 'midi' && sequencer) {
    sequencer.currentTime = clamped;
    if (!playing.value && paused.value) {
      sequencer.play();
      playing.value = true;
      paused.value = false;
    }
  } else if (currentTrack.value?.kind === 'audio' && audioBuffer) {
    stopSources();
    audioBufferSource = null;
    playAudio(currentTrack.value, clamped);
  }
}

export function setVolume(value: number) {
  volume.value = Math.min(1, Math.max(0, value));
  if (playerGain) playerGain.gain.value = volume.value;
  try {
    localStorage.setItem('pp98:volume', String(volume.value));
  } catch {
    /* ignore */
  }
}

export function removeTrack(index: number) {
  if (index < 0 || index >= tracks.value.length) return;
  const wasCurrent = index === currentIndex.value;
  tracks.value = tracks.value.filter((_, i) => i !== index);
  if (wasCurrent) {
    stop();
    currentIndex.value = Math.min(index, tracks.value.length - 1);
  } else if (index < currentIndex.value) {
    currentIndex.value = currentIndex.value - 1;
  }
}

export function setEqBand(index: number, value: number) {
  const bands = [...eqBands.value];
  bands[index] = value;
  eqBands.value = bands;
  if (eqNodes[index]) eqNodes[index].gain.value = value;
}

export function resetEq() {
  eqBands.value = new Array(10).fill(0);
  eqNodes.forEach((node) => (node.gain.value = 0));
}

function updateSpectrum() {
  if (!analyser) return;
  if (visualizer.value === 'off') {
    spectrum.value = new Array(20).fill(0);
    return;
  }
  if (visualizer.value === 'oscilloscope') {
    const time = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(time);
    const bars: number[] = [];
    const step = Math.max(1, Math.floor(time.length / 20));
    for (let i = 0; i < 20; i++) {
      let peak = 0;
      for (let j = 0; j < step; j++) {
        peak = Math.max(peak, Math.abs((time[i * step + j] ?? 128) - 128));
      }
      bars.push(Math.min(100, (peak / 128) * 100));
    }
    spectrum.value = bars;
    return;
  }
  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(data);
  const bars: number[] = [];
  const step = Math.floor(data.length / 20);
  for (let i = 0; i < 20; i++) {
    let sum = 0;
    for (let j = 0; j < step; j++) sum += data[i * step + j] ?? 0;
    bars.push(Math.min(100, (sum / step / 255) * 130));
  }
  spectrum.value = bars;
}

function tick(now: number) {
  if (playing.value) {
    if (currentTrack.value?.kind === 'midi' && sequencer) {
      position.value = sequencer.currentTime;
      if (!duration.value && sequencer.duration) duration.value = sequencer.duration;
    } else if (audioBuffer) {
      position.value = Math.max(0, audioContext().currentTime - audioStartedAt);
    }
    if (now - lastPositionUpdate > 80) {
      updateSpectrum();
      lastPositionUpdate = now;
    }
  } else if (paused.value) {
    if (now - lastPositionUpdate > 120) {
      spectrum.value = spectrum.value.map((value) => Math.max(0, value - 4));
      lastPositionUpdate = now;
    }
  }
  raf = requestAnimationFrame(tick);
}

export function startPlayerLoop() {
  if (raf) return;
  try {
    const saved = localStorage.getItem('pp98:volume');
    if (saved) {
      volume.value = Number(saved);
      if (playerGain) playerGain.gain.value = volume.value;
    }
  } catch {
    /* ignore */
  }
  raf = requestAnimationFrame(tick);
}

export function stopPlayerLoop() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
}

export function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
