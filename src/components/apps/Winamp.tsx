import { useEffect, useState } from 'preact/hooks';
import {
  currentIndex,
  currentTrack,
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
  stop,
  togglePlay,
  visualizer,
  volume,
  paused,
  playTrackById,
} from '../../kernel/player';
import { openApp, windows, closeWindow, minimizeWindow, restoreWindow, updateWindowBounds } from '../../kernel/windows';
import { showDialog } from '../../kernel/dialogs';
import { playSound } from '../../kernel/audio';
import type { AppProps } from '../../kernel/types';
import WinampDigits from './WinampDigits';

type DisplayMode = 'spectrum' | 'time';

export default function Winamp({ appProps, api, windowId }: AppProps) {
  const track = currentTrack.value;
  const [displayMode, setDisplayMode] = useState<DisplayMode>('spectrum');
  const [balance, setBalance] = useState(0);

  function openPanel(appId: 'winamp-playlist' | 'winamp-eq') {
    const host = windows.value.find((w) => w.id === windowId);
    if (!host) {
      openApp(appId);
      return;
    }
    const eq = windows.value.find((w) => w.appId === 'winamp-eq');
    const playlist = windows.value.find((w) => w.appId === 'winamp-playlist');
    const existing = appId === 'winamp-eq' ? eq : playlist;
    if (existing) {
      if (existing.mode === 'min') restoreWindow(existing.id);
      return;
    }
    const belowMain = host.y + host.h;
    if (appId === 'winamp-eq') {
      openApp(appId, {}, { x: host.x, y: Math.min(belowMain, window.innerHeight - 130) });
      if (playlist) updateWindowBounds(playlist.id, { y: Math.min(belowMain + 116, window.innerHeight - 240) });
      return;
    }
    const y = eq ? eq.y + eq.h : belowMain;
    openApp(appId, {}, { x: host.x, y: Math.min(y, window.innerHeight - 240) });
  }

  useEffect(() => {
    api.setTitle('Winamp');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    if (mediaId) playTrackById(mediaId);
  }, []);

  useEffect(() => {
    if (engineError.value) {
      void showDialog({
        title: 'Winamp',
        message: 'The audio engine could not start.',
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

  const title = track ? `${currentIndex.value + 1}. ${track.title}` : 'Pants Place Winamp';
  const titleTime = track ? `<${formatTime(position.value)}/${formatTime(duration.value)}>` : '';
  const isMidi = track?.kind === 'midi';

  return (
    <div
      class="wa wa-main"
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
      <div class="wa-titlebar" data-drag-handle>
        <button
          class="wa-title-button"
          style={{ left: '243px' }}
          title="Minimize"
          onClick={() => minimizeWindow(windowId)}
        />
        <button
          class="wa-title-button"
          style={{ left: '263px' }}
          title="Close"
          onClick={() => api.close()}
        />
      </div>

      <button
        class="wa-display"
        title={displayMode === 'spectrum' ? 'Switch to time display' : 'Switch to spectrum'}
        onClick={() => setDisplayMode((mode) => (mode === 'spectrum' ? 'time' : 'spectrum'))}
      >
        {displayMode === 'time' ? (
          <span class="wa-time-big">
            <WinampDigits value={formatTime(position.value)} />
          </span>
        ) : (
          <span class="wa-spectrum" aria-hidden="true">
            {spectrum.value.map((value, index) => (
              <i key={index} style={{ height: `${Math.max(2, value)}%` }} />
            ))}
          </span>
        )}
        <span class={`wa-play-indicator ${playing.value ? 'playing' : paused.value ? 'paused' : 'stopped'}`} />
      </button>

      <div class="wa-titleline">
        <span class="wa-track-title">{title}</span>
        <span class="wa-track-time">{titleTime}</span>
      </div>

      <div class="wa-meta">
        <span class="wa-meta-box wa-kbps">{track ? (isMidi ? '128' : '128') : '--'}</span>
        <span class="wa-meta-box wa-khz">{track ? '44' : '--'}</span>
      </div>

      <div class="wa-slider-row">
        <input
          class="wa-slider wa-volume"
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={volume.value}
          onInput={(event) => setVolume(Number((event.target as HTMLInputElement).value))}
          aria-label="Volume"
        />
        <input
          class="wa-slider wa-balance"
          type="range"
          min="-1"
          max="1"
          step="0.01"
          value={balance}
          onInput={(event) => setBalance(Number((event.target as HTMLInputElement).value))}
          aria-label="Balance"
        />
      </div>
      <button class={`wa-toggle wa-eq-toggle ${windows.value.some((w) => w.appId === 'winamp-eq') ? 'on' : ''}`} onClick={() => openPanel('winamp-eq')} title="Equalizer" />
      <button class={`wa-toggle wa-pl-toggle ${windows.value.some((w) => w.appId === 'winamp-playlist') ? 'on' : ''}`} onClick={() => openPanel('winamp-playlist')} title="Playlist" />

      <div class="wa-seek">
        <input
          type="range"
          min="0"
          max={Math.max(1, duration.value)}
          step="0.1"
          value={Math.min(position.value, Math.max(1, duration.value))}
          onInput={(event) => seek(Number((event.target as HTMLInputElement).value))}
          aria-label="Seek"
        />
      </div>

      <div class="wa-transport">
        <button class="wa-cbutton wa-prev" onClick={prev} title="Previous" />
        <button class="wa-cbutton wa-play" onClick={playPause} title={playing.value ? 'Pause' : 'Play'} />
        <button class="wa-cbutton wa-pause" onClick={pause} title="Pause" />
        <button class="wa-cbutton wa-stop" onClick={stop} title="Stop" />
        <button class="wa-cbutton wa-next" onClick={() => next()} title="Next" />
        <button class="wa-cbutton wa-eject" onClick={() => openApp('computer', { path: ['Media'] })} title="Eject" />
      </div>

      <button class={`wa-shuffle ${shuffle.value ? 'on' : ''}`} onClick={() => (shuffle.value = !shuffle.value)} title="Shuffle" />
      <button class={`wa-repeat ${repeat.value ? 'on' : ''}`} onClick={() => (repeat.value = !repeat.value)} title="Repeat" />

      <span class="wa-build">{midiLoading.value ? 'MIDI' : visualizer.value === 'off' ? 'VIS OFF' : '2.91'}</span>
    </div>
  );
}
