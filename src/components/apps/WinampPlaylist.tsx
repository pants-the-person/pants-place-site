import { useEffect, useRef, useState } from 'preact/hooks';
import {
  addFileTracks,
  currentIndex,
  currentTrack,
  duration,
  formatTime,
  next,
  pause,
  playIndex,
  playing,
  position,
  prev,
  removeTrack,
  stop,
  togglePlay,
  tracks,
} from '../../kernel/player';
import { openApp, minimizeWindow } from '../../kernel/windows';
import { openContextMenu } from '../../kernel/menu';
import { showDialog } from '../../kernel/dialogs';
import { playSound } from '../../kernel/audio';
import type { AppProps } from '../../kernel/types';
import WinampDigits from './WinampDigits';

export default function WinampPlaylist({ api, windowId }: AppProps) {
  const list = tracks.value;
  const [selected, setSelected] = useState<number[]>(
    currentIndex.value >= 0 ? [currentIndex.value] : [],
  );
  const fileRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (currentIndex.value < 0) return;
    setSelected([currentIndex.value]);
    const row = listRef.current?.querySelector<HTMLElement>('[data-playing="true"]');
    row?.scrollIntoView({ block: 'nearest' });
  }, [currentIndex.value, list.length]);

  function selectRow(index: number, event: MouseEvent) {
    if (event.ctrlKey || event.metaKey) {
      setSelected((current) =>
        current.includes(index) ? current.filter((item) => item !== index) : [...current, index],
      );
      return;
    }
    if (event.shiftKey && selected.length) {
      const start = Math.min(selected[selected.length - 1], index);
      const end = Math.max(selected[selected.length - 1], index);
      setSelected(Array.from({ length: end - start + 1 }, (_, offset) => start + offset));
      return;
    }
    setSelected([index]);
  }

  function playSelected() {
    if (!list.length) return;
    const index = selected[0] ?? 0;
    playSound('click');
    void playIndex(index);
  }

  function playRow(index: number) {
    setSelected([index]);
    playSound('click');
    void playIndex(index);
  }

  function removeSelected() {
    if (!selected.length) return;
    playSound('click');
    [...selected].sort((a, b) => b - a).forEach((index) => removeTrack(index));
    setSelected([]);
  }

  function addFiles(files: File[]) {
    if (!files.length) return;
    const start = tracks.value.length;
    addFileTracks(files);
    playSound('click');
    setSelected([start]);
  }

  function pickFiles(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    addFiles(files);
  }

  function drop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    addFiles(Array.from(event.dataTransfer?.files ?? []));
  }

  function rowMenu(index: number, event: MouseEvent) {
    event.stopPropagation();
    setSelected([index]);
    openContextMenu(event, [
      { label: 'Play', action: () => playRow(index) },
      { label: 'Remove', action: () => removeTrack(index) },
      { separator: true },
      {
        label: 'Properties',
        action: () =>
          void showDialog({
            title: `${list[index]?.name ?? 'Track'} Properties`,
            message: list[index]?.title ?? '',
            detail: `${list[index]?.name ?? ''}\n${Math.ceil((list[index]?.size ?? 0) / 1024)} KB\n${list[index]?.kind === 'midi' ? 'MIDI' : 'Audio'}`,
            icon: '/icons/winamp.svg',
          }),
      },
    ]);
  }

  function miscMenu(event: MouseEvent) {
    event.stopPropagation();
    openContextMenu(event, [
      {
        label: 'Sort by title',
        action: () => {
          tracks.value = [...tracks.value].sort((a, b) => a.title.localeCompare(b.title));
          setSelected([]);
        },
      },
      {
        label: 'Reverse order',
        action: () => {
          tracks.value = [...tracks.value].reverse();
          setSelected([]);
        },
      },
      {
        label: 'Remove duplicates',
        action: () => {
          const seen = new Set<string>();
          tracks.value = tracks.value.filter((track) => {
            const key = `${track.name}:${track.size}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          setSelected([]);
        },
      },
      {
        label: 'Clear playlist',
        action: () => {
          tracks.value = [];
          setSelected([]);
          stop();
        },
      },
    ]);
  }

  const current = currentTrack.value;
  const total = formatTime(duration.value || 0);

  return (
    <div
      class="wa wa-playlist"
      onDragOver={(event) => event.preventDefault()}
      onDrop={drop}
    >
      <div class="wa-pl-titlebar" data-drag-handle>
        <span class="wa-pl-title">WINAMP PLAYLIST</span>
        <button
          class="wa-title-button wa-pl-min"
          title="Minimize"
          onClick={() => minimizeWindow(windowId)}
        />
        <button class="wa-title-button wa-pl-close" title="Close" onClick={() => api.close()} />
      </div>

      <div class="wa-pl-list" ref={listRef}>
        {list.length === 0 ? (
          <div class="wa-pl-empty">Playlist is empty. Use ADD or drop audio files here.</div>
        ) : (
          list.map((track, index) => (
            <button
              key={`${track.id}-${index}`}
              class={`wa-pl-row ${selected.includes(index) ? 'selected' : ''} ${index === currentIndex.value ? 'playing' : ''}`}
              data-playing={index === currentIndex.value ? 'true' : 'false'}
              onClick={(event) => selectRow(index, event)}
              onDblClick={() => playRow(index)}
              onContextMenu={(event) => rowMenu(index, event)}
            >
              <span class="wa-pl-num">{index + 1}.</span>
              <span class="wa-pl-name">{track.title}</span>
              <span class="wa-pl-duration">
                {index === currentIndex.value ? formatTime(Math.max(0, duration.value - position.value)) : '--:--'}
              </span>
            </button>
          ))
        )}
      </div>

      <div class="wa-pl-footer">
        <div class="wa-pl-buttons">
          <button class="wa-pl-button" onClick={() => fileRef.current?.click()}>ADD</button>
          <button class="wa-pl-button" onClick={removeSelected}>REM</button>
          <button class="wa-pl-button" onClick={() => setSelected(list.map((_, index) => index))}>SEL</button>
          <button class="wa-pl-button" onClick={miscMenu}>MISC</button>
        </div>
        <div class="wa-pl-time">
          <WinampDigits value={`${formatTime(position.value)}/${total}`} />
          <span class="wa-pl-status">{playing.value ? 'play' : current ? 'stop' : ':'}</span>
        </div>
        <button
          class="wa-pl-button wa-list-opts"
          onClick={() =>
            void showDialog({
              title: 'Winamp Playlist',
              message: 'Playlist Editor',
              detail: `${list.length} track(s)\nDouble-click a track to play.\nUse ADD or drop files to build the queue.`,
              icon: '/icons/winamp.svg',
            })
          }
        >
          LIST
          <br />
          OPTS
        </button>
      </div>

      <div class="wa-pl-mini-transport">
        <button onClick={prev} title="Previous">|◄</button>
        <button onClick={togglePlay} title="Play / Pause">{playing.value ? '❚❚' : '►'}</button>
        <button onClick={pause} title="Pause">❚❚</button>
        <button onClick={stop} title="Stop">■</button>
        <button onClick={() => next()} title="Next">►|</button>
        <button onClick={() => openApp('computer', { path: ['Media'] })} title="Add from Media">⏏</button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".mid,.midi,.ogg,.oga,.opus,.mp3,.wav,.flac,.m4a,.aac,audio/*"
        multiple
        style={{ display: 'none' }}
        onChange={pickFiles}
      />
    </div>
  );
}
