import { useState } from 'preact/hooks';
import {
  currentIndex,
  currentTrack,
  formatTime,
  next,
  playIndex,
  playing,
  position,
  removeTrack,
  tracks,
} from '../../kernel/player';
import { openApp } from '../../kernel/windows';
import { playSound } from '../../kernel/audio';
import type { AppProps } from '../../kernel/types';

export default function WinampPlaylist({ api }: AppProps) {
  const [selected, setSelected] = useState(currentIndex.value >= 0 ? currentIndex.value : 0);
  const list = tracks.value;

  function playSelected() {
    if (!list.length) return;
    playSound('click');
    void playIndex(selected);
  }

  return (
    <div class="winamp-playlist">
      <div class="playlist-head">
        <span>WINAMP PLAYLIST</span>
        <span>{list.length} tracks</span>
      </div>
      <div class="playlist-list">
        {list.length === 0 ? (
          <div style={{ padding: '10px', color: '#00e000' }}>Playlist is empty. Drop files in public/media.</div>
        ) : (
          list.map((track, index) => (
            <button
              key={track.id + index}
              class={`playlist-row ${index === currentIndex.value ? 'playing' : ''} ${index === selected ? 'selected' : ''}`}
              onClick={() => setSelected(index)}
              onDblClick={() => {
                setSelected(index);
                playSound('click');
                void playIndex(index);
              }}
            >
              <span class="pl-index">{index + 1}.</span>
              <span class="pl-title">{track.title}</span>
              <span class="pl-time">{index === currentIndex.value ? formatTime(position.value) : '--:--'}</span>
              <span class="pl-kind">{track.kind === 'midi' ? 'MID' : 'OGG'}</span>
            </button>
          ))
        )}
      </div>
      <div class="playlist-actions">
        <button onClick={() => openApp('computer', { path: ['Media'] })}>ADD</button>
        <button onClick={() => removeTrack(selected)}>REM</button>
        <button onClick={playSelected}>PLAY</button>
        <button onClick={() => next()}>NEXT</button>
        <button onClick={() => api.close()}>CLOSE</button>
      </div>
      <div class="playlist-status">
        {playing.value ? '▶ Playing' : '■ Stopped'} — {currentTrack.value?.name ?? 'no track'}
      </div>
    </div>
  );
}
