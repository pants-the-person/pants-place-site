import { settings } from './settings';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

export function audioContext(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export function audioMaster(): GainNode {
  audioContext();
  return master!;
}

type SoundName = 'startup' | 'shutdown' | 'click' | 'ding' | 'error' | 'chime' | 'modem';

function tone(
  context: AudioContext,
  frequency: number,
  start: number,
  duration: number,
  gainValue = 0.12,
  type: OscillatorType = 'square',
) {
  const osc = context.createOscillator();
  const gain = context.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(gainValue, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain);
  gain.connect(master!);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

export function playSound(name: SoundName) {
  if (!settings.value.sound) return;
  const context = audioContext();
  const now = context.currentTime + 0.02;
  switch (name) {
    case 'startup': {
      const notes = [261.63, 329.63, 392.0, 523.25, 659.25];
      notes.forEach((f, i) => tone(context, f, now + i * 0.11, 1.4, 0.07, 'triangle'));
      tone(context, 130.81, now, 2.2, 0.05, 'sine');
      break;
    }
    case 'shutdown':
      tone(context, 523.25, now, 0.25, 0.08, 'triangle');
      tone(context, 392.0, now + 0.18, 0.3, 0.08, 'triangle');
      tone(context, 261.63, now + 0.38, 0.5, 0.08, 'triangle');
      break;
    case 'click':
      tone(context, 900, now, 0.035, 0.04, 'square');
      break;
    case 'ding':
      tone(context, 1046.5, now, 0.18, 0.06, 'sine');
      tone(context, 1568, now + 0.02, 0.14, 0.03, 'sine');
      break;
    case 'chime':
      [523.25, 659.25, 783.99].forEach((f, i) =>
        tone(context, f, now + i * 0.07, 0.35, 0.05, 'triangle'),
      );
      break;
    case 'error':
      tone(context, 220, now, 0.22, 0.08, 'sawtooth');
      tone(context, 164.81, now + 0.22, 0.32, 0.08, 'sawtooth');
      break;
    case 'modem': {
      const freqs = [1200, 2200, 980, 1650, 2100, 1300, 1800, 900];
      freqs.forEach((f, i) => tone(context, f, now + i * 0.12, 0.11, 0.03, 'sine'));
      break;
    }
  }
}
