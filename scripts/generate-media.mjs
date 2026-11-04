// Generates original demo MIDI tracks for the Winamp playlist.
// Run with: node scripts/generate-media.mjs
import fs from 'node:fs';
import path from 'node:path';
import MidiWriter from 'midi-writer-js';

const outDir = path.resolve('public/media');
fs.mkdirSync(outDir, { recursive: true });

const note = (pitch, duration, extra = {}) =>
  new MidiWriter.NoteEvent({ pitch, duration, velocity: 82, ...extra });

function melodyTrack(name, instrument, notes, channel = 0) {
  const track = new MidiWriter.Track();
  track.addTrackName(name);
  track.setTempo(112);
  track.addEvent(new MidiWriter.ProgramChangeEvent({ instrument, channel }));
  for (const [pitch, duration] of notes) {
    track.addEvent(note(pitch, duration, { channel }));
  }
  return track;
}

function bassTrack(notes) {
  const track = new MidiWriter.Track();
  track.addTrackName('Bass');
  track.setTempo(112);
  track.addEvent(new MidiWriter.ProgramChangeEvent({ instrument: 34, channel: 1 }));
  for (const [pitch, duration] of notes) {
    track.addEvent(note(pitch, duration, { channel: 1 }));
  }
  return track;
}

function drumTrack() {
  const track = new MidiWriter.Track();
  track.addTrackName('Drums');
  track.setTempo(112);
  track.addEvent(new MidiWriter.ProgramChangeEvent({ instrument: 0, channel: 9 }));
  for (let i = 0; i < 16; i++) {
    track.addEvent(note(i % 4 === 0 ? 'C2' : 'D2', '8', { channel: 9 }));
    track.addEvent(note(i % 2 === 0 ? 'F#2' : 'A#2', '8', { channel: 9 }));
  }
  return track;
}

const tunes = {
  'pants-theme.mid': [
    melodyTrack('Pants Place Theme', 81, [
      ['C5', '8'], ['E5', '8'], ['G5', '4'], ['E5', '8'], ['C5', '8'],
      ['D5', '4'], ['F5', '8'], ['A5', '8'], ['G5', '2'],
      ['E5', '8'], ['G5', '8'], ['C6', '4'], ['B5', '8'], ['G5', '8'],
      ['A5', '4'], ['F5', '8'], ['D5', '8'], ['C5', '2'],
    ]),
    bassTrack([
      ['C3', '4'], ['G2', '4'], ['A2', '4'], ['E2', '4'],
      ['F2', '4'], ['C3', '4'], ['G2', '4'], ['G2', '4'],
      ['C3', '4'], ['G2', '4'], ['A2', '4'], ['E2', '4'],
      ['F2', '4'], ['G2', '4'], ['C3', '2'],
    ]),
    drumTrack(),
  ],
  'dialup-blues.mid': [
    melodyTrack('Dial-Up Blues', 26, [
      ['A4', '4'], ['C5', '8'], ['A4', '8'], ['G4', '4'], ['E4', '4'],
      ['G4', '8'], ['A4', '8'], ['C5', '4'], ['D5', '4'], ['C5', '2'],
      ['E5', '4'], ['D5', '8'], ['C5', '8'], ['A4', '4'], ['G4', '4'],
      ['A4', '8'], ['G4', '8'], ['E4', '4'], ['A4', '2'],
    ]),
    bassTrack([
      ['A2', '4'], ['A2', '4'], ['G2', '4'], ['G2', '4'],
      ['F2', '4'], ['F2', '4'], ['E2', '4'], ['E2', '4'],
      ['A2', '4'], ['A2', '4'], ['G2', '4'], ['G2', '4'],
      ['F2', '4'], ['E2', '4'], ['A2', '2'],
    ]),
    drumTrack(),
  ],
  'overdrive-486.mid': [
    melodyTrack('486 Overdrive', 80, [
      ['E5', '8'], ['E5', '8'], ['G5', '8'], ['B5', '8'], ['A5', '4'], ['G5', '4'],
      ['E5', '8'], ['D5', '8'], ['E5', '8'], ['G5', '8'], ['A5', '2'],
      ['B5', '8'], ['A5', '8'], ['G5', '8'], ['E5', '8'], ['D5', '4'], ['E5', '4'],
      ['G5', '4'], ['A5', '4'], ['B5', '2'],
    ]),
    bassTrack([
      ['E2', '8'], ['E2', '8'], ['G2', '8'], ['B2', '8'], ['A2', '4'], ['G2', '4'],
      ['E2', '8'], ['D2', '8'], ['E2', '8'], ['G2', '8'], ['A2', '2'],
      ['B2', '8'], ['A2', '8'], ['G2', '8'], ['E2', '8'], ['D2', '4'], ['E2', '4'],
      ['G2', '4'], ['A2', '4'], ['B2', '2'],
    ]),
    drumTrack(),
  ],
};

for (const [filename, tracks] of Object.entries(tunes)) {
  const writer = new MidiWriter.Writer(tracks);
  const bytes = writer.buildFile();
  fs.writeFileSync(path.join(outDir, filename), Buffer.from(bytes));
  console.log(`wrote ${filename} (${bytes.length} bytes)`);
}
