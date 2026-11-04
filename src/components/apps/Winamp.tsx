import { useEffect } from 'preact/hooks';
import {
  currentTrack,
  currentIndex,
  duration,
  engineError,
  formatTime,
  midiLoading,
  next,
  pause,
  playing,
  playIndex,
  position,
  prev,
  repeat,
  seek,
  setVolume,
  shuffle,
  spectrum,
  togglePlay,
  tracks,
  visualizer,
  volume,
  stop,
  paused,
} from '../../kernel/player';
import { openApp, windows, closeWindow } from '../../kernel/windows';
import { showDialog } from '../../kernel/dialogs';
import { playSound } from '../../kernel/audio';
import type { AppProps } from '../../kernel/types';

export default function Winamp({ appProps, api, windowId }: AppProps) {
  const track = currentTrack.value;
  const title = track ? `${currentIndex.value + 1}. ${track.title}` : 'Pants Place Winamp';

  function openPanel(appId: 'winamp-playlist' | 'winamp-eq') {
    const host = windows.value.find((w) => w.id === windowId);
    if (!host) {
      openApp(appId);
      return;
    }
    const desired =
      appId === 'winamp-eq'
        ? { x: Math.min(host.x + host.w + 6, window.innerWidth - 340), y: host.y }
        : { x: host.x, y: Math.min(host.y + host.h + 4, window.innerHeight - 290) };
    openApp(appId, {}, desired);
  }

  useEffect(() => {
    return () => {
      for (const appId of ['winamp-playlist', 'winamp-eq']) {
        const panel = windows.value.find((w) => w.appId === appId);
        if (panel) closeWindow(panel.id);
      }
    };
  }, []);

  useEffect(() => {
    const mediaId = appProps.mediaId as string | undefined;
    if (mediaId) {
      const index = tracks.value.findIndex((t) => t.id === mediaId);
      if (index >= 0) void playIndex(index);
    }
  }, []);

  useEffect(() => {
    if (engineError.value) {
      void showDialog({
        title: 'Winamp',
        message: 'The MIDI engine could not start.',
        detail: engineError.value,
        kind: 'error',
        icon: '/icons/winamp.svg',
      });
    }
  }, [engineError.value]);

  useEffect(() => {
    if (midiLoading.value) api.notify('Loading General MIDI SoundFont...');
  }, [midiLoading.value]);

  function playPause() {
    playSound('click');
    togglePlay();
  }

  return (
    <div
      class="winamp"
      tabIndex={0}
      onKeyDown={(event) => {
        const key = event.key.toLowerCase();
        if (key === 'x') playPause();
        if (key === 'c') pause();
        if (key === 'v') stop();
        if (key === 'b') next();
        if (key === 'z') prev();
        if (key === 's') shuffle.value = !shuffle.value;
        if (key === 'r') repeat.value = !repeat.value;
        if (key === 'arrowright') seek(position.value + 5);
        if (key === 'arrowleft') seek(Math.max(0, position.value - 5));
        if (key === 'arrowup') setVolume(volume.value + 0.05);
        if (key === 'arrowdown') setVolume(volume.value - 0.05);
      }}
    >
      <div class="winamp-top">
        <span class="winamp-brand">WINAMP</span>
        <span class="winamp-mode">2.8</span>
        <span class="winamp-mini">{midiLoading.value ? 'MIDI...' : playing.value ? 'PLAY' : paused.value ? 'PAUSE' : 'STOP'}</span>
      </div>

      <div class="winamp-display">
        <div class="winamp-lcd">
          <div class="lcd-time">{formatTime(position.value)}</div>
          <div class="lcd-info">
            <span>{track ? (track.kind === 'midi' ? 'MIDI' : 'OGG') : '---'}</span>
            <span>{track ? '128 kbps' : '-- kbps'}</span>
            <span>44 kHz</span>
          </div>
          <div class="lcd-title">
            <span>{title}</span>
          </div>
          <div class="lcd-spectrum" aria-hidden="true">
            {spectrum.value.map((value, index) => (
              <i key={index} style={{ height: `${Math.max(2, value)}%` }} />
            ))}
          </div>
          <div class="lcd-mode">{visualizer.value.toUpperCase()}</div>
        </div>
      </div>

      <div class="winamp-scrub">
        <input
          type="range"
          min="0"
          max={Math.max(1, duration.value)}
          step="0.1"
          value={Math.min(position.value, Math.max(1, duration.value))}
          onInput={(event) => seek(Number((event.target as HTMLInputElement).value))}
          aria-label="Seek"
        />
        <span>{formatTime(duration.value)}</span>
      </div>

      <div class="winamp-controls">
        <div class="winamp-transport">
          <button onClick={prev} title="Previous">|◄</button>
          <button onClick={playPause} title="Play / Pause">{playing.value ? '❚❚' : '►'}</button>
          <button onClick={stop} title="Stop">■</button>
          <button onClick={() => next()} title="Next">►|</button>
          <button onClick={() => openApp('computer', { path: ['Media'] })} title="Eject">⏏</button>
        </div>
        <div class="winamp-volume">
          <span>VOL</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume.value}
            onInput={(event) => setVolume(Number((event.target as HTMLInputElement).value))}
            aria-label="Volume"
          />
        </div>
      </div>

      <div class="winamp-toggles">
        <button class={shuffle.value ? 'on' : ''} onClick={() => (shuffle.value = !shuffle.value)} title="Shuffle">
          SHUF
        </button>
        <button class={repeat.value ? 'on' : ''} onClick={() => (repeat.value = !repeat.value)} title="Repeat">
          REP
        </button>
        <button onClick={() => openPanel('winamp-eq')} title="Equalizer">
          EQ
        </button>
        <button onClick={() => openPanel('winamp-playlist')} title="Playlist">
          PL
        </button>
        <button
          onClick={() => {
            const modes = ['spectrum', 'oscilloscope', 'off'] as const;
            const index = modes.indexOf(visualizer.value);
            visualizer.value = modes[(index + 1) % modes.length];
          }}
          title="Visualizer"
        >
          VIS
        </button>
        <button onClick={() => openApp('help')} title="About Winamp">
          ?
        </button>
      </div>
    </div>
  );
}
