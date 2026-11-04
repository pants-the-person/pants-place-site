import { useEffect, useState } from 'preact/hooks';
import { activeWindowId, minimizeWindow, restoreWindow, focusWindow, windows, openApp } from '../../kernel/windows';
import { startMenuOpen } from '../../kernel/windows';
import { playSound } from '../../kernel/audio';
import { volume, setVolume } from '../../kernel/player';
import { settings } from '../../kernel/settings';

export default function Taskbar({ onStart }: { onStart: () => void }) {
  const [now, setNow] = useState(new Date());
  const [trayOpen, setTrayOpen] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(timer);
  }, []);

  const time = now.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    hour12: !settings.value.clock24,
  });

  function toggleWindow(id: string) {
    playSound('click');
    if (activeWindowId.value === id) {
      minimizeWindow(id);
    } else {
      const win = windows.value.find((w) => w.id === id);
      if (win?.mode === 'min') restoreWindow(id);
      else focusWindow(id);
    }
  }

  function showDesktop() {
    playSound('click');
    for (const win of windows.value) {
      if (win.mode !== 'min') minimizeWindow(win.id);
    }
  }

  return (
    <div class="taskbar">
      <button class={`start-button ${startMenuOpen.value ? 'open' : ''}`} onClick={onStart}>
        <img src="/icons/logo.svg" alt="" width="18" height="18" />
        Start
      </button>

      <div class="quick-launch" aria-label="Quick Launch">
        <button title="Launch Internet Explorer" onClick={() => openApp('ie')}>
          <img src="/icons/ie-16.svg" alt="" width="16" height="16" />
        </button>
        <button title="Launch Winamp" onClick={() => openApp('winamp')}>
          <img src="/icons/winamp-16.svg" alt="" width="16" height="16" />
        </button>
        <button title="Show Desktop" onClick={showDesktop}>
          <img src="/icons/folder-16.svg" alt="" width="16" height="16" />
        </button>
      </div>

      <div class="task-buttons">
        {windows.value.map((win) => (
            <button
              key={win.id}
              class={`task-button ${activeWindowId.value === win.id && win.mode !== 'min' ? 'active' : ''}`}
              onClick={() => toggleWindow(win.id)}
              title={win.title}
            >
              <img src={win.icon} alt="" width="16" height="16" />
              <span>{win.title}</span>
            </button>
          ))}
      </div>

      <div class="tray">
        <button title="Volume" onClick={() => setTrayOpen((v) => !v)}>
          <img src="/icons/volume.svg" alt="" width="16" height="16" />
        </button>
        <button title="Dial-Up Networking" onClick={() => openApp('ie')}>
          <img src="/icons/dial.svg" alt="" width="16" height="16" />
        </button>
        <span class="tray-clock" title={now.toDateString()}>
          {time}
        </span>
        {trayOpen ? (
          <div
            class="volume-popup"
            style={{
              position: 'fixed',
              right: '6px',
              bottom: '34px',
              width: '130px',
              padding: '8px',
              background: 'var(--surface)',
              boxShadow:
                'inset -1px -1px #000, inset 1px 1px #dfdfdf, inset -2px -2px #808080, inset 2px 2px #fff',
            }}
          >
            <label style={{ display: 'block', marginBottom: '4px' }}>Volume</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume.value}
              onInput={(event) => {
                setVolume(Number((event.target as HTMLInputElement).value));
              }}
              style={{ width: '100%' }}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
